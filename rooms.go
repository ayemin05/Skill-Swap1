package main

// rooms.go — live rooms. The first kind is a watch-together room:
// everyone in the room sees the same YouTube video at the same moment,
// chats beside it, and can send emoji reactions.
//
// Real-time updates use Server-Sent Events (SSE): the browser keeps one
// GET /api/rooms/{id}/events connection open and the server pushes JSON
// events down it. Actions (chat, play, pause…) are normal POST requests.
// SSE is plain HTTP, needs no extra library and works through Fly.io's proxy.

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

func initRoomsDB() {
	schema := `
	CREATE TABLE IF NOT EXISTS rooms (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		group_id    INTEGER DEFAULT 0,
		name        TEXT    NOT NULL,
		kind        TEXT    NOT NULL DEFAULT 'watch',
		created_by  INTEGER NOT NULL,
		video_id    TEXT    DEFAULT '',
		video_title TEXT    DEFAULT '',
		is_playing  INTEGER DEFAULT 0,
		position    REAL    DEFAULT 0,
		state_at    INTEGER DEFAULT 0,
		created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS room_messages (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		room_id    INTEGER NOT NULL,
		user_id    INTEGER NOT NULL,
		content    TEXT    NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_room_messages ON room_messages(room_id, id);
	`
	if _, err := db.Exec(schema); err != nil {
		log.Fatal("failed to create rooms schema:", err)
	}
	// Study-room focus timer (shared by everyone in the room)
	db.Exec("ALTER TABLE rooms ADD COLUMN timer_mode TEXT DEFAULT 'focus'")
	db.Exec("ALTER TABLE rooms ADD COLUMN timer_running INTEGER DEFAULT 0")
	db.Exec("ALTER TABLE rooms ADD COLUMN timer_ends INTEGER DEFAULT 0")
	db.Exec("ALTER TABLE rooms ADD COLUMN timer_left INTEGER DEFAULT 0")
	db.Exec("ALTER TABLE rooms ADD COLUMN focus_min INTEGER DEFAULT 25")
	db.Exec("ALTER TABLE rooms ADD COLUMN break_min INTEGER DEFAULT 5")
	db.Exec("ALTER TABLE rooms ADD COLUMN description TEXT DEFAULT ''")
}

// ── Study timer ─────────────────────────────────────────────

type StudyTimer struct {
	Mode     string `json:"mode"`      // focus | break
	Running  bool   `json:"running"`
	EndsAt   int64  `json:"ends_at"`   // server ms when the current block ends (if running)
	LeftMs   int64  `json:"left_ms"`   // time left when paused
	FocusMin int    `json:"focus_min"`
	BreakMin int    `json:"break_min"`
	By       string `json:"by"`
	Action   string `json:"action"`
}

func (t StudyTimer) blockMs(mode string) int64 {
	if mode == "break" {
		return int64(t.BreakMin) * 60000
	}
	return int64(t.FocusMin) * 60000
}

// advance rolls focus → break → focus automatically while the timer runs,
// so everyone agrees on the phase without any client having to trigger it.
func (t StudyTimer) advance() StudyTimer {
	if !t.Running || t.EndsAt == 0 {
		return t
	}
	now := nowMs()
	for i := 0; now >= t.EndsAt && i < 1000; i++ {
		if t.Mode == "focus" {
			t.Mode = "break"
		} else {
			t.Mode = "focus"
		}
		t.EndsAt += t.blockMs(t.Mode)
	}
	return t
}

func loadTimer(roomID int) StudyTimer {
	var t StudyTimer
	var running int
	db.QueryRow(`SELECT COALESCE(timer_mode,'focus'), COALESCE(timer_running,0), COALESCE(timer_ends,0),
		COALESCE(timer_left,0), COALESCE(focus_min,25), COALESCE(break_min,5) FROM rooms WHERE id=?`, roomID).
		Scan(&t.Mode, &running, &t.EndsAt, &t.LeftMs, &t.FocusMin, &t.BreakMin)
	t.Running = running == 1
	if t.LeftMs == 0 && !t.Running {
		t.LeftMs = t.blockMs(t.Mode)
	}
	return t.advance()
}

func saveTimer(roomID int, t StudyTimer) {
	running := 0
	if t.Running {
		running = 1
	}
	db.Exec(`UPDATE rooms SET timer_mode=?, timer_running=?, timer_ends=?, timer_left=?, focus_min=?, break_min=? WHERE id=?`,
		t.Mode, running, t.EndsAt, t.LeftMs, t.FocusMin, t.BreakMin, roomID)
}

// ── Live connections ────────────────────────────────────────

type roomClient struct {
	ch       chan []byte
	clientID string
	user     Author
}

type roomHub struct {
	mu    sync.Mutex
	rooms map[int]map[*roomClient]bool
}

var hub = &roomHub{rooms: map[int]map[*roomClient]bool{}}

func (h *roomHub) add(roomID int, c *roomClient) {
	h.mu.Lock()
	if h.rooms[roomID] == nil {
		h.rooms[roomID] = map[*roomClient]bool{}
	}
	h.rooms[roomID][c] = true
	h.mu.Unlock()
}

func (h *roomHub) remove(roomID int, c *roomClient) {
	h.mu.Lock()
	delete(h.rooms[roomID], c)
	if len(h.rooms[roomID]) == 0 {
		delete(h.rooms, roomID)
	}
	h.mu.Unlock()
}

// viewers returns each person in the room once, even if they have two tabs open.
func (h *roomHub) viewers(roomID int) []Author {
	h.mu.Lock()
	defer h.mu.Unlock()
	seen := map[int]bool{}
	list := []Author{}
	for c := range h.rooms[roomID] {
		if !seen[c.user.ID] {
			seen[c.user.ID] = true
			list = append(list, c.user)
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Name < list[j].Name })
	return list
}

func (h *roomHub) count(roomID int) int { return len(h.viewers(roomID)) }

func (h *roomHub) broadcast(roomID int, event string, data interface{}) {
	payload, _ := json.Marshal(map[string]interface{}{"type": event, "data": data})
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.rooms[roomID] {
		select {
		case c.ch <- payload:
		default: // slow connection — skip rather than block everyone else
		}
	}
}

// ── Models ──────────────────────────────────────────────────

type PlaybackState struct {
	VideoID    string  `json:"video_id"`
	VideoTitle string  `json:"video_title"`
	Playing    bool    `json:"playing"`
	Position   float64 `json:"position"` // seconds into the video at StateAt
	StateAt    int64   `json:"state_at"` // server time in ms when this state was set
	By         string  `json:"by"`       // name of who made the change
	ClientID   string  `json:"client_id"`
	Action     string  `json:"action"`
}

type Room struct {
	ID        int           `json:"id"`
	GroupID   int           `json:"group_id"`
	GroupName string        `json:"group_name"`
	GroupMy   string        `json:"group_name_my"`
	Name      string        `json:"name"`
	Kind      string        `json:"kind"`
	CreatedBy int           `json:"created_by"`
	HostName  string        `json:"host_name"`
	State     PlaybackState `json:"state"`
	Timer     *StudyTimer   `json:"timer,omitempty"`
	Desc      string        `json:"description"`
	Live      int           `json:"live"`
	Viewers   []Author      `json:"viewers,omitempty"`
	CanDelete bool          `json:"can_delete"`
}

type RoomMessage struct {
	ID        int    `json:"id"`
	Author    Author `json:"author"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
}

const roomSelect = `
	SELECT r.id, r.group_id, COALESCE(g.name,''), COALESCE(g.name_my,''), r.name, r.kind, r.created_by,
	       COALESCE(u.name,''), r.video_id, r.video_title, r.is_playing, r.position, r.state_at,
	       COALESCE(r.description,'')
	FROM rooms r
	LEFT JOIN groups_ g ON g.id = r.group_id
	LEFT JOIN users u ON u.id = r.created_by`

func loadRooms(viewerID int, where string, args ...interface{}) []Room {
	rows, err := db.Query(roomSelect+" "+where, args...)
	list := []Room{}
	if err != nil {
		return list
	}
	defer rows.Close()
	admin := viewerID > 0 && isAdmin(viewerID)
	for rows.Next() {
		var r Room
		var playing int
		rows.Scan(&r.ID, &r.GroupID, &r.GroupName, &r.GroupMy, &r.Name, &r.Kind, &r.CreatedBy,
			&r.HostName, &r.State.VideoID, &r.State.VideoTitle, &playing, &r.State.Position, &r.State.StateAt, &r.Desc)
		r.State.Playing = playing == 1
		if r.Kind == "study" {
			t := loadTimer(r.ID)
			r.Timer = &t
		}
		r.Live = hub.count(r.ID)
		r.CanDelete = viewerID > 0 && (viewerID == r.CreatedBy || admin)
		list = append(list, r)
	}
	return list
}

func nowMs() int64 { return time.Now().UnixMilli() }

// currentPosition works out where the video is right now from the stored state.
func (s PlaybackState) currentPosition() float64 {
	if !s.Playing || s.StateAt == 0 {
		return s.Position
	}
	return s.Position + float64(nowMs()-s.StateAt)/1000
}

func saveState(roomID int, s PlaybackState) {
	playing := 0
	if s.Playing {
		playing = 1
	}
	db.Exec(`UPDATE rooms SET video_id=?, video_title=?, is_playing=?, position=?, state_at=? WHERE id=?`,
		s.VideoID, s.VideoTitle, playing, s.Position, s.StateAt, roomID)
}

// ── YouTube helpers ─────────────────────────────────────────

var ytIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)

// parseYouTubeID accepts youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/ links or a bare ID.
func parseYouTubeID(raw string) string {
	raw = strings.TrimSpace(raw)
	if ytIDRe.MatchString(raw) {
		return raw
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	host := strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
	host = strings.TrimPrefix(host, "m.")
	var id string
	switch host {
	case "youtu.be":
		id = strings.Trim(u.Path, "/")
	case "youtube.com", "music.youtube.com", "youtube-nocookie.com":
		if v := u.Query().Get("v"); v != "" {
			id = v
		} else {
			parts := strings.Split(strings.Trim(u.Path, "/"), "/")
			if len(parts) >= 2 && (parts[0] == "shorts" || parts[0] == "embed" || parts[0] == "live") {
				id = parts[1]
			}
		}
	}
	if ytIDRe.MatchString(id) {
		return id
	}
	return ""
}

// fetchYouTubeTitle asks YouTube's public oEmbed endpoint for the video title.
func fetchYouTubeTitle(id string) string {
	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := client.Get("https://www.youtube.com/oembed?format=json&url=" +
		url.QueryEscape("https://www.youtube.com/watch?v="+id))
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return ""
	}
	var data struct {
		Title string `json:"title"`
	}
	json.NewDecoder(io.LimitReader(resp.Body, 64*1024)).Decode(&data)
	return trimLimit(data.Title, 200)
}

// ── Handlers ────────────────────────────────────────────────

// GET  /api/rooms?group=ID  — rooms, busiest first
// POST /api/rooms           — create {name, group_id, video_url}
func handleRooms(w http.ResponseWriter, r *http.Request) {
	viewerID, _ := getUserFromToken(r)
	switch r.Method {
	case http.MethodGet:
		groupID, _ := strconv.Atoi(r.URL.Query().Get("group"))
		var rooms []Room
		if groupID > 0 {
			ensureLounge(groupID)
			rooms = loadRooms(viewerID, "WHERE r.group_id = ? ORDER BY r.created_by = 0 DESC, r.id DESC", groupID)
		} else {
			rooms = loadRooms(viewerID, "ORDER BY r.id DESC LIMIT 100")
		}
		sort.SliceStable(rooms, func(i, j int) bool { return rooms[i].Live > rooms[j].Live })
		jsonOK(w, rooms)

	case http.MethodPost:
		userID, ok := requireAuth(w, r)
		if !ok {
			return
		}
		if isBanned(userID) {
			jsonError(w, "Your account is banned", 403)
			return
		}
		var body struct {
			Name        string `json:"name"`
			Kind        string `json:"kind"`
			Description string `json:"description"`
			GroupID     int    `json:"group_id"`
			VideoURL    string `json:"video_url"`
		}
		decodeJSON(r, &body)
		name := trimLimit(body.Name, 60)
		if name == "" {
			u, _ := loadUser(userID)
			name = strings.Split(u.Name, " ")[0] + "'s room"
		}
		if body.GroupID > 0 {
			var n int
			db.QueryRow("SELECT COUNT(*) FROM groups_ WHERE id=?", body.GroupID).Scan(&n)
			if n == 0 {
				body.GroupID = 0
			}
		}
		videoID := ""
		if strings.TrimSpace(body.VideoURL) != "" {
			if videoID = parseYouTubeID(body.VideoURL); videoID == "" {
				jsonError(w, "That doesn't look like a YouTube link", 400)
				return
			}
		}
		kind := body.Kind
		if kind != "study" && kind != "hangout" {
			kind = "watch"
		}
		res, err := db.Exec(`INSERT INTO rooms (group_id, name, kind, created_by, video_id, state_at, description) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			body.GroupID, name, kind, userID, videoID, nowMs(), trimLimit(body.Description, 200))
		if err != nil {
			jsonError(w, "Could not create room", 500)
			return
		}
		id, _ := res.LastInsertId()
		if videoID != "" {
			go func() {
				if title := fetchYouTubeTitle(videoID); title != "" {
					db.Exec("UPDATE rooms SET video_title=? WHERE id=? AND video_id=?", title, id, videoID)
				}
			}()
		}
		jsonOK(w, loadRooms(userID, "WHERE r.id = ?", id)[0])

	default:
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// Routes under /api/rooms/{id}
func handleRoomRoutes(w http.ResponseWriter, r *http.Request) {
	roomID, sub := pathID(r.URL.Path, "/api/rooms/")
	viewerID, _ := getUserFromToken(r)
	rooms := loadRooms(viewerID, "WHERE r.id = ?", roomID)
	if len(rooms) == 0 {
		jsonError(w, "Room not found", 404)
		return
	}
	room := rooms[0]

	switch {
	case sub == "" && r.Method == http.MethodGet:
		room.Viewers = hub.viewers(roomID)
		jsonOK(w, map[string]interface{}{
			"room":     room,
			"messages": recentRoomMessages(roomID, 60),
			"now":      nowMs(),
		})

	case sub == "" && r.Method == http.MethodDelete:
		if !room.CanDelete {
			jsonError(w, "Only the host or an admin can close this room", 403)
			return
		}
		hub.broadcast(roomID, "closed", nil)
		removeRoomFile(room.State.VideoID)
		db.Exec("DELETE FROM room_messages WHERE room_id=?", roomID)
		db.Exec("DELETE FROM rooms WHERE id=?", roomID)
		jsonOK(w, map[string]string{"status": "deleted"})

	case sub == "events" && r.Method == http.MethodGet:
		streamRoom(w, r, room)

	case sub == "messages" && r.Method == http.MethodPost:
		userID, ok := requireRoomUser(w, r)
		if !ok {
			return
		}
		var body struct {
			Content string `json:"content"`
		}
		decodeJSON(r, &body)
		content := trimLimit(body.Content, 500)
		if content == "" {
			jsonError(w, "Message can't be empty", 400)
			return
		}
		res, err := db.Exec("INSERT INTO room_messages (room_id, user_id, content) VALUES (?, ?, ?)", roomID, userID, content)
		if err != nil {
			jsonError(w, "Could not send", 500)
			return
		}
		id, _ := res.LastInsertId()
		u, _ := loadUser(userID)
		msg := RoomMessage{ID: int(id), Content: content, CreatedAt: time.Now().UTC().Format(time.RFC3339),
			Author: Author{ID: u.ID, Name: u.Name, Avatar: u.Avatar}}
		hub.broadcast(roomID, "message", msg)
		jsonOK(w, msg)

	case sub == "react" && r.Method == http.MethodPost:
		userID, ok := requireRoomUser(w, r)
		if !ok {
			return
		}
		var body struct {
			Emoji string `json:"emoji"`
		}
		decodeJSON(r, &body)
		allowed := map[string]bool{"❤️": true, "😂": true, "😮": true, "😢": true, "🔥": true, "👏": true}
		if !allowed[body.Emoji] {
			jsonError(w, "Unknown reaction", 400)
			return
		}
		u, _ := loadUser(userID)
		hub.broadcast(roomID, "react", map[string]interface{}{"emoji": body.Emoji, "name": u.Name})
		jsonOK(w, map[string]string{"status": "ok"})

	case sub == "video" && r.Method == http.MethodPost:
		userID, ok := requireRoomUser(w, r)
		if !ok {
			return
		}
		var body struct {
			URL      string `json:"url"`
			ClientID string `json:"client_id"`
		}
		decodeJSON(r, &body)
		id := parseYouTubeID(body.URL)
		if id == "" {
			jsonError(w, "That doesn't look like a YouTube link", 400)
			return
		}
		removeRoomFile(room.State.VideoID)
		u, _ := loadUser(userID)
		s := PlaybackState{VideoID: id, Playing: true, Position: 0, StateAt: nowMs(),
			By: u.Name, ClientID: body.ClientID, Action: "video"}
		saveState(roomID, s)
		hub.broadcast(roomID, "state", s)
		// Look up the title in the background, then tell everyone
		go func() {
			if title := fetchYouTubeTitle(id); title != "" {
				db.Exec("UPDATE rooms SET video_title=? WHERE id=? AND video_id=?", title, roomID, id)
				hub.broadcast(roomID, "title", map[string]string{"video_id": id, "title": title})
			}
		}()
		jsonOK(w, s)

	case sub == "call" && r.Method == http.MethodPost:
		userID, ok := requireRoomUser(w, r)
		if !ok {
			return
		}
		writeCallToken(w, roomCallName(roomID), userID)

	case sub == "timer" && r.Method == http.MethodPost:
		userID, ok := requireRoomUser(w, r)
		if !ok {
			return
		}
		if room.Kind != "study" {
			jsonError(w, "Only study rooms have a timer", 400)
			return
		}
		var body struct {
			Action   string `json:"action"` // start | pause | reset | skip | set
			FocusMin int    `json:"focus_min"`
			BreakMin int    `json:"break_min"`
		}
		decodeJSON(r, &body)
		t := loadTimer(roomID)
		now := nowMs()
		switch body.Action {
		case "start":
			if !t.Running {
				left := t.LeftMs
				if left <= 0 {
					left = t.blockMs(t.Mode)
				}
				t.Running, t.EndsAt = true, now+left
			}
		case "pause":
			if t.Running {
				t.Running, t.LeftMs = false, t.EndsAt-now
			}
		case "reset":
			t.Running, t.Mode, t.EndsAt = false, "focus", 0
			t.LeftMs = t.blockMs("focus")
		case "skip":
			if t.Mode == "focus" {
				t.Mode = "break"
			} else {
				t.Mode = "focus"
			}
			if t.Running {
				t.EndsAt = now + t.blockMs(t.Mode)
			} else {
				t.LeftMs = t.blockMs(t.Mode)
			}
		case "set":
			if body.FocusMin < 1 || body.FocusMin > 180 || body.BreakMin < 1 || body.BreakMin > 60 {
				jsonError(w, "Focus 1–180 min, break 1–60 min", 400)
				return
			}
			t.FocusMin, t.BreakMin = body.FocusMin, body.BreakMin
			t.Running, t.Mode, t.EndsAt, t.LeftMs = false, "focus", 0, int64(body.FocusMin)*60000
		default:
			jsonError(w, "Unknown action", 400)
			return
		}
		u, _ := loadUser(userID)
		t.By, t.Action = u.Name, body.Action
		saveTimer(roomID, t)
		hub.broadcast(roomID, "timer", t)
		jsonOK(w, t)

	case sub == "upload" && r.Method == http.MethodPost:
		handleRoomUpload(w, r, room)

	case sub == "control" && r.Method == http.MethodPost:
		userID, ok := requireRoomUser(w, r)
		if !ok {
			return
		}
		var body struct {
			Action   string  `json:"action"` // play | pause | seek
			Position float64 `json:"position"`
			ClientID string  `json:"client_id"`
		}
		decodeJSON(r, &body)
		s := room.State
		if s.VideoID == "" {
			jsonError(w, "Add a video first", 400)
			return
		}
		if body.Position < 0 || body.Position > 24*3600 {
			body.Position = s.currentPosition()
		}
		switch body.Action {
		case "play":
			s.Playing = true
		case "pause":
			s.Playing = false
		case "seek":
		default:
			jsonError(w, "Unknown action", 400)
			return
		}
		u, _ := loadUser(userID)
		s.Position, s.StateAt, s.By, s.ClientID, s.Action = body.Position, nowMs(), u.Name, body.ClientID, body.Action
		saveState(roomID, s)
		hub.broadcast(roomID, "state", s)
		jsonOK(w, s)

	default:
		jsonError(w, "Not found", 404)
	}
}

func requireRoomUser(w http.ResponseWriter, r *http.Request) (int, bool) {
	userID, ok := requireAuth(w, r)
	if !ok {
		return 0, false
	}
	if isBanned(userID) {
		jsonError(w, "Your account is banned", 403)
		return 0, false
	}
	return userID, true
}

func recentRoomMessages(roomID, limit int) []RoomMessage {
	rows, err := db.Query(`
		SELECT * FROM (
			SELECT m.id, m.user_id, u.name, u.avatar, m.content, m.created_at
			FROM room_messages m JOIN users u ON u.id = m.user_id
			WHERE m.room_id = ? AND COALESCE(u.is_banned,0) = 0
			ORDER BY m.id DESC LIMIT ?
		) ORDER BY id ASC`, roomID, limit)
	list := []RoomMessage{}
	if err != nil {
		return list
	}
	defer rows.Close()
	for rows.Next() {
		var m RoomMessage
		rows.Scan(&m.ID, &m.Author.ID, &m.Author.Name, &m.Author.Avatar, &m.Content, &m.CreatedAt)
		list = append(list, m)
	}
	return list
}

// streamRoom keeps the SSE connection open and pushes room events to this viewer.
func streamRoom(w http.ResponseWriter, r *http.Request, room Room) {
	userID, ok := requireRoomUser(w, r)
	if !ok {
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, "Streaming not supported", 500)
		return
	}
	u, err := loadUser(userID)
	if err != nil {
		jsonError(w, "User not found", 404)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	c := &roomClient{ch: make(chan []byte, 32), clientID: r.URL.Query().Get("client_id"),
		user: Author{ID: u.ID, Name: u.Name, Avatar: u.Avatar}}
	before := hub.count(room.ID)
	hub.add(room.ID, c)
	defer func() {
		hub.remove(room.ID, c)
		hub.broadcast(room.ID, "viewers", hub.viewers(room.ID))
		// When the last person leaves, freeze the video where it was
		if hub.count(room.ID) == 0 {
			if latest := loadRooms(0, "WHERE r.id = ?", room.ID); len(latest) == 1 && latest[0].State.Playing {
				s := latest[0].State
				s.Position, s.Playing, s.StateAt = s.currentPosition(), false, nowMs()
				saveState(room.ID, s)
			}
		}
	}()

	// First event: server clock (for sync), current state and who's here
	latest := loadRooms(userID, "WHERE r.id = ?", room.ID)[0]
	hello, _ := json.Marshal(map[string]interface{}{"type": "hello", "data": map[string]interface{}{
		"now": nowMs(), "state": latest.State, "viewers": hub.viewers(room.ID)}})
	fmt.Fprintf(w, "retry: 3000\ndata: %s\n\n", hello)
	flusher.Flush()
	if hub.count(room.ID) != before {
		hub.broadcast(room.ID, "viewers", hub.viewers(room.ID))
	}

	ping := time.NewTicker(20 * time.Second) // keeps proxies from closing an idle stream
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case msg := <-c.ch:
			fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()
		case <-ping.C:
			fmt.Fprintf(w, "data: {\"type\":\"ping\",\"data\":%d}\n\n", nowMs())
			flusher.Flush()
		}
	}
}

// deleteRoomData removes a user's rooms and room messages (used on account deletion).
func deleteRoomData(userID int) {
	db.Exec("DELETE FROM room_messages WHERE user_id=?", userID)
	db.Exec("DELETE FROM room_messages WHERE room_id IN (SELECT id FROM rooms WHERE created_by=?)", userID)
	db.Exec("DELETE FROM rooms WHERE created_by=?", userID)
}

// ── Own video files ─────────────────────────────────────────
// A host can upload a video file they have the right to share. It's stored in the
// upload folder and played with the browser's <video> player, synced the same way
// as YouTube. VideoID is "file:/uploads/<name>" for these.

const maxVideoBytes = 400 << 20 // 400 MB — keep an eye on the Fly volume size

func removeRoomFile(videoID string) {
	if strings.HasPrefix(videoID, "file:/uploads/") {
		os.Remove(filepath.Join(uploadDir, filepath.Base(strings.TrimPrefix(videoID, "file:"))))
	}
}

func handleRoomUpload(w http.ResponseWriter, r *http.Request, room Room) {
	userID, ok := requireRoomUser(w, r)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxVideoBytes+1<<20)
	reader, err := r.MultipartReader()
	if err != nil {
		jsonError(w, "Upload a video file", 400)
		return
	}
	var part interface {
		io.Reader
		FileName() string
	}
	clientID := ""
	for {
		p, err := reader.NextPart()
		if err != nil {
			jsonError(w, "Upload a video file", 400)
			return
		}
		if p.FormName() == "client_id" {
			b, _ := io.ReadAll(io.LimitReader(p, 64))
			clientID = string(b)
			continue
		}
		if p.FormName() == "video" {
			part = p
			break
		}
	}

	// Check the first bytes really are a browser-playable video
	head := make([]byte, 512)
	n, _ := io.ReadFull(part, head)
	head = head[:n]
	ext := ""
	switch ct := http.DetectContentType(head); {
	case ct == "video/mp4":
		ext = ".mp4"
	case ct == "video/webm":
		ext = ".webm"
	default:
		jsonError(w, "Please upload an MP4 or WebM video", 400)
		return
	}
	name := "video-" + generateSecureToken()[:16] + ext
	path := filepath.Join(uploadDir, name)
	f, err := os.Create(path)
	if err != nil {
		jsonError(w, "Could not save video", 500)
		return
	}
	f.Write(head)
	written, err := io.Copy(f, io.LimitReader(part, maxVideoBytes))
	f.Close()
	if err != nil || written+int64(n) >= maxVideoBytes {
		os.Remove(path)
		jsonError(w, "Video is too large (max 400 MB) or the upload was interrupted", 400)
		return
	}

	removeRoomFile(room.State.VideoID)
	title := strings.TrimSuffix(filepath.Base(part.FileName()), filepath.Ext(part.FileName()))
	u, _ := loadUser(userID)
	s := PlaybackState{VideoID: "file:/uploads/" + name, VideoTitle: trimLimit(title, 200), Playing: false,
		Position: 0, StateAt: nowMs(), By: u.Name, ClientID: clientID, Action: "video"}
	saveState(room.ID, s)
	hub.broadcast(room.ID, "state", s)
	jsonOK(w, s)
}

// ensureLounge gives every group an always-there hangout room for group chat and
// group calls. It belongs to Peerly (created_by 0), so only admins can close it.
func ensureLounge(groupID int) {
	var n int
	db.QueryRow("SELECT COUNT(*) FROM rooms WHERE group_id=? AND created_by=0", groupID).Scan(&n)
	if n > 0 {
		return
	}
	var name string
	if db.QueryRow("SELECT name FROM groups_ WHERE id=?", groupID).Scan(&name) != nil {
		return
	}
	db.Exec(`INSERT INTO rooms (group_id, name, kind, created_by, state_at, description) VALUES (?, ?, 'hangout', 0, ?, ?)`,
		groupID, name+" Lounge", nowMs(), "Group chat and voice for everyone in "+name+".")
}

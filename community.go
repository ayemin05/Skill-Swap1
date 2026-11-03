package main

// community.go — Peerly community features: feed posts, likes, comments and groups.
// Everything here plugs into the same SQLite database and auth system as main.go.

import (
	"database/sql"
	"encoding/base64"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// uploadDir is where post images (and avatars) are saved. On Fly.io this lives on the
// persistent volume (/app/data), so uploads survive redeploys.
var uploadDir string

func initUploads() {
	if _, err := os.Stat("/app/data"); err == nil {
		uploadDir = "/app/data/uploads"
	} else {
		uploadDir = "./uploads"
	}
	os.MkdirAll(uploadDir, 0755)
}

func initCommunityDB() {
	schema := `
	CREATE TABLE IF NOT EXISTS groups_ (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		slug        TEXT    UNIQUE NOT NULL,
		name        TEXT    NOT NULL,
		name_my     TEXT    DEFAULT '',
		description TEXT    DEFAULT '',
		emoji       TEXT    DEFAULT '💬',
		created_by  INTEGER DEFAULT 0,
		created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS group_members (
		group_id  INTEGER NOT NULL,
		user_id   INTEGER NOT NULL,
		joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY(group_id, user_id)
	);

	CREATE TABLE IF NOT EXISTS posts (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id    INTEGER NOT NULL,
		group_id   INTEGER DEFAULT 0,
		content    TEXT    NOT NULL DEFAULT '',
		image      TEXT    DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_posts_group ON posts(group_id, id);

	CREATE TABLE IF NOT EXISTS post_likes (
		post_id INTEGER NOT NULL,
		user_id INTEGER NOT NULL,
		PRIMARY KEY(post_id, user_id)
	);

	CREATE TABLE IF NOT EXISTS comments (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		post_id    INTEGER NOT NULL,
		user_id    INTEGER NOT NULL,
		content    TEXT    NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, id);
	`
	if _, err := db.Exec(schema); err != nil {
		log.Fatal("failed to create community schema:", err)
	}
	// Remember whether someone has finished the welcome flow
	db.Exec("ALTER TABLE users ADD COLUMN onboarded INTEGER DEFAULT 0")
	seedGroups()
}

// Starter groups so the community isn't empty on day one.
// Burmese community groups first — that's where Peerly grows first — plus a few global ones.
func seedGroups() {
	starters := []struct{ slug, name, nameMy, desc, emoji string }{
		{"burmese-in-finland", "Burmese in Finland", "ဖင်လန်ရောက် မြန်မာများ", "Meet other Myanmar people living, studying and working in Finland.", "🇫🇮"},
		{"burmese-worldwide", "Burmese Worldwide", "ကမ္ဘာအနှံ့ မြန်မာများ", "Myanmar people everywhere — share life abroad, tips and stories.", "🌏"},
		{"english-learners", "English Learners", "အင်္ဂလိပ်စာ လေ့လာသူများ", "Practise English together. Questions, speaking partners, resources.", "🗣️"},
		{"tech-and-coding", "Tech & Coding", "နည်းပညာနှင့် Coding", "Programming, cloud, web dev and IT careers. Beginners welcome.", "💻"},
		{"study-abroad", "Study Abroad", "နိုင်ငံခြား ပညာသင်", "Scholarships, applications, visas and student life overseas.", "🎓"},
		{"myanmar-food", "Myanmar Food & Cooking", "မြန်မာ အစားအသောက်", "Recipes, where to find ingredients abroad, and food photos.", "🍜"},
		{"creators", "Creators & Side Hustles", "Creator များနှင့် ဘေးဝင်ငွေ", "YouTube, TikTok, design, freelancing — learn from each other.", "🎬"},
		{"music-and-art", "Music & Art", "ဂီတနှင့် အနုပညာ", "Share what you make, find someone to learn an instrument with.", "🎸"},
	}
	for _, g := range starters {
		db.Exec(`INSERT OR IGNORE INTO groups_ (slug, name, name_my, description, emoji) VALUES (?, ?, ?, ?, ?)`,
			g.slug, g.name, g.nameMy, g.desc, g.emoji)
	}

	// A few demo posts from the existing demo accounts, only on a fresh database,
	// so new visitors see what a post looks like. Delete them any time from the feed.
	var postCount int
	db.QueryRow("SELECT COUNT(*) FROM posts").Scan(&postCount)
	if postCount > 0 {
		return
	}
	demo := []struct{ email, group, content string }{
		{"sarah@skillswap.demo", "tech-and-coding", "Starting a small Python study group every Sunday evening 🐍 Total beginners welcome — comment if you want to join!"},
		{"alex@skillswap.demo", "music-and-art", "Anyone want to swap guitar lessons for photo editing tips? I can teach chords and strumming basics 🎸"},
		{"sarah@skillswap.demo", "english-learners", "Tip: speaking for 10 minutes a day with a partner beats 2 hours of grammar videos. Who wants a speaking buddy this week?"},
	}
	for _, d := range demo {
		var uid, gid int
		db.QueryRow("SELECT id FROM users WHERE email=?", d.email).Scan(&uid)
		db.QueryRow("SELECT id FROM groups_ WHERE slug=?", d.group).Scan(&gid)
		if uid > 0 && gid > 0 {
			db.Exec("INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)", gid, uid)
			db.Exec("INSERT INTO posts (user_id, group_id, content) VALUES (?, ?, ?)", uid, gid, d.content)
		}
	}
}

// ── Models ──────────────────────────────────────────────────

type Author struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	Avatar string `json:"avatar"`
}

type Post struct {
	ID           int    `json:"id"`
	Author       Author `json:"author"`
	GroupID      int    `json:"group_id"`
	GroupName    string `json:"group_name"`
	GroupNameMy  string `json:"group_name_my"`
	GroupEmoji   string `json:"group_emoji"`
	Content      string `json:"content"`
	Image        string `json:"image"`
	CreatedAt    string `json:"created_at"`
	LikeCount    int    `json:"like_count"`
	CommentCount int    `json:"comment_count"`
	LikedByMe    bool   `json:"liked_by_me"`
	CanDelete    bool   `json:"can_delete"`
}

type Comment struct {
	ID        int    `json:"id"`
	PostID    int    `json:"post_id"`
	Author    Author `json:"author"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
	CanDelete bool   `json:"can_delete"`
}

type Group struct {
	ID          int    `json:"id"`
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	NameMy      string `json:"name_my"`
	Description string `json:"description"`
	Emoji       string `json:"emoji"`
	MemberCount int    `json:"member_count"`
	PostCount   int    `json:"post_count"`
	IsMember    bool   `json:"is_member"`
	CreatedBy   int    `json:"created_by"`
}

// ── Helpers ─────────────────────────────────────────────────

func isAdmin(userID int) bool {
	var a int
	db.QueryRow("SELECT COALESCE(is_admin,0) FROM users WHERE id=?", userID).Scan(&a)
	return a == 1
}

func isBanned(userID int) bool {
	var b int
	db.QueryRow("SELECT COALESCE(is_banned,0) FROM users WHERE id=?", userID).Scan(&b)
	return b == 1
}

// pathID returns the number after `prefix` in the URL, e.g. /api/posts/12/like → 12
func pathID(path, prefix string) (int, string) {
	rest := strings.TrimPrefix(path, prefix)
	parts := strings.SplitN(strings.Trim(rest, "/"), "/", 2)
	id, _ := strconv.Atoi(parts[0])
	sub := ""
	if len(parts) > 1 {
		sub = parts[1]
	}
	return id, sub
}

// saveImage decodes a base64 data URL, checks it really is an image, and saves it.
func saveImage(dataURL, prefix string) (string, error) {
	raw := dataURL
	if idx := strings.Index(raw, ","); idx != -1 {
		raw = raw[idx+1:]
	}
	b, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return "", fmt.Errorf("could not read the image")
	}
	if len(b) > 6*1024*1024 {
		return "", fmt.Errorf("image too large (max 6MB)")
	}
	ext := ""
	switch http.DetectContentType(b) {
	case "image/jpeg":
		ext = ".jpg"
	case "image/png":
		ext = ".png"
	case "image/gif":
		ext = ".gif"
	case "image/webp":
		ext = ".webp"
	default:
		return "", fmt.Errorf("only JPG, PNG, GIF or WebP images are allowed")
	}
	name := prefix + "-" + generateSecureToken()[:16] + ext
	if err := os.WriteFile(filepath.Join(uploadDir, name), b, 0644); err != nil {
		return "", fmt.Errorf("could not save image")
	}
	return "/uploads/" + name, nil
}

func trimLimit(s string, max int) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > max {
		r := []rune(s)
		s = string(r[:max])
	}
	return s
}

const postSelect = `
	SELECT p.id, p.user_id, u.name, u.avatar, p.group_id,
	       COALESCE(g.name,''), COALESCE(g.name_my,''), COALESCE(g.emoji,''),
	       p.content, p.image, p.created_at,
	       (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id),
	       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id),
	       EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = ?)
	FROM posts p
	JOIN users u ON u.id = p.user_id
	LEFT JOIN groups_ g ON g.id = p.group_id
	WHERE COALESCE(u.is_banned,0) = 0`

func scanPosts(rows *sql.Rows, viewerID int, admin bool) []Post {
	posts := []Post{}
	for rows.Next() {
		var p Post
		rows.Scan(&p.ID, &p.Author.ID, &p.Author.Name, &p.Author.Avatar, &p.GroupID,
			&p.GroupName, &p.GroupNameMy, &p.GroupEmoji,
			&p.Content, &p.Image, &p.CreatedAt,
			&p.LikeCount, &p.CommentCount, &p.LikedByMe)
		p.CanDelete = viewerID > 0 && (p.Author.ID == viewerID || admin)
		posts = append(posts, p)
	}
	return posts
}

// ── Feed & posts ────────────────────────────────────────────

// GET /api/feed?scope=all|mine&group=ID&before=ID
// Guests can read the feed too, so the landing page can show the community is alive.
func handleFeed(w http.ResponseWriter, r *http.Request) {
	viewerID, _ := getUserFromToken(r)
	q := r.URL.Query()
	groupID, _ := strconv.Atoi(q.Get("group"))
	before, _ := strconv.Atoi(q.Get("before"))
	limit := 20

	query := postSelect
	args := []interface{}{viewerID}
	if groupID > 0 {
		query += " AND p.group_id = ?"
		args = append(args, groupID)
	} else if q.Get("scope") == "mine" && viewerID > 0 {
		// Posts from my groups + people I've messaged/swapped with + my own
		query += ` AND (p.user_id = ? OR p.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?))`
		args = append(args, viewerID, viewerID)
	}
	if before > 0 {
		query += " AND p.id < ?"
		args = append(args, before)
	}
	query += " ORDER BY p.id DESC LIMIT ?"
	args = append(args, limit)

	rows, err := db.Query(query, args...)
	if err != nil {
		jsonError(w, "Could not load feed", 500)
		return
	}
	defer rows.Close()
	jsonOK(w, scanPosts(rows, viewerID, viewerID > 0 && isAdmin(viewerID)))
}

// POST /api/posts {content, image (data URL, optional), group_id (optional)}
func handleCreatePost(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := requireAuth(w, r)
	if !ok {
		return
	}
	if isBanned(userID) {
		jsonError(w, "Your account is banned", 403)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 9*1024*1024)
	var body struct {
		Content string `json:"content"`
		Image   string `json:"image"`
		GroupID int    `json:"group_id"`
	}
	if err := decodeJSON(r, &body); err != nil {
		jsonError(w, "Post is too large or invalid", 400)
		return
	}
	content := trimLimit(body.Content, 3000)
	if content == "" && body.Image == "" {
		jsonError(w, "Write something or add a photo", 400)
		return
	}
	if body.GroupID > 0 {
		var exists int
		db.QueryRow("SELECT COUNT(*) FROM groups_ WHERE id=?", body.GroupID).Scan(&exists)
		if exists == 0 {
			jsonError(w, "Group not found", 404)
			return
		}
		// Posting in a group automatically joins it
		db.Exec("INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)", body.GroupID, userID)
	}
	img := ""
	if body.Image != "" {
		var err error
		if img, err = saveImage(body.Image, "post"); err != nil {
			jsonError(w, err.Error(), 400)
			return
		}
	}
	res, err := db.Exec("INSERT INTO posts (user_id, group_id, content, image) VALUES (?, ?, ?, ?)",
		userID, body.GroupID, content, img)
	if err != nil {
		jsonError(w, "Could not save post", 500)
		return
	}
	id, _ := res.LastInsertId()
	rows, _ := db.Query(postSelect+" AND p.id = ?", userID, id)
	defer rows.Close()
	posts := scanPosts(rows, userID, isAdmin(userID))
	if len(posts) == 0 {
		jsonError(w, "Could not load post", 500)
		return
	}
	jsonOK(w, posts[0])
}

// Routes under /api/posts/{id}:
//   DELETE /api/posts/{id}            — delete (author or admin)
//   POST   /api/posts/{id}/like       — toggle like
//   GET    /api/posts/{id}/comments   — list comments
//   POST   /api/posts/{id}/comments   — add comment
func handlePostRoutes(w http.ResponseWriter, r *http.Request) {
	postID, sub := pathID(r.URL.Path, "/api/posts/")
	if postID == 0 {
		jsonError(w, "Post not found", 404)
		return
	}
	var ownerID int
	if err := db.QueryRow("SELECT user_id FROM posts WHERE id=?", postID).Scan(&ownerID); err != nil {
		jsonError(w, "Post not found", 404)
		return
	}

	switch {
	case sub == "" && r.Method == http.MethodDelete:
		userID, ok := requireAuth(w, r)
		if !ok {
			return
		}
		if userID != ownerID && !isAdmin(userID) {
			jsonError(w, "You can only delete your own posts", 403)
			return
		}
		deletePost(postID)
		jsonOK(w, map[string]string{"status": "deleted"})

	case sub == "like" && r.Method == http.MethodPost:
		userID, ok := requireAuth(w, r)
		if !ok {
			return
		}
		res, _ := db.Exec("DELETE FROM post_likes WHERE post_id=? AND user_id=?", postID, userID)
		liked := false
		if n, _ := res.RowsAffected(); n == 0 {
			db.Exec("INSERT OR IGNORE INTO post_likes (post_id, user_id) VALUES (?, ?)", postID, userID)
			liked = true
		}
		var count int
		db.QueryRow("SELECT COUNT(*) FROM post_likes WHERE post_id=?", postID).Scan(&count)
		jsonOK(w, map[string]interface{}{"liked": liked, "like_count": count})

	case sub == "comments" && r.Method == http.MethodGet:
		viewerID, _ := getUserFromToken(r)
		admin := viewerID > 0 && isAdmin(viewerID)
		rows, err := db.Query(`
			SELECT c.id, c.post_id, c.user_id, u.name, u.avatar, c.content, c.created_at
			FROM comments c JOIN users u ON u.id = c.user_id
			WHERE c.post_id = ? AND COALESCE(u.is_banned,0) = 0
			ORDER BY c.id ASC`, postID)
		if err != nil {
			jsonError(w, "Could not load comments", 500)
			return
		}
		defer rows.Close()
		list := []Comment{}
		for rows.Next() {
			var c Comment
			rows.Scan(&c.ID, &c.PostID, &c.Author.ID, &c.Author.Name, &c.Author.Avatar, &c.Content, &c.CreatedAt)
			c.CanDelete = viewerID > 0 && (c.Author.ID == viewerID || admin)
			list = append(list, c)
		}
		jsonOK(w, list)

	case sub == "comments" && r.Method == http.MethodPost:
		userID, ok := requireAuth(w, r)
		if !ok {
			return
		}
		if isBanned(userID) {
			jsonError(w, "Your account is banned", 403)
			return
		}
		var body struct {
			Content string `json:"content"`
		}
		decodeJSON(r, &body)
		content := trimLimit(body.Content, 1000)
		if content == "" {
			jsonError(w, "Comment can't be empty", 400)
			return
		}
		res, err := db.Exec("INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)", postID, userID, content)
		if err != nil {
			jsonError(w, "Could not save comment", 500)
			return
		}
		id, _ := res.LastInsertId()
		u, _ := loadUser(userID)
		jsonOK(w, Comment{ID: int(id), PostID: postID, Content: content, CanDelete: true,
			CreatedAt: time.Now().UTC().Format("2006-01-02 15:04:05"),
			Author:    Author{ID: userID, Name: u.Name, Avatar: u.Avatar}})

	default:
		jsonError(w, "Not found", 404)
	}
}

// DELETE /api/comments/{id}
func handleCommentRoutes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := requireAuth(w, r)
	if !ok {
		return
	}
	id, _ := pathID(r.URL.Path, "/api/comments/")
	var ownerID int
	if err := db.QueryRow("SELECT user_id FROM comments WHERE id=?", id).Scan(&ownerID); err != nil {
		jsonError(w, "Comment not found", 404)
		return
	}
	if ownerID != userID && !isAdmin(userID) {
		jsonError(w, "You can only delete your own comments", 403)
		return
	}
	db.Exec("DELETE FROM comments WHERE id=?", id)
	jsonOK(w, map[string]string{"status": "deleted"})
}

func deletePost(postID int) {
	var img string
	db.QueryRow("SELECT image FROM posts WHERE id=?", postID).Scan(&img)
	if strings.HasPrefix(img, "/uploads/") {
		os.Remove(filepath.Join(uploadDir, filepath.Base(img)))
	}
	db.Exec("DELETE FROM comments   WHERE post_id=?", postID)
	db.Exec("DELETE FROM post_likes WHERE post_id=?", postID)
	db.Exec("DELETE FROM posts      WHERE id=?", postID)
}

// deleteCommunityData removes everything a user created in the community.
// Called when an account is deleted (by the user or an admin).
func deleteCommunityData(userID int) {
	rows, err := db.Query("SELECT id FROM posts WHERE user_id=?", userID)
	if err == nil {
		var ids []int
		for rows.Next() {
			var id int
			rows.Scan(&id)
			ids = append(ids, id)
		}
		rows.Close()
		for _, id := range ids {
			deletePost(id)
		}
	}
	db.Exec("DELETE FROM comments      WHERE user_id=?", userID)
	db.Exec("DELETE FROM post_likes    WHERE user_id=?", userID)
	db.Exec("DELETE FROM group_members WHERE user_id=?", userID)
	deleteRoomData(userID)
}

// ── Groups ──────────────────────────────────────────────────

func loadGroups(viewerID int, where string, args ...interface{}) []Group {
	q := `SELECT g.id, g.slug, g.name, g.name_my, g.description, g.emoji, g.created_by,
	        (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id),
	        (SELECT COUNT(*) FROM posts p WHERE p.group_id = g.id),
	        EXISTS(SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = ?)
	      FROM groups_ g ` + where
	rows, err := db.Query(q, append([]interface{}{viewerID}, args...)...)
	list := []Group{}
	if err != nil {
		return list
	}
	defer rows.Close()
	for rows.Next() {
		var g Group
		rows.Scan(&g.ID, &g.Slug, &g.Name, &g.NameMy, &g.Description, &g.Emoji, &g.CreatedBy,
			&g.MemberCount, &g.PostCount, &g.IsMember)
		list = append(list, g)
	}
	return list
}

var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

// GET  /api/groups        — all groups (most active first)
// POST /api/groups        — create {name, description, emoji}
func handleGroups(w http.ResponseWriter, r *http.Request) {
	viewerID, _ := getUserFromToken(r)
	switch r.Method {
	case http.MethodGet:
		// My groups first, then the starter groups in their curated order, then the most popular new groups
		jsonOK(w, loadGroups(viewerID, `ORDER BY 10 DESC, CASE WHEN g.created_by = 0 THEN 0 ELSE 1 END, CASE WHEN g.created_by = 0 THEN g.id ELSE 0 END, 8 DESC, g.id ASC`))

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
			Description string `json:"description"`
			Emoji       string `json:"emoji"`
		}
		decodeJSON(r, &body)
		name := trimLimit(body.Name, 60)
		if utf8.RuneCountInString(name) < 3 {
			jsonError(w, "Group name needs at least 3 characters", 400)
			return
		}
		emoji := trimLimit(body.Emoji, 4)
		if emoji == "" {
			emoji = "💬"
		}
		base := strings.Trim(slugRe.ReplaceAllString(strings.ToLower(name), "-"), "-")
		if base == "" {
			base = "group" // e.g. a name written only in Burmese
		}
		slug := base
		for i := 2; ; i++ {
			var n int
			db.QueryRow("SELECT COUNT(*) FROM groups_ WHERE slug=?", slug).Scan(&n)
			if n == 0 {
				break
			}
			slug = fmt.Sprintf("%s-%d", base, i)
		}
		res, err := db.Exec(`INSERT INTO groups_ (slug, name, description, emoji, created_by) VALUES (?, ?, ?, ?, ?)`,
			slug, name, trimLimit(body.Description, 300), emoji, userID)
		if err != nil {
			jsonError(w, "Could not create group", 500)
			return
		}
		id, _ := res.LastInsertId()
		db.Exec("INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)", id, userID)
		g := loadGroups(userID, "WHERE g.id = ?", id)
		jsonOK(w, g[0])

	default:
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// Routes under /api/groups/{id}:
//   GET    /api/groups/{id}        — group details
//   POST   /api/groups/{id}/join   — join
//   POST   /api/groups/{id}/leave  — leave
//   DELETE /api/groups/{id}        — delete (creator or admin; starter groups admin only)
func handleGroupRoutes(w http.ResponseWriter, r *http.Request) {
	groupID, sub := pathID(r.URL.Path, "/api/groups/")
	viewerID, _ := getUserFromToken(r)
	g := loadGroups(viewerID, "WHERE g.id = ?", groupID)
	if len(g) == 0 {
		jsonError(w, "Group not found", 404)
		return
	}

	switch {
	case sub == "" && r.Method == http.MethodGet:
		jsonOK(w, g[0])

	case (sub == "join" || sub == "leave") && r.Method == http.MethodPost:
		userID, ok := requireAuth(w, r)
		if !ok {
			return
		}
		if sub == "join" {
			db.Exec("INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)", groupID, userID)
		} else {
			db.Exec("DELETE FROM group_members WHERE group_id=? AND user_id=?", groupID, userID)
		}
		jsonOK(w, loadGroups(userID, "WHERE g.id = ?", groupID)[0])

	case sub == "" && r.Method == http.MethodDelete:
		userID, ok := requireAuth(w, r)
		if !ok {
			return
		}
		if !isAdmin(userID) && (g[0].CreatedBy != userID || g[0].CreatedBy == 0) {
			jsonError(w, "Only the group creator or an admin can delete it", 403)
			return
		}
		rows, _ := db.Query("SELECT id FROM posts WHERE group_id=?", groupID)
		var ids []int
		for rows.Next() {
			var id int
			rows.Scan(&id)
			ids = append(ids, id)
		}
		rows.Close()
		for _, id := range ids {
			deletePost(id)
		}
		db.Exec("DELETE FROM group_members WHERE group_id=?", groupID)
		db.Exec("DELETE FROM room_messages WHERE room_id IN (SELECT id FROM rooms WHERE group_id=?)", groupID)
		db.Exec("DELETE FROM rooms WHERE group_id=?", groupID)
		db.Exec("DELETE FROM groups_ WHERE id=?", groupID)
		jsonOK(w, map[string]string{"status": "deleted"})

	default:
		jsonError(w, "Not found", 404)
	}
}

// POST /api/onboarded — marks the welcome flow as finished
func handleOnboarded(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireAuth(w, r)
	if !ok {
		return
	}
	db.Exec("UPDATE users SET onboarded=1 WHERE id=?", userID)
	jsonOK(w, map[string]string{"status": "ok"})
}

// GET /api/stats — small numbers for the landing page
func handleStats(w http.ResponseWriter, r *http.Request) {
	var users, groups, posts int
	db.QueryRow("SELECT COUNT(*) FROM users WHERE COALESCE(is_banned,0)=0 AND email NOT LIKE '%@skillswap.demo'").Scan(&users)
	db.QueryRow("SELECT COUNT(*) FROM groups_").Scan(&groups)
	db.QueryRow("SELECT COUNT(*) FROM posts").Scan(&posts)
	jsonOK(w, map[string]int{"members": users, "groups": groups, "posts": posts})
}

// uploadsHandler serves uploaded images from the persistent upload folder.
func uploadsHandler() http.Handler {
	fs := http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadDir)))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/") {
			http.NotFound(w, r) // no directory listings
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=604800")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		fs.ServeHTTP(w, r)
	})
}

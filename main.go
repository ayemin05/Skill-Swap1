package main

import (
	"bytes"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"golang.org/x/crypto/bcrypt"
)

// ─── Database setup ───────────────────────────────────────────────────────────
// I'm using SQLite here because it needs zero setup — it's just a file on disk.
// No separate database server needed, which makes it easy to run locally.

var db *sql.DB

func initDB() {
	var err error
	db, err = sql.Open("sqlite3", "./skillswap.db")
	if err != nil {
		log.Fatal("couldn't open the database file:", err)
	}

	// This creates all the tables when the app runs for the first time.
	// IF NOT EXISTS means it's safe to run every time — it just skips if already there.
	schema := `
    CREATE TABLE IF NOT EXISTS users (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        name         TEXT    NOT NULL,
        email        TEXT    UNIQUE NOT NULL,
        password     TEXT    NOT NULL,
        bio          TEXT    DEFAULT '',
        avatar       TEXT    DEFAULT '',
        swaps        INTEGER DEFAULT 0,
        rating       REAL    DEFAULT 5.0,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS skills (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        skill   TEXT    NOT NULL,
        type    TEXT    NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id   INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        content     TEXT    NOT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(sender_id)   REFERENCES users(id),
        FOREIGN KEY(receiver_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        requester_id INTEGER NOT NULL,
        partner_id   INTEGER NOT NULL,
        date         TEXT    NOT NULL,
        time         TEXT    NOT NULL,
        session_type TEXT    NOT NULL,
        duration     INTEGER NOT NULL,
        agenda       TEXT    DEFAULT '',
        teach_skill  TEXT    DEFAULT '',
        learn_skill  TEXT    DEFAULT '',
        status       TEXT    DEFAULT 'pending',
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(requester_id) REFERENCES users(id),
        FOREIGN KEY(partner_id)   REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
        token      TEXT    PRIMARY KEY,
        user_id    INTEGER NOT NULL,
        expires_at DATETIME NOT NULL,
        last_used  DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS message_reads (
        user_id  INTEGER NOT NULL,
        other_id INTEGER NOT NULL,
        last_read DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, other_id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS reset_tokens (
        token      TEXT     PRIMARY KEY,
        user_id    INTEGER  NOT NULL,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    `
	if _, err = db.Exec(schema); err != nil {
		log.Fatal("failed to create schema:", err)
	}

	// These ALTER TABLE lines add new columns to existing databases safely.
	// SQLite returns an error if the column already exists, but we just ignore that error.
	// This is how I handle "migrations" without a proper migration tool.
	db.Exec("ALTER TABLE users ADD COLUMN location TEXT DEFAULT ''")
	db.Exec("ALTER TABLE users ADD COLUMN session_pref TEXT DEFAULT 'both'")
	db.Exec("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0")
	db.Exec("ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0")
	db.Exec("ALTER TABLE sessions ADD COLUMN requester_rated INTEGER DEFAULT 0")
	db.Exec("ALTER TABLE sessions ADD COLUMN partner_rated   INTEGER DEFAULT 0")
	// call_link stores the Zoom/Meet URL for video sessions,
	// and the recording link for recorded sessions — stays in the session forever
	db.Exec("ALTER TABLE sessions ADD COLUMN call_link TEXT DEFAULT ''")
	db.Exec("ALTER TABLE auth_tokens ADD COLUMN last_used DATETIME DEFAULT '2000-01-01 00:00:00'")
	// Reset tokens that got wrong timestamps from a previous buggy migration
	db.Exec("UPDATE auth_tokens SET last_used = '2000-01-01 00:00:00' WHERE last_used > '2000-01-02'")

	// ayem4004@gmail.com is the hardcoded superadmin — always gets admin rights on every startup
	db.Exec("UPDATE users SET is_admin=1 WHERE email='ayem4004@gmail.com'")

	// Fallback: if the superadmin hasn't registered yet, promote whoever joined first
	var adminCount int
	db.QueryRow("SELECT COUNT(*) FROM users WHERE is_admin=1 AND email NOT LIKE '%@skillswap.demo'").Scan(&adminCount)
	if adminCount == 0 {
		db.Exec("UPDATE users SET is_admin=1 WHERE id=(SELECT MIN(id) FROM users WHERE email NOT LIKE '%@skillswap.demo')")
	}

	log.Println("Database is ready")
}

// ─── Data models ─────────────────────────────────────────────────────────────
// These structs define the shape of data going in and out of the API as JSON.

type User struct {
	ID          int      `json:"id"`
	Name        string   `json:"name"`
	Email       string   `json:"email"`
	Bio         string   `json:"bio"`
	Avatar      string   `json:"avatar"`
	Swaps       int      `json:"swaps"`
	Rating      float64  `json:"rating"`
	Location    string   `json:"location"`
	SessionPref string   `json:"session_pref"`
	IsOnline    bool     `json:"is_online"`
	IsAdmin     bool     `json:"is_admin"`
	IsBanned    bool     `json:"is_banned"`
	Teach       []string `json:"teach"`
	Learn       []string `json:"learn"`
	CreatedAt   string   `json:"created_at"`
}

type Message struct {
	ID          int    `json:"id"`
	SenderID    int    `json:"sender_id"`
	ReceiverID  int    `json:"receiver_id"`
	Content     string `json:"content"`
	CreatedAt   string `json:"created_at"`
	SenderName  string `json:"sender_name"`
	IsRead      bool   `json:"is_read"`
	IsDelivered bool   `json:"is_delivered"`
}

type Session struct {
	ID             int    `json:"id"`
	RequesterID    int    `json:"requester_id"`
	PartnerID      int    `json:"partner_id"`
	PartnerName    string `json:"partner_name"`
	RequesterName  string `json:"requester_name"`
	Date           string `json:"date"`
	Time           string `json:"time"`
	SessionType    string `json:"session_type"`
	Duration       int    `json:"duration"`
	Agenda         string `json:"agenda"`
	TeachSkill     string `json:"teach_skill"`
	LearnSkill     string `json:"learn_skill"`
	Status         string `json:"status"`
	RequesterRated int    `json:"requester_rated"`
	PartnerRated   int    `json:"partner_rated"`
	// call_link is used for video sessions (Zoom/Meet link) AND for recorded sessions
	// (the recording link the user pastes after the session). It stays stored forever.
	CallLink  string `json:"call_link"`
	CreatedAt string `json:"created_at"`
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

// generateToken makes a simple unique token from the current timestamp.
// In production you'd want crypto/rand but this works fine for a project.
func generateToken() string {
	return fmt.Sprintf("%d-%d", time.Now().UnixNano(), time.Now().Unix())
}

// getUserFromToken checks the session cookie (or Authorization header) and
// returns the user ID if the token is valid and not expired.
// It also updates last_used so we can track who is currently online.
func getUserFromToken(r *http.Request) (int, error) {
	token := ""
	cookie, err := r.Cookie("session")
	if err == nil {
		token = cookie.Value
	} else {
		auth := r.Header.Get("Authorization")
		if strings.HasPrefix(auth, "Bearer ") {
			token = strings.TrimPrefix(auth, "Bearer ")
		}
	}
	if token == "" {
		return 0, fmt.Errorf("no token")
	}

	var userID int
	var expiresAt time.Time
	err = db.QueryRow(
		"SELECT user_id, expires_at FROM auth_tokens WHERE token = ?", token,
	).Scan(&userID, &expiresAt)
	if err != nil {
		return 0, fmt.Errorf("invalid token")
	}
	if time.Now().After(expiresAt) {
		db.Exec("DELETE FROM auth_tokens WHERE token = ?", token)
		return 0, fmt.Errorf("token expired")
	}
	// Every API call refreshes last_used so the online indicator stays accurate
	db.Exec("UPDATE auth_tokens SET last_used = ? WHERE token = ?", time.Now(), token)
	return userID, nil
}

// requireAuth is a wrapper that returns 401 if the user isn't logged in.
func requireAuth(w http.ResponseWriter, r *http.Request) (int, bool) {
	userID, err := getUserFromToken(r)
	if err != nil {
		jsonError(w, "Please log in first", http.StatusUnauthorized)
		return 0, false
	}
	return userID, true
}

// ─── Response helpers ─────────────────────────────────────────────────────────

func jsonOK(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// loadUser fetches a user by ID and assembles all their data including skills,
// online status, and admin/banned flags into a single User struct.
func loadUser(userID int) (*User, error) {
	u := &User{}
	err := db.QueryRow(`
		SELECT id, name, email, bio, avatar, swaps, rating,
		       location, session_pref,
		       COALESCE(is_admin,0), COALESCE(is_banned,0),
		       created_at
		FROM users WHERE id = ?`, userID,
	).Scan(&u.ID, &u.Name, &u.Email, &u.Bio, &u.Avatar, &u.Swaps, &u.Rating,
		&u.Location, &u.SessionPref, &u.IsAdmin, &u.IsBanned, &u.CreatedAt)
	if err != nil {
		return nil, err
	}

	// A user counts as "online" if they made any request in the last 10 minutes.
	// We track this by updating last_used on the auth_tokens table on every API call.
	var onlineCount int
	db.QueryRow(`SELECT COUNT(*) FROM auth_tokens
		WHERE user_id = ? AND expires_at > ? AND last_used > ?`,
		userID, time.Now(), time.Now().Add(-10*time.Minute)).Scan(&onlineCount)
	u.IsOnline = onlineCount > 0

	// Load the user's teach/learn skills from the skills table
	rows, err := db.Query("SELECT skill, type FROM skills WHERE user_id = ?", userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var skill, stype string
			rows.Scan(&skill, &stype)
			if stype == "teach" {
				u.Teach = append(u.Teach, skill)
			} else {
				u.Learn = append(u.Learn, skill)
			}
		}
	}
	if u.Teach == nil {
		u.Teach = []string{}
	}
	if u.Learn == nil {
		u.Learn = []string{}
	}
	return u, nil
}

// ─── Route handlers ───────────────────────────────────────────────────────────

func handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Hash the password with bcrypt before storing — never store plain text passwords
	hash, _ := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	result, err := db.Exec("INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
		body.Name, strings.ToLower(body.Email), string(hash))
	if err != nil {
		jsonError(w, "That email is already registered", http.StatusConflict)
		return
	}
	userID, _ := result.LastInsertId()

	// If this is the superadmin email, promote BEFORE loading the user
	// (important — promote first, then load, so the response includes is_admin:true)
	if strings.ToLower(body.Email) == "ayem4004@gmail.com" {
		db.Exec("UPDATE users SET is_admin=1 WHERE id=?", userID)
	}

	// Create a session token that lasts 30 days and set it as an HTTP-only cookie
	token := generateToken()
	expires := time.Now().Add(30 * 24 * time.Hour)
	db.Exec("INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, ?)", token, userID, expires)
	http.SetCookie(w, &http.Cookie{Name: "session", Value: token, Expires: expires, Path: "/", HttpOnly: true})

	u, _ := loadUser(int(userID))
	// Send welcome messages from the demo bot accounts in the background
	go seedBotWelcome(int(userID))
	jsonOK(w, map[string]interface{}{"user": u, "token": token})
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	var userID int
	var hash string
	err := db.QueryRow("SELECT id, password FROM users WHERE email = ?",
		strings.ToLower(body.Email)).Scan(&userID, &hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password)) != nil {
		jsonError(w, "Wrong email or password", http.StatusUnauthorized)
		return
	}

	u, _ := loadUser(userID)
	if u != nil && u.IsBanned {
		jsonError(w, "Your account has been banned. Please contact the admin.", http.StatusForbidden)
		return
	}

	token := generateToken()
	expires := time.Now().Add(30 * 24 * time.Hour)
	db.Exec("INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, ?)", token, userID, expires)
	http.SetCookie(w, &http.Cookie{Name: "session", Value: token, Expires: expires, Path: "/", HttpOnly: true})
	jsonOK(w, map[string]interface{}{"user": u, "token": token})
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	// Delete the token from the database so it can't be reused
	cookie, err := r.Cookie("session")
	if err == nil {
		db.Exec("DELETE FROM auth_tokens WHERE token = ?", cookie.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: "session", Value: "", Expires: time.Unix(0, 0), Path: "/"})
	jsonOK(w, map[string]string{"message": "logged out"})
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireAuth(w, r)
	if !ok {
		return
	}
	u, _ := loadUser(userID)
	jsonOK(w, u)
}

func handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := requireAuth(w, r)
	if !ok {
		return
	}

	var body struct {
		Name        string   `json:"name"`
		Bio         string   `json:"bio"`
		Avatar      string   `json:"avatar"`
		Location    string   `json:"location"`
		SessionPref string   `json:"session_pref"`
		Teach       []string `json:"teach"`
		Learn       []string `json:"learn"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	if body.SessionPref == "" {
		body.SessionPref = "both"
	}

	db.Exec("UPDATE users SET name=?, bio=?, avatar=?, location=?, session_pref=? WHERE id=?",
		body.Name, body.Bio, body.Avatar, body.Location, body.SessionPref, userID)

	// Replace all skills — delete old ones and re-insert the new list
	db.Exec("DELETE FROM skills WHERE user_id = ?", userID)
	for _, s := range body.Teach {
		db.Exec("INSERT INTO skills (user_id, skill, type) VALUES (?, ?, 'teach')", userID, s)
	}
	for _, s := range body.Learn {
		db.Exec("INSERT INTO skills (user_id, skill, type) VALUES (?, ?, 'learn')", userID, s)
	}
	u, _ := loadUser(userID)
	jsonOK(w, u)
}

// handleUsers returns all users for the browse page.
// When logged in, your own account is excluded (you don't need to browse yourself).
// Banned users are always hidden from everyone.
func handleUsers(w http.ResponseWriter, r *http.Request) {
	loggedInUserID, _ := getUserFromToken(r)
	q := r.URL.Query().Get("q")
	filter := r.URL.Query().Get("filter")

	query := "SELECT id FROM users WHERE (? = 0 OR id != ?) AND COALESCE(is_banned,0)=0"
	args := []interface{}{loggedInUserID, loggedInUserID}

	if q != "" {
		query += " AND (name LIKE ? OR id IN (SELECT user_id FROM skills WHERE skill LIKE ?))"
		like := "%" + q + "%"
		args = append(args, like, like)
	}
	// Filter by session preference (video / in-person)
	switch filter {
	case "video":
		query += " AND (session_pref = 'video' OR session_pref = 'both')"
	case "in-person":
		query += " AND (session_pref = 'in-person' OR session_pref = 'both')"
	}

	rows, err := db.Query(query, args...)
	if err != nil {
		return
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		var id int
		rows.Scan(&id)
		u, _ := loadUser(id)
		if u != nil {
			u.Email = "" // never expose email to other users
			users = append(users, u)
		}
	}
	if users == nil {
		users = []*User{}
	}
	jsonOK(w, users)
}

func handleUserByID(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	id, _ := strconv.Atoi(parts[len(parts)-1])
	u, err := loadUser(id)
	if err != nil {
		jsonError(w, "User not found", 404)
		return
	}
	u.Email = ""
	jsonOK(w, u)
}

// handleMessages handles both GET (fetch conversation) and POST (send message).
// On GET it also marks the conversation as read by updating message_reads.
func handleMessages(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireAuth(w, r)
	if !ok {
		return
	}

	if r.Method == http.MethodGet {
		withID, _ := strconv.Atoi(r.URL.Query().Get("with"))
		rows, _ := db.Query(`
			SELECT m.id, m.sender_id, m.receiver_id, m.content, m.created_at, u.name
			FROM messages m JOIN users u ON u.id = m.sender_id
			WHERE (m.sender_id = ? AND m.receiver_id = ?)
			   OR (m.sender_id = ? AND m.receiver_id = ?)
			ORDER BY m.created_at ASC`, userID, withID, withID, userID)
		defer rows.Close()

		var msgs []Message
		for rows.Next() {
			var m Message
			rows.Scan(&m.ID, &m.SenderID, &m.ReceiverID, &m.Content, &m.CreatedAt, &m.SenderName)
			msgs = append(msgs, m)
		}
		if msgs == nil {
			msgs = []Message{}
		}

		// Check delivered (receiver is online) and read (receiver opened this conversation)
		var lastRead time.Time
		db.QueryRow("SELECT last_read FROM message_reads WHERE user_id=? AND other_id=?",
			withID, userID).Scan(&lastRead)
		var onlineCount int
		db.QueryRow(`SELECT COUNT(*) FROM auth_tokens
			WHERE user_id=? AND expires_at>? AND last_used>?`,
			withID, time.Now(), time.Now().Add(-10*time.Minute)).Scan(&onlineCount)
		receiverOnline := onlineCount > 0
		for i := range msgs {
			if msgs[i].SenderID == userID {
				msgs[i].IsDelivered = receiverOnline || !lastRead.IsZero()
				if !lastRead.IsZero() {
					msgTime, err := time.Parse("2006-01-02T15:04:05Z", msgs[i].CreatedAt)
					if err != nil {
						msgTime, _ = time.Parse("2006-01-02 15:04:05", msgs[i].CreatedAt)
					}
					msgs[i].IsRead = lastRead.After(msgTime)
				}
			}
		}

		// Mark conversation as read — upsert into message_reads
		if withID > 0 {
			db.Exec(`INSERT INTO message_reads(user_id, other_id, last_read) VALUES(?,?,?)
				ON CONFLICT(user_id,other_id) DO UPDATE SET last_read=excluded.last_read`,
				userID, withID, time.Now())
		}
		jsonOK(w, msgs)

	} else if r.Method == http.MethodPost {
		var body struct {
			ReceiverID int    `json:"receiver_id"`
			Content    string `json:"content"`
		}
		json.NewDecoder(r.Body).Decode(&body)
		db.Exec("INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)",
			userID, body.ReceiverID, body.Content)
		jsonOK(w, map[string]string{"status": "sent"})
	}
}

// handleConversations returns the list of conversations with unread counts.
// Unread = messages from the other person that arrived after I last read this conversation.
func handleConversations(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireAuth(w, r)
	if !ok {
		return
	}

	rows, _ := db.Query(`
		SELECT DISTINCT
			CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS other_id,
			MAX(created_at) as last_at
		FROM messages
		WHERE sender_id = ? OR receiver_id = ?
		GROUP BY other_id ORDER BY last_at DESC`, userID, userID, userID)
	defer rows.Close()

	type Conv struct {
		User    *User  `json:"user"`
		LastMsg string `json:"last_message"`
		LastAt  string `json:"last_at"`
		Unread  int    `json:"unread"`
	}
	var convs []Conv
	for rows.Next() {
		var otherID int
		var lastAt string
		rows.Scan(&otherID, &lastAt)

		u, _ := loadUser(otherID)
		if u == nil {
			continue
		}

		var lastMsg string
		db.QueryRow(`SELECT content FROM messages
			WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)
			ORDER BY created_at DESC LIMIT 1`,
			userID, otherID, otherID, userID).Scan(&lastMsg)

		// Count messages from other → me that arrived after my last_read timestamp
		var unread int
		var lastRead time.Time
		err := db.QueryRow("SELECT last_read FROM message_reads WHERE user_id=? AND other_id=?",
			userID, otherID).Scan(&lastRead)
		if err != nil {
			// Never opened this conversation — all their messages are unread
			db.QueryRow("SELECT COUNT(*) FROM messages WHERE sender_id=? AND receiver_id=?",
				otherID, userID).Scan(&unread)
		} else {
			db.QueryRow(`SELECT COUNT(*) FROM messages
				WHERE sender_id=? AND receiver_id=? AND created_at>?`,
				otherID, userID, lastRead).Scan(&unread)
		}

		u.Email = ""
		convs = append(convs, Conv{User: u, LastMsg: lastMsg, LastAt: lastAt, Unread: unread})
	}
	if convs == nil {
		convs = []Conv{}
	}
	jsonOK(w, convs)
}

func handleSessions(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireAuth(w, r)
	if !ok {
		return
	}

	if r.Method == http.MethodGet {
		// Join on both partner and requester so we get both names
		rows, _ := db.Query(`
			SELECT s.id, s.requester_id, s.partner_id,
			       partner.name, requester.name,
			       s.date, s.time, s.session_type, s.duration, s.agenda,
			       s.teach_skill, s.learn_skill, s.status,
			       COALESCE(s.requester_rated,0), COALESCE(s.partner_rated,0),
			       COALESCE(s.call_link,''),
			       s.created_at
			FROM sessions s
			JOIN users partner   ON partner.id   = s.partner_id
			JOIN users requester ON requester.id = s.requester_id
			WHERE s.requester_id = ? OR s.partner_id = ?
			ORDER BY s.created_at DESC`, userID, userID)
		defer rows.Close()

		var sessions []Session
		for rows.Next() {
			var s Session
			rows.Scan(&s.ID, &s.RequesterID, &s.PartnerID,
				&s.PartnerName, &s.RequesterName,
				&s.Date, &s.Time, &s.SessionType, &s.Duration, &s.Agenda,
				&s.TeachSkill, &s.LearnSkill, &s.Status,
				&s.RequesterRated, &s.PartnerRated,
				&s.CallLink, &s.CreatedAt)
			sessions = append(sessions, s)
		}
		if sessions == nil {
			sessions = []Session{}
		}
		jsonOK(w, sessions)

	} else if r.Method == http.MethodPost {
		var b Session
		json.NewDecoder(r.Body).Decode(&b)
		db.Exec(`INSERT INTO sessions
			(requester_id, partner_id, date, time, session_type, duration, agenda, teach_skill, learn_skill, call_link)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			userID, b.PartnerID, b.Date, b.Time, b.SessionType, b.Duration,
			b.Agenda, b.TeachSkill, b.LearnSkill, b.CallLink)
		jsonOK(w, map[string]string{"status": "session request sent"})
	}
}

// handleSessionAction handles all session state changes:
// confirm, decline, cancel, reschedule, rate, and add_recording
func handleSessionAction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := requireAuth(w, r)
	if !ok {
		return
	}

	var body struct {
		Action   string `json:"action"`
		Date     string `json:"date"`
		Time     string `json:"time"`
		Stars    int    `json:"stars"`
		CallLink string `json:"call_link"` // also used for recording link
	}
	json.NewDecoder(r.Body).Decode(&body)

	parts := strings.Split(r.URL.Path, "/")
	sessionID, _ := strconv.Atoi(parts[len(parts)-1])

	// Load session to verify this user is actually involved
	var reqID, partID int
	var status string
	err := db.QueryRow("SELECT requester_id, partner_id, status FROM sessions WHERE id=?", sessionID).
		Scan(&reqID, &partID, &status)
	if err != nil {
		jsonError(w, "Session not found", 404)
		return
	}
	if userID != reqID && userID != partID {
		jsonError(w, "This is not your session", 403)
		return
	}

	isRequester := userID == reqID

	switch body.Action {
	case "confirm":
		if isRequester {
			jsonError(w, "Only the other person can confirm", 403)
			return
		}
		db.Exec("UPDATE sessions SET status='confirmed' WHERE id=?", sessionID)
		// Increment swap count for both people when they confirm
		db.Exec("UPDATE users SET swaps=swaps+1 WHERE id=? OR id=?", reqID, partID)
		jsonOK(w, map[string]string{"status": "confirmed"})

	case "decline":
		if isRequester {
			jsonError(w, "Only the other person can decline", 403)
			return
		}
		db.Exec("UPDATE sessions SET status='declined' WHERE id=?", sessionID)
		jsonOK(w, map[string]string{"status": "declined"})

	case "cancel":
		if !isRequester {
			jsonError(w, "Only the person who sent the request can cancel", 403)
			return
		}
		// If it was already confirmed, undo the swap count since the session didn't happen
		if status == "confirmed" {
			db.Exec("UPDATE users SET swaps=MAX(0,swaps-1) WHERE id=? OR id=?", reqID, partID)
		}
		db.Exec("UPDATE sessions SET status='cancelled' WHERE id=?", sessionID)
		jsonOK(w, map[string]string{"status": "cancelled"})

	case "reschedule":
		if body.Date == "" || body.Time == "" {
			jsonError(w, "Please provide a new date and time", 400)
			return
		}
		// Both sides can suggest a new time — resets to pending so the other person re-confirms
		db.Exec("UPDATE sessions SET date=?, time=?, status='pending' WHERE id=?",
			body.Date, body.Time, sessionID)
		if body.CallLink != "" {
			db.Exec("UPDATE sessions SET call_link=? WHERE id=?", body.CallLink, sessionID)
		}
		jsonOK(w, map[string]string{"status": "rescheduled"})

	case "add_recording":
		// For "Recorded" type sessions — the user pastes a recording link after the session.
		// This is stored permanently in call_link so both people can access it any time.
		if body.CallLink == "" {
			jsonError(w, "Please provide a recording link", 400)
			return
		}
		db.Exec("UPDATE sessions SET call_link=? WHERE id=?", body.CallLink, sessionID)
		jsonOK(w, map[string]string{"status": "recording saved"})

	case "rate":
		if status != "confirmed" {
			jsonError(w, "You can only rate completed sessions", 400)
			return
		}
		if body.Stars < 1 || body.Stars > 5 {
			jsonError(w, "Stars must be between 1 and 5", 400)
			return
		}

		// Figure out which column to update and which user is being rated
		var ratedCol string
		var ratedUserID int
		if isRequester {
			ratedCol = "requester_rated"
			ratedUserID = partID
		} else {
			ratedCol = "partner_rated"
			ratedUserID = reqID
		}
		var alreadyRated int
		db.QueryRow("SELECT "+ratedCol+" FROM sessions WHERE id=?", sessionID).Scan(&alreadyRated)
		if alreadyRated > 0 {
			jsonError(w, "You already rated this session", 400)
			return
		}

		db.Exec("UPDATE sessions SET "+ratedCol+"=? WHERE id=?", body.Stars, sessionID)

		// Recalculate the rated user's average across all their sessions
		var totalStars, ratingCount int
		db.QueryRow(`SELECT
			COALESCE(SUM(CASE WHEN partner_id=? AND requester_rated>0 THEN requester_rated ELSE 0 END),0) +
			COALESCE(SUM(CASE WHEN requester_id=? AND partner_rated>0  THEN partner_rated   ELSE 0 END),0),
			COALESCE(SUM(CASE WHEN partner_id=?  AND requester_rated>0 THEN 1 ELSE 0 END),0) +
			COALESCE(SUM(CASE WHEN requester_id=? AND partner_rated>0  THEN 1 ELSE 0 END),0)
			FROM sessions`,
			ratedUserID, ratedUserID, ratedUserID, ratedUserID).Scan(&totalStars, &ratingCount)

		if ratingCount > 0 {
			db.Exec("UPDATE users SET rating=? WHERE id=?",
				float64(totalStars)/float64(ratingCount), ratedUserID)
		}
		jsonOK(w, map[string]string{"status": "rating saved"})

	default:
		jsonError(w, "Unknown action: "+body.Action, 400)
	}
}

// ─── Avatar upload ────────────────────────────────────────────────────────────
// The browser sends the photo as a base64 string. We decode it and save it as a
// .jpg file in static/avatars/. Only the file path is stored in the database.

func handleUploadAvatar(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := requireAuth(w, r)
	if !ok {
		return
	}

	var body struct {
		Data string `json:"data"` // base64 data URL like "data:image/jpeg;base64,..."
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Data == "" {
		jsonError(w, "Invalid image data", http.StatusBadRequest)
		return
	}

	// Strip the "data:image/jpeg;base64," prefix to get just the base64 bytes
	raw := body.Data
	if idx := strings.Index(raw, ","); idx != -1 {
		raw = raw[idx+1:]
	}
	imgBytes, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		jsonError(w, "Could not decode image", http.StatusBadRequest)
		return
	}
	if len(imgBytes) > 5*1024*1024 {
		jsonError(w, "Image too large (max 5MB)", http.StatusBadRequest)
		return
	}

	// Save the file as user-{id}.jpg, overwriting any previous photo
	avatarDir := filepath.Join(".", "static", "avatars")
	os.MkdirAll(avatarDir, 0755)
	filename := fmt.Sprintf("user-%d.jpg", userID)
	if err := os.WriteFile(filepath.Join(avatarDir, filename), imgBytes, 0644); err != nil {
		jsonError(w, "Could not save photo", http.StatusInternalServerError)
		return
	}

	// Return the URL with a timestamp to bust the browser cache when photo changes
	urlPath := fmt.Sprintf("/static/avatars/%s?t=%d", filename, time.Now().Unix())
	jsonOK(w, map[string]string{"url": urlPath})
}

// ─── Admin handlers ───────────────────────────────────────────────────────────
// Admin-only endpoints. requireAdmin checks both authentication and is_admin flag.

func requireAdmin(w http.ResponseWriter, r *http.Request) (int, bool) {
	userID, ok := requireAuth(w, r)
	if !ok {
		return 0, false
	}
	u, err := loadUser(userID)
	if err != nil || !u.IsAdmin {
		jsonError(w, "Admin access required", http.StatusForbidden)
		return 0, false
	}
	return userID, true
}

func handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	_, ok := requireAdmin(w, r)
	if !ok {
		return
	}

	rows, _ := db.Query(`
		SELECT id, name, email, bio, avatar, swaps, rating,
		       COALESCE(is_admin,0), COALESCE(is_banned,0), created_at
		FROM users ORDER BY created_at DESC`)
	defer rows.Close()

	type AdminUser struct {
		ID        int     `json:"id"`
		Name      string  `json:"name"`
		Email     string  `json:"email"`
		Bio       string  `json:"bio"`
		Avatar    string  `json:"avatar"`
		Swaps     int     `json:"swaps"`
		Rating    float64 `json:"rating"`
		IsAdmin   bool    `json:"is_admin"`
		IsBanned  bool    `json:"is_banned"`
		CreatedAt string  `json:"created_at"`
	}
	var users []AdminUser
	for rows.Next() {
		var u AdminUser
		rows.Scan(&u.ID, &u.Name, &u.Email, &u.Bio, &u.Avatar,
			&u.Swaps, &u.Rating, &u.IsAdmin, &u.IsBanned, &u.CreatedAt)
		users = append(users, u)
	}
	if users == nil {
		users = []AdminUser{}
	}
	jsonOK(w, users)
}

func handleAdminAction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	adminID, ok := requireAdmin(w, r)
	if !ok {
		return
	}

	var body struct {
		Action  string `json:"action"`
		UserID  int    `json:"user_id"`
		WarnMsg string `json:"warn_msg"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.UserID == adminID {
		jsonError(w, "You cannot perform admin actions on your own account", http.StatusBadRequest)
		return
	}

	switch body.Action {
	case "ban":
		db.Exec("UPDATE users SET is_banned=1 WHERE id=?", body.UserID)
		// Delete all tokens so they get kicked out immediately if currently online
		db.Exec("DELETE FROM auth_tokens WHERE user_id=?", body.UserID)
		jsonOK(w, map[string]string{"status": "banned"})

	case "unban":
		db.Exec("UPDATE users SET is_banned=0 WHERE id=?", body.UserID)
		jsonOK(w, map[string]string{"status": "unbanned"})

	case "warn":
		// Send a warning as a direct message from admin to user
		msg := body.WarnMsg
		if msg == "" {
			msg = "⚠️ You have received a warning from the admin. Please review the community guidelines and be respectful to other users."
		} else {
			msg = "⚠️ Admin Warning: " + msg
		}
		db.Exec("INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)",
			adminID, body.UserID, msg)
		jsonOK(w, map[string]string{"status": "warning sent"})

	case "delete":
		// Delete everything belonging to this user, in dependency order
		db.Exec("DELETE FROM sessions  WHERE requester_id=? OR partner_id=?", body.UserID, body.UserID)
		db.Exec("DELETE FROM messages  WHERE sender_id=? OR receiver_id=?", body.UserID, body.UserID)
		db.Exec("DELETE FROM skills    WHERE user_id=?", body.UserID)
		db.Exec("DELETE FROM auth_tokens WHERE user_id=?", body.UserID)
		db.Exec("DELETE FROM users     WHERE id=?", body.UserID)
		jsonOK(w, map[string]string{"status": "user deleted"})

	case "make_admin":
		db.Exec("UPDATE users SET is_admin=1 WHERE id=?", body.UserID)
		jsonOK(w, map[string]string{"status": "promoted to admin"})

	default:
		jsonError(w, "Unknown admin action: "+body.Action, http.StatusBadRequest)
	}
}

// ─── Delete handlers ──────────────────────────────────────────────────────────

func handleDeleteMessage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := requireAuth(w, r)
	if !ok {
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	msgID, _ := strconv.Atoi(parts[len(parts)-1])

	// Only allow deleting your own messages
	result, err := db.Exec("DELETE FROM messages WHERE id = ? AND sender_id = ?", msgID, userID)
	if err != nil {
		jsonError(w, "Delete failed", 500)
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		jsonError(w, "Message not found or not yours", 404)
		return
	}
	jsonOK(w, map[string]string{"status": "message deleted"})
}

func handleDeleteConversation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := requireAuth(w, r)
	if !ok {
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	otherID, _ := strconv.Atoi(parts[len(parts)-1])
	if otherID == 0 {
		jsonError(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	// Delete all messages between these two users in both directions
	db.Exec(`DELETE FROM messages WHERE
		(sender_id = ? AND receiver_id = ?) OR
		(sender_id = ? AND receiver_id = ?)`,
		userID, otherID, otherID, userID)
	jsonOK(w, map[string]string{"status": "conversation deleted"})
}

func handleDeleteAccount(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := requireAuth(w, r)
	if !ok {
		return
	}

	// Clean up all data belonging to this user before deleting the user row
	db.Exec("DELETE FROM sessions  WHERE requester_id=? OR partner_id=?", userID, userID)
	db.Exec("DELETE FROM messages  WHERE sender_id=? OR receiver_id=?", userID, userID)
	db.Exec("DELETE FROM skills    WHERE user_id=?", userID)
	db.Exec("DELETE FROM auth_tokens WHERE user_id=?", userID)
	db.Exec("DELETE FROM users     WHERE id=?", userID)
	http.SetCookie(w, &http.Cookie{Name: "session", Value: "", Expires: time.Unix(0, 0), Path: "/"})
	jsonOK(w, map[string]string{"status": "account deleted"})
}

// ─── Static file server with no-cache headers ─────────────────────────────────
// This wrapper adds Cache-Control: no-cache to every static file response.
// It prevents browsers (especially Chrome) from serving old JS/CSS after updates.

func noCacheFileServer(root http.FileSystem) http.Handler {
	fs := http.FileServer(root)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		fs.ServeHTTP(w, r)
	})
}

// ─── Demo bot seeding ─────────────────────────────────────────────────────────
// These two demo accounts are created automatically so the browse page
// isn't empty when someone runs the project for the first time.

type botProfile struct {
	name, email, bio string
	swaps            int
	rating           float64
	teach, learn     []string
}

func seedDB() {
	bots := []botProfile{
		{
			name: "Sarah Martinez", email: "sarah@skillswap.demo",
			bio:   "Full-stack developer with 6 years experience. Love teaching Python and web dev.",
			swaps: 34, rating: 4.8,
			teach: []string{"Python", "Web Development", "React"},
			learn: []string{"Music Production", "Spanish"},
		},
		{
			name: "Alex Kim", email: "alex@skillswap.demo",
			bio:   "Guitar teacher and hobbyist photographer. Been playing 12 years.",
			swaps: 21, rating: 4.9,
			teach: []string{"Guitar", "Music Theory", "Photography"},
			learn: []string{"Python", "Video Editing"},
		},
	}

	for _, b := range bots {
		var count int
		db.QueryRow("SELECT COUNT(*) FROM users WHERE email=?", b.email).Scan(&count)
		if count > 0 {
			continue
		} // skip if already seeded

		hash, _ := bcrypt.GenerateFromPassword([]byte("demo123"), bcrypt.DefaultCost)
		pref := "both"
		loc := ""
		if b.email == "alex@skillswap.demo" {
			pref = "in-person"
			loc = "New York, US"
		}
		if b.email == "sarah@skillswap.demo" {
			pref = "video"
		}

		res, err := db.Exec(`INSERT INTO users
			(name, email, password, bio, swaps, rating, location, session_pref)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			b.name, b.email, string(hash), b.bio, b.swaps, b.rating, loc, pref)
		if err != nil {
			continue
		}

		botID, _ := res.LastInsertId()
		for _, s := range b.teach {
			db.Exec("INSERT INTO skills (user_id, skill, type) VALUES (?, ?, 'teach')", botID, s)
		}
		for _, s := range b.learn {
			db.Exec("INSERT INTO skills (user_id, skill, type) VALUES (?, ?, 'learn')", botID, s)
		}
	}
}

// seedBotWelcome sends welcome messages from both bots to a new user.
// This runs in a goroutine so it doesn't slow down the registration response.
func seedBotWelcome(newUserID int) {
	time.Sleep(2 * time.Second)
	welcomes := map[string]string{
		"sarah@skillswap.demo": "Hey! Welcome to Skill Swap 👋 I'm Sarah. I teach Python and web development — feel free to reach out if you'd like to swap skills!",
		"alex@skillswap.demo":  "Welcome! I'm Alex 🎸 I teach guitar and music theory. Would love to do a skill exchange if you're interested!",
	}
	for email, msg := range welcomes {
		var botID int
		db.QueryRow("SELECT id FROM users WHERE email=?", email).Scan(&botID)
		if botID > 0 {
			db.Exec("INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)",
				botID, newUserID, msg)
		}
	}
}

// ─── Password Reset ───────────────────────────────────────────────────────────
// generateSecureToken creates a cryptographically random hex token
func generateSecureToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// sendResetEmail sends a password reset email via Resend API
func sendResetEmail(toEmail, resetURL string) error {
	apiKey := os.Getenv("RESEND_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("RESEND_API_KEY not set")
	}

	htmlBody := `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
		<h2 style="color:#C0392B;font-family:Georgia,serif">Skill Swap</h2>
		<p>Hi! You requested a password reset.</p>
		<p>Click the button below to set a new password. This link expires in 1 hour.</p>
		<a href="` + resetURL + `" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:600;margin:16px 0">Reset Password</a>
		<p style="color:#6B7280;font-size:.85rem">If you did not request this, you can safely ignore this email.</p>
	</div>`

	payload := map[string]interface{}{
		"from":    "Skill Swap <noreply@skillswapfly.quest>",
		"to":      []string{toEmail},
		"subject": "Reset your Skill Swap password",
		"html":    htmlBody,
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("resend API returned %d", resp.StatusCode)
	}
	return nil
}

func handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Email string `json:"email"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" {
		jsonError(w, "Email is required", http.StatusBadRequest)
		return
	}

	// Always return success so we don't reveal which emails are registered
	var userID int
	err := db.QueryRow("SELECT id FROM users WHERE email=?", email).Scan(&userID)
	if err != nil {
		jsonOK(w, map[string]string{"status": "ok"})
		return
	}

	// Delete any existing reset tokens for this user
	db.Exec("DELETE FROM reset_tokens WHERE user_id=?", userID)

	// Generate token and save
	token := generateSecureToken()
	expires := time.Now().Add(1 * time.Hour)
	db.Exec("INSERT INTO reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)", token, userID, expires)

	// Build reset URL
	scheme := "https"
	host := r.Host
	if host == "" {
		host = "skill-swap.fly.dev"
	}
	resetURL := scheme + "://" + host + "/reset?token=" + token

	// Send email in background so response is instant
	go func() {
		if err := sendResetEmail(email, resetURL); err != nil {
			log.Println("Failed to send reset email:", err)
		}
	}()

	jsonOK(w, map[string]string{"status": "ok"})
}

func handleResetPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Token == "" || len(body.Password) < 6 {
		jsonError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	var userID int
	var expiresAt time.Time
	err := db.QueryRow("SELECT user_id, expires_at FROM reset_tokens WHERE token=?", body.Token).
		Scan(&userID, &expiresAt)
	if err != nil {
		jsonError(w, "Invalid or expired reset link", http.StatusBadRequest)
		return
	}
	if time.Now().After(expiresAt) {
		db.Exec("DELETE FROM reset_tokens WHERE token=?", body.Token)
		jsonError(w, "This reset link has expired. Please request a new one.", http.StatusBadRequest)
		return
	}

	// Update password
	hash, _ := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	db.Exec("UPDATE users SET password=? WHERE id=?", string(hash), userID)

	// Delete token and all existing sessions so they must log in again
	db.Exec("DELETE FROM reset_tokens WHERE token=?", body.Token)
	db.Exec("DELETE FROM auth_tokens WHERE user_id=?", userID)

	jsonOK(w, map[string]string{"status": "ok"})
}

// ─── Server entry point ───────────────────────────────────────────────────────

func main() {
	initDB()
	seedDB()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Register all API routes
	http.HandleFunc("/api/register", handleRegister)
	http.HandleFunc("/api/login", handleLogin)
	http.HandleFunc("/api/logout", handleLogout)
	http.HandleFunc("/api/me", handleMe)
	http.HandleFunc("/api/profile", handleUpdateProfile)
	http.HandleFunc("/api/users", handleUsers)
	http.HandleFunc("/api/users/", handleUserByID)
	http.HandleFunc("/api/upload-avatar", handleUploadAvatar)
	http.HandleFunc("/api/messages", handleMessages)
	http.HandleFunc("/api/messages/", handleDeleteMessage)
	http.HandleFunc("/api/conversations", handleConversations)
	http.HandleFunc("/api/conversations/", handleDeleteConversation)
	http.HandleFunc("/api/sessions", handleSessions)
	http.HandleFunc("/api/sessions/", handleSessionAction)
	http.HandleFunc("/api/account", handleDeleteAccount)
	http.HandleFunc("/api/forgot-password", handleForgotPassword)
	http.HandleFunc("/api/reset-password", handleResetPassword)
	http.HandleFunc("/api/admin/users", handleAdminUsers)
	http.HandleFunc("/api/admin/action", handleAdminAction)

	// Serve static files (HTML, CSS, JS, avatar images) with no-cache headers
	http.Handle("/static/", http.StripPrefix("/static/",
		noCacheFileServer(http.Dir("./static"))))

	// Serve the single-page app for all non-API routes
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			jsonError(w, "Not found", http.StatusNotFound)
			return
		}
		http.ServeFile(w, r, "./static/index.html")
	})

	log.Printf("Skill Swap running at http://localhost:%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

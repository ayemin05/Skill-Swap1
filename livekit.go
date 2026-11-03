package main

// livekit.go — voice/video calls and screen sharing through LiveKit.
//
// LiveKit (https://livekit.io) is an open-source WebRTC server. Peerly never touches
// audio/video itself: the browser connects straight to LiveKit with a short-lived
// access token that this server signs. Set three secrets on Fly to turn calls on:
//
//   fly secrets set LIVEKIT_URL=wss://<your-project>.livekit.cloud \
//                   LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...
//
// Without them, the call buttons explain that calls aren't set up yet.

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"
)

func livekitConfigured() bool {
	return os.Getenv("LIVEKIT_URL") != "" && os.Getenv("LIVEKIT_API_KEY") != "" && os.Getenv("LIVEKIT_API_SECRET") != ""
}

// livekitToken builds a LiveKit access token (a JWT signed with HS256).
func livekitToken(roomName string, u *User, ttl time.Duration) (string, error) {
	key, secret := os.Getenv("LIVEKIT_API_KEY"), os.Getenv("LIVEKIT_API_SECRET")
	header := map[string]string{"alg": "HS256", "typ": "JWT"}
	now := time.Now()
	meta, _ := json.Marshal(map[string]string{"avatar": u.Avatar})
	claims := map[string]interface{}{
		"iss":      key,
		"sub":      strconv.Itoa(u.ID),
		"name":     u.Name,
		"metadata": string(meta),
		"nbf":      now.Add(-10 * time.Second).Unix(),
		"exp":      now.Add(ttl).Unix(),
		"video": map[string]interface{}{
			"room":           roomName,
			"roomJoin":       true,
			"canPublish":     true,
			"canSubscribe":   true,
			"canPublishData": true,
		},
	}
	enc := func(v interface{}) string {
		b, _ := json.Marshal(v)
		return base64.RawURLEncoding.EncodeToString(b)
	}
	unsigned := enc(header) + "." + enc(claims)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(unsigned))
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func writeCallToken(w http.ResponseWriter, roomName string, userID int) {
	if !livekitConfigured() {
		jsonError(w, "Calls aren't set up on this server yet", http.StatusServiceUnavailable)
		return
	}
	u, err := loadUser(userID)
	if err != nil {
		jsonError(w, "User not found", 404)
		return
	}
	token, err := livekitToken(roomName, u, 6*time.Hour)
	if err != nil {
		jsonError(w, "Could not create call token", 500)
		return
	}
	jsonOK(w, map[string]string{"url": os.Getenv("LIVEKIT_URL"), "token": token, "room": roomName})
}

// GET /api/calls/config — lets the page know whether to show call buttons as active
func handleCallConfig(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, map[string]bool{"enabled": livekitConfigured()})
}

// POST /api/calls/dm/{otherUserID} — start or join a private 1-to-1 call.
// The first person to start it also drops a "call" message into the chat
// so the other person sees a Join button.
func handleDMCall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := requireRoomUser(w, r)
	if !ok {
		return
	}
	otherID, _ := pathID(r.URL.Path, "/api/calls/dm/")
	if otherID == 0 || otherID == userID {
		jsonError(w, "Pick someone to call", 400)
		return
	}
	if _, err := loadUser(otherID); err != nil {
		jsonError(w, "User not found", 404)
		return
	}
	if !livekitConfigured() {
		jsonError(w, "Calls aren't set up on this server yet", http.StatusServiceUnavailable)
		return
	}
	a, b := userID, otherID
	if a > b {
		a, b = b, a
	}
	var body struct {
		Video  bool `json:"video"`
		Notify bool `json:"notify"`
	}
	decodeJSON(r, &body)
	if body.Notify {
		kind := "voice"
		if body.Video {
			kind = "video"
		}
		db.Exec("INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)",
			userID, otherID, fmt.Sprintf("[[call:%s]]", kind))
	}
	writeCallToken(w, fmt.Sprintf("peerly-dm-%d-%d", a, b), userID)
}

// roomCallName is the LiveKit room used for voice/video inside a Peerly room.
func roomCallName(roomID int) string { return "peerly-room-" + strconv.Itoa(roomID) }

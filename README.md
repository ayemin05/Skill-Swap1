# Skill Swap – Peer-to-Peer Skill Exchange Platform

## What is Skill Swap?

Skill Swap is a web application I built as part of my coursework project. The idea is simple — instead of paying for lessons, people exchange skills with each other. If I know Python and want to learn guitar, I find someone who teaches guitar and wants to learn Python, and we swap. No money involved, just knowledge.

I wanted to build something that felt like a real platform people could actually use, not just a basic CRUD app. So it has messaging, session scheduling, star ratings, admin moderation tools, and more.

---

## Tech Stack

### Backend — Go (Golang)
I used Go for the backend because it is fast, simple, and the standard library is powerful enough to build a full HTTP server without any frameworks. Everything runs on Go's built-in `net/http` package.

- **Database:** SQLite via the `go-sqlite3` driver. I chose SQLite because it requires zero setup — the database is just a single file (`skillswap.db`) which makes it easy to run locally without installing anything extra.
- **Authentication:** Session-based auth using HTTP cookies. When you log in, the server generates a token, stores it in the `auth_tokens` table, and sets it as a cookie. Every subsequent request checks that cookie to identify who you are.
- **Password security:** Passwords are hashed with `bcrypt` before being stored. Plain text passwords are never saved anywhere.
- **File uploads:** Profile photos are uploaded as base64 from the browser, decoded on the server, and saved as `.jpg` files in `static/avatars/`. Only the file path is stored in the database, not the image itself — this keeps the database small and fast.

### Frontend — Vanilla HTML, CSS, JavaScript
I intentionally avoided React, Vue, or any frontend framework. Everything is plain HTML, CSS, and JavaScript. This was a deliberate choice to really understand how the web works at a lower level.

- **Single-page app:** The whole site is one HTML file (`index.html`). Different "pages" are `<div>` elements shown or hidden with JavaScript. Navigation never reloads the page.
- **State management:** A single global object `S` holds all current state — the logged-in user, active conversation, filters, tags, etc.
- **Polling:** Since I did not use WebSockets, the messages page polls the server every 2.5 seconds for new messages. The sidebar polls every 3 seconds for unread counts.

---

## Features

### User Accounts
- Register and log in with email and password
- Profile photo upload (saved to server disk, not the database)
- Bio, location, and preferred session type (Video Call / In-Person / Both)
- Add skills you can teach and skills you want to learn
- Delete your own account

### Browse
- See all other users with their skills, ratings, swap count, location, and session preference
- Filter by: All Matches, Suggested (based on skill overlap), Online Now, Video Calls, In-Person
- Online status: a green dot appears if the user made any request in the last 10 minutes
- Your own profile is hidden from your browse view (you don't need to browse yourself)

### Messaging
- Real-time style chat using polling
- Unread count badge on the nav link
- Per-conversation unread dot that clears instantly when you open the chat
- Right-click or double-click a message to get options: Unsend or Copy
- Delete entire conversations from the sidebar hover buttons
- View the other person's profile directly from the chat topbar

### Sessions
- Schedule a skill swap session — choose which skills to exchange, date, time, duration, and session type
- **Video Call:** paste your Zoom / Google Meet / Teams link and the other person gets a "Join Video Call" button
- **Recorded:** paste a recording link (Google Drive, YouTube, etc.) after the session — it's stored permanently in the session so both people can always find it
- **In-Person:** no link needed, just the date, time, and agenda
- The receiver gets a notification badge and can Confirm, Decline, or Suggest a New Time
- The sender can Edit the time or Cancel at any point
- Swap count increments automatically for both people when a session is confirmed
- Rating (1–5 stars) only appears after the session end time has actually passed — not immediately after confirming

### Rating system
- Star rating with emoji labels (Poor / Fair / OK / Good / Excellent)
- Hover to preview, click to select, then a "Submit" button appears
- A confirmation dialog before saving so accidental clicks don't count
- Each user's average rating recalculates automatically across all their sessions

### Admin System
- The account registered with `ayem4004@gmail.com` is permanently the superadmin
- Admin users see a ⚙️ Admin link in the navigation
- Admin panel shows stats (total users, real users, banned count) and a guide explaining each action
- **View any user's profile** — admin action buttons (Ban, Warn, Delete) appear at the bottom of the profile modal
- **Ban** — user is kicked out immediately (tokens deleted) and cannot log back in; hidden from browse
- **Unban** — restores access
- **Warn** — sends a custom warning message directly to the user's inbox
- **Make Admin** — promotes another user to admin
- **Delete** — permanently removes all their data with a double confirmation

---

## How to Run

**Requirements:**
- Go 1.21 or later
- GCC (required for go-sqlite3 — on Mac this comes with Xcode Command Line Tools: `xcode-select --install`)

**Steps:**
```bash
cd skillswap-3
go run main.go
```

Then open `http://localhost:8080` in your browser.

The database file `skillswap.db` is created automatically on first run. Two demo bot accounts (Sarah Martinez and Alex Kim) are seeded automatically so the browse page is not empty when you first start.

**To get admin access:** Register with `ayem4004@gmail.com` — it is automatically promoted to admin on registration.

---

## Project Structure

```
skillswap-3/
├── main.go              # All backend logic — routes, handlers, database
├── skillswap.db         # SQLite database (auto-created on first run)
├── go.mod / go.sum      # Go module dependency files
└── static/
    ├── index.html       # Single-page app shell — all pages as div elements
    ├── css/
    │   └── style.css    # All styles — tokens, layout, components
    ├── js/
    │   └── main.js      # All frontend logic — state, API calls, rendering
    └── avatars/         # Uploaded profile photos (auto-created)
```

---

## Design Decisions

**Why no framework?** I wanted to understand the fundamentals properly. Using React would have hidden a lot of what is actually happening. Building everything from scratch taught me more about how HTTP, cookies, state management, and DOM manipulation actually work.

**Why SQLite?** For a project like this, SQLite is perfect. There is no need to install or configure a separate database server. The whole database is one file you can copy, inspect, or delete easily.

**Why polling instead of WebSockets?** WebSockets would be more efficient for real-time messaging but they add significant complexity to both the server and client. Polling every 2.5 seconds is simple, reliable, and perfectly acceptable for a project of this scale.

**Colour choices:** Blue (`#2563EB`) is used as the primary action colour for all interactive buttons. This is the most universally recognised and accessible choice. The brand coral-red (`#C0392B`) is reserved only for the logo, not for interactive elements, to avoid confusion between brand identity and clickable actions.

---

## What I Learned

- How to build a full HTTP API in Go using only the standard library
- How session-based authentication works with cookies and tokens
- How to manage a relational database schema with SQLite and handle migrations safely
- How single-page applications work without a framework
- How to handle file uploads — decode base64 on the server and serve static files
- The importance of separating concerns — API logic in Go, UI logic in JavaScript
- How real-time-feeling features can be built without WebSockets using polling
- How to design a moderation system with role-based access control

---

*Built with Go, SQLite, HTML, CSS, and JavaScript. No external frameworks.*

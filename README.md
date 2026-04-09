# Skill Swap – Peer-to-Peer Skill Exchange Platform

## Live Demo

**https://skill-swap.fly.dev**

---

## What is Skill Swap?

Skill Swap is a full-stack web application that lets people exchange skills with each other for free. Instead of paying for lessons, users list what they can teach and what they want to learn, then connect with others who complement their skillset. If I know Python and want to learn guitar, I find someone who teaches guitar and wants to learn Python — and we swap. No money involved, just knowledge.

I wanted to build something that felt like a real platform people could actually use — not just a basic CRUD app. So it includes real-time messaging, session scheduling, a star rating system, user moderation tools, and a full admin panel. The entire project runs as a single binary, deployed on Fly.io with persistent storage.

---

## Tech Stack

### Backend — Go (Golang)

Go was chosen for the backend because of its speed, simplicity, and powerful standard library. The entire server runs on Go's built-in `net/http` package — no frameworks.

- **Language:** Go 1.22
- **Database:** SQLite via the `go-sqlite3` driver — zero setup, the database is a single file (`skillswap.db`) created automatically on first run
- **Authentication:** Session-based auth using HTTP cookies — on login the server generates a secure token, stores it in the `auth_tokens` table, and sends it as a cookie; every subsequent request is verified against that token
- **Password security:** All passwords are hashed with `bcrypt` before storage — plain-text passwords are never saved at any point
- **File uploads:** Profile photos are sent as base64 from the browser, decoded server-side, and saved as `.jpg` files in `static/avatars/` — only the file path is stored in the database, keeping it small and fast
- **REST API:** All frontend–backend communication goes through a clean JSON API (`/api/...` routes)
- **Email:** Password reset emails are sent via Resend (`api.resend.com`) — the API key is stored as a Fly.io environment secret, never in the codebase

### Frontend — Vanilla HTML, CSS, JavaScript

The entire frontend was built without any framework — no React, Vue, or similar. This was a deliberate choice to understand the fundamentals properly.

- **HTML:** One file (`index.html`) — different pages are `<div>` elements toggled with JavaScript; navigation never reloads the page, making it a true single-page application (SPA)
- **CSS:** Custom design system with CSS variables (design tokens) for colours, spacing, and typography — fully responsive across desktop, tablet, and mobile with a hamburger navigation menu on small screens
- **JavaScript:** All frontend logic in one file (`main.js`) — state management, API calls, DOM rendering, and real-time polling
- **State management:** A single global object `S` holds all runtime state — the logged-in user, active page, open conversation, skill tags, filters, etc.
- **Real-time messaging:** The messages page polls the server every 2 seconds for new messages with a concurrency lock to prevent overlapping requests — this gives a real-time feel with simple, reliable code

### Deployment — Docker

The project includes a multi-stage Dockerfile that compiles the Go binary in a builder container and runs it in a minimal Alpine Linux image. This keeps the final image small and makes the app deployable to any cloud platform that supports Docker (Railway, Fly.io, Render, etc.).

---

## Features

### User Accounts

- Register and sign in with email and password
- Email format validation on registration
- Profile photo upload
- Bio, location, and preferred session type (Video Call / In-Person / Both)
- Add and remove skills you can teach and skills you want to learn
- Delete your own account permanently

### Browse

- See all users with their skills, star rating, swap count, location, and session preference
- Search by skill or name
- Filter by: All Matches, Suggested (based on skill overlap with your profile), Online Now, Video Calls, In-Person
- Online status indicator — a green dot appears if the user was active in the last 10 minutes
- Your own profile is hidden from your browse view

### Messaging

### Sessions

- Schedule a skill swap session with any user — choose which skills to exchange, date, time, duration, and session type
- **Video Call:** paste a Zoom / Google Meet / Teams link and the other person gets a "Join Video Call" button
- **Recorded:** paste a recording link (Google Drive, YouTube, etc.) after the session — stored permanently so both people can always find it
- **In-Person:** no link required, just date, time, and an optional agenda
- Session dates are validated — past dates cannot be selected
- The receiver gets a notification badge and can Confirm, Decline, or Suggest a New Time
- The sender can Edit the time or Cancel at any point
- Swap count increments automatically for both users when a session is confirmed
- The rating form only appears after the session end time has actually passed

### Rating System

- 1–5 star rating with emoji labels (Poor / Fair / OK / Good / Excellent)
- Hover to preview, click to select — a Submit button then appears
- Confirmation dialog before saving so accidental clicks do not count
- Each user's average rating recalculates automatically across all their sessions

### Admin System

- Admin users see an Admin link in the navigation
- Admin panel displays live stats (total users, real users, banned count)
- Search and filter through all registered users
- **View any profile** — admin action buttons appear at the bottom of the profile modal
- **Ban** — kicks the user out immediately (all tokens deleted) and hides them from browse
- **Unban** — restores full access
- **Warn** — sends a custom warning message directly to the user's inbox via a dedicated modal
- **Make Admin** — promotes another user to admin
- **Delete** — permanently removes the user and all their data with double confirmation

### Password Reset

- "Forgot password?" link on the sign-in form
- User enters their email and receives a reset link via email
- Powered by Resend via skillswapfly.quest — a secure token is generated, stored with a 1-hour expiry, and emailed to the user
- Clicking the link opens a reset page where the user sets a new password
- Token is deleted and all existing sessions are invalidated after a successful reset
- Always returns a success message regardless of whether the email exists, so registered emails are never revealed

### Messaging

- Real-time style chat using polling (1-second interval)
- **Read receipts** — ✓ sent, ✓✓ delivered (recipient is online), ✓✓ green when read
- Optimistic message sending — message appears instantly before server confirmation
- Browser notifications when a new message arrives and the tab is in the background
- Unread message badge on the navigation link
- Right-click or double-click any message bubble for options: Unsend or Copy
- Delete entire conversations from the sidebar

---

## Project Structure

```
Skill-Swap/
├── main.go              # All backend logic — routes, handlers, database schema
├── skillswap.db         # SQLite database (auto-created on first run)
├── go.mod               # Go module definition
├── go.sum               # Dependency checksums
├── Dockerfile           # Multi-stage Docker build for deployment
└── static/
    ├── index.html       # Single-page app — all pages as toggled div elements
    ├── css/
    │   └── style.css    # Full design system — tokens, layout, components, responsive
    └── js/
        └── main.js      # All frontend logic — state, API calls, rendering, polling
```

---

## How to Run Locally

**Requirements:**

- Go 1.21 or later
- GCC (required by go-sqlite3 for CGo compilation)
  - macOS: `xcode-select --install`
  - Ubuntu/Debian: `sudo apt install build-essential`
  - Windows: install [TDM-GCC](https://jmeubank.github.io/tdm-gcc/)

**Steps:**

```bash
# 1. Enter the project folder
cd Skill-Swap

# 2. Run the server
go run main.go

# 3. Open in browser
# http://localhost:8080
```

The database is created automatically on first run. Two demo accounts are seeded so the browse page is not empty when you first open it.

---

## How to Run with Docker

```bash
# Build the image
docker build -t skillswap .

# Run the container
docker run -p 8080:8080 skillswap
```

Then open `http://localhost:8080`.

---

## Design Decisions

**Why no framework?**
Using React or Vue would have hidden a lot of what is actually happening. Building everything from scratch meant genuinely understanding how HTTP, cookies, session state, DOM manipulation, and event-driven UI all work together. The result is also a much simpler codebase — one HTML file, one CSS file, one JS file — with no build step required.

**Why SQLite?**
For a platform of this scale, SQLite is the right tool. There is no database server to install, configure, or maintain. The entire database is a single file that can be backed up, inspected, or reset instantly. Go's `go-sqlite3` driver provides full SQL support with foreign key constraints and efficient indexed queries.

**Why polling instead of WebSockets?**
WebSockets require persistent connections and more complex server-side handling. Polling every 2 seconds with a concurrency lock is simple, stateless, and reliable — and at this scale the performance difference is imperceptible to users. The polling interval was chosen to feel instant while keeping server load minimal.

**Why session-based auth instead of JWTs?**
JWTs are stateless, which means you cannot invalidate them without extra infrastructure. Session tokens stored in the database can be deleted instantly — which is essential for features like banning a user (their session is revoked immediately) or logging out from all devices.

**Colour system:**
Blue (`#2563EB`) is used as the primary action colour for all interactive elements — buttons, links, focus rings. The brand coral-red (`#C0392B`) is reserved only for the logo and identity, never for interactive elements. This separation prevents confusion between brand colour and actionable UI.

**Accessibility:**
All interactive elements have visible focus styles for keyboard users. ARIA labels are applied to icon-only buttons. Modals move focus inside on open. Colour contrast ratios meet WCAG AA standards throughout.

---

## Languages Used

| Language   | Purpose                                                                   |
| ---------- | ------------------------------------------------------------------------- |
| Go         | Backend server, REST API, authentication, database queries, file handling |
| SQL        | Database schema and all queries via go-sqlite3                            |
| HTML       | Single-page application structure                                         |
| CSS        | Design system, layout, components, responsive breakpoints                 |
| JavaScript | Frontend state management, API communication, DOM rendering               |
| Dockerfile | Multi-stage containerised build for deployment                            |

---

_Built with Go, SQLite, HTML, CSS, and JavaScript. No external frameworks or libraries._

# Skill Swap – Peer-to-Peer Skill Exchange Platform

## Live Demo

**https://skill-swap.fly.dev**

---

## What is Skill Swap?

Skill Swap is a full-stack web-based website where you are able to trade your skills with one another without spending anything. Rather than having to pay for classes, users simply create a profile listing what they are able to teach and what they would like to learn, and then get connected to users whose interests match theirs. For example, if I am familiar with Python but want to learn how to play the guitar, I will look up someone who teaches guitar but wants to learn Python — we trade knowledge, no cash exchanged.

This was my first time building an actual website rather than a simple CRUD app. It had to include many features including real-time messaging, session scheduling, user ratings (stars), moderation, and a complete admin panel. The entire project is compiled into a single executable which runs on Fly.io with persistent data storage.

---

## Tech Stack

### Backend — Go (Golang)

The backend is implemented in Go due to its performance, simplicity, and the strength of its standard library — particularly the built-in `net/http` package. No framework is used.

- **Language:** Go 1.22
- **Database:** SQLite via the `go-sqlite3` driver — requires zero setup. The database is a single file (`skillswap.db`) that creates itself when the application runs for the first time.
- **Authentication:** Authenticated users have their session managed by an HTTP cookie. When a user logs in, the server generates a secure token, stores it in the `auth_tokens` table, and sends it back as a cookie. Any subsequent requests must present this token to authenticate.
- **Password security:** Plain-text passwords are never stored anywhere. All passwords are hashed with `bcrypt` before being saved to the database.
- **File uploads:** Client-side profile images are base64-encoded and transmitted to the server, where they are decoded, saved as `.jpg` files in `static/avatars/`, and only the file path is stored in the database — keeping the data size low to help performance.
- **REST API:** All interactions between the frontend and backend go through a REST API (`/api/...` routes).
- **Email:** Password reset emails are sent via Resend using a verified custom domain (`skillswapfly.quest`). The API key is stored as a Fly.io environment secret and never appears in the codebase.

### Frontend — Vanilla HTML, CSS, JavaScript

The whole frontend has been built without using any framework such as React or Vue. I chose to do this because I wanted to get down to the basics first so I could develop a proper understanding of how the building blocks of a web app work together.

- **HTML:** There is only one file called `index.html`. Each "page" in the app is made up of `<div>` elements which are toggled by JavaScript when you navigate. Because there is no full page refresh, it is technically a Single Page Application (SPA).
- **CSS:** A custom design system with CSS variables (design tokens) has been implemented for colour, spacing, and typography. The CSS is written to be responsive and works well across desktop, tablet, and mobile. On smaller screens a hamburger navigation menu appears.
- **JavaScript:** All frontend logic lives in `main.js` — state management, API calls, DOM rendering, real-time polling, and everything else.

### Deployment — Docker

The application uses a multi-stage Dockerfile which compiles the Go binary in a builder container and runs it from a minimal Alpine Linux image. The result is a small final image that can be deployed on any cloud service that supports Docker.

---

## Features

### User Accounts

- Sign up and log in using an email address and password
- Email format is validated on registration
- Upload a profile photo
- Enter bio, location, and preferred session type (Video Call / In-Person / Both)
- Add and remove skills you can teach and skills you want to learn
- Completely delete your account

### Browse & Filter Users

- View all users' profiles, ratings, swap counts, locations, and preferred session types
- Search by a specific skill or name
- Filter by: All Matches, Suggested (based on skill overlap), Online Now, Video Calls, In-Person
- A green dot appears next to a user's name if they were actively logged in within the last 10 minutes
- Your own profile is never shown to you while browsing

### Messaging

- Real-time style chat using polling (every 2 seconds with a concurrency lock)
- Read receipts — ✓ sent, ✓✓ delivered (recipient is online), ✓✓ green when read
- Optimistic send — messages appear instantly before the server confirms
- Browser notifications when a new message arrives and the tab is in the background
- In-app toast notification when a message arrives and you are on a different page
- Unread message badge on the navigation link
- Right-click or double-click any message bubble for options: Unsend or Copy

### Creating / Scheduling Sessions

- Create a session with any other user, including: skills to trade, date, time, duration, and session type
- **Video Call:** paste a Zoom / Google Meet / Teams link and the recipient gets a "Join Video Call" button
- **Recorded:** paste a recording link after the session — stored permanently so both people can always access it
- **In-Person:** no link required, just date, time, and an optional agenda
- Past dates are blocked — you cannot schedule a session in the past
- The recipient gets a notification badge and can Confirm, Decline, or Suggest a New Time
- Either party can edit the time or cancel before the session starts
- Both users' swap counts increase automatically when a session is confirmed
- The rating form only appears after the scheduled end time of the session has passed

### Rating System

- 1–5 star rating with emoji labels (Poor / Fair / OK / Good / Excellent)
- Hover to preview and click to select — a Submit button then appears
- A confirmation dialog must be accepted before saving, so accidental clicks don't count
- Each user's average rating recalculates automatically after every completed session

### Admin System

- Admin users see an Admin link in the navigation
- Live stats are displayed on the admin panel (total users, real users, banned count)
- All registered users can be searched and filtered
- Any user's profile can be viewed — admin action buttons appear at the bottom of the modal
- **Ban** — removes the user immediately (all tokens deleted), hidden from browse
- **Unban** — restores full access
- **Warn** — sends a custom warning message directly to the user's inbox via a modal
- **Make Admin** — promotes another user to admin
- **Delete** — permanently removes the user and all their data, requires double confirmation

### Password Reset

- "Forgot your password?" link on the sign-in form
- User enters the email address they used to register
- A secure token is generated and stored with a 1-hour expiry
- A reset link is emailed to the user via Resend
- Clicking the link opens a page where the user sets a new password
- After resetting, the token is deleted and all existing sessions are invalidated
- Always returns a success message regardless of whether the email exists — registered addresses are never revealed

---

## Project Structure

```
Skill-Swap1/
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
If I used a library like React or Vue, a lot of the actual implementation details would have been abstracted away. Because I built everything from scratch, I had to understand how HTTP requests and responses, cookies, session state, DOM manipulation, and event-driven UI components really interact with each other. This resulted in an extremely simple codebase — one HTML file, one CSS file, one JS file — with a very easy build process that doesn't require a separate build environment.

**Why SQLite?**
SQLite was the best choice for a platform at this level of complexity. It requires no installation, configuration, or maintenance of a database server. The database is simply a single file which can be easily backed up, viewed, or completely reset at any time. Go's `go-sqlite3` package provides full SQL capability including foreign key constraints and efficient indexed queries.

**Why polling instead of WebSockets?**
WebSockets require a persistent connection on both ends and have their own server-side complexities. Polling every 2 seconds with a concurrency lock is simple, stateless, and reliable — and the performance difference compared to WebSockets is indistinguishable at the scale of this app. A 2-second polling interval feels instant while keeping server load minimal.

**Why session-based auth instead of JWTs?**
Stateless JWTs cannot be invalidated by your application without additional supporting infrastructure. Because session tokens are stored in the database, they can be deleted in real time — which is necessary for features like banning a user (their session is removed immediately) or logging out from all devices.

**Colour system:**
Blue (`#2563EB`) is the primary action colour for all interactive elements (buttons, links, focus rings). The coral-red brand colour (`#C0392B`) is only used for branding and identity — never for interactive elements. Keeping them separate helps prevent users from confusing branding with clickable UI.

**Accessibility:**
All interactive elements have visible focus styles for keyboard users. Icon-only buttons use ARIA labels. Modals move keyboard focus inside on open. All colour combinations meet WCAG AA contrast standards.

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

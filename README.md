# Skill Swap – Peer-to-Peer Skill Exchange Platform

## What is Skill Swap?

Skill Swap is a web application that I created during my course work project. The concept is very straightforward -- if you have an extra hour or two in your day, you can earn time for another skill by teaching/trading skills with others. For example, I am learning python and also play guitar. I find someone who teaches guitar but wants to learn python. We trade skills without giving up any money. Just sharing knowledge.

In order to create something that looked/acted like a real platform (not just a simple CRUD application), I included many features. Features include messaging, session scheduling, rating systems, and administrative management options.

---

## Tech Stack

### Backend — Go (Golang)

I have chosen Go as my back-end technology due to its speed and simplicity; the standard library includes a full HTTP server implementation. All of the logic behind the web application is therefore based upon the Go `net/http` package.

- **Database:** The database is implemented using SQLite with an additional layer provided by the `go-sqlite3` driver. This was chosen since it has no setup requirements – all of the information needed to access the data is contained within a single file (`skillswap.db`) so there is no need to install or configure anything extra when running locally.
- **Authentication:** Authentication is session-based using HTTP cookies. Once a user logs in their username is added to a record in the `auth_tokens` table and their associated token is then sent to them as a cookie. Each time they make a request to the server, they provide this cookie so they can be identified. 
- **Password Security:** All password data is encrypted prior to being written into the database with `bcrypt`. There are no plain-text password fields anywhere in my system. 
- **File Uploads:** Profile images are Base64 encoded from the client side and decoded once received at the server-side where they are saved as `.jpg` files to `static/avatars/`. The path to each image will be stored in the database but the actual image will not.

### Frontend — Vanilla HTML, CSS, JavaScript

I deliberately chose not to use React, Vue, or any front-end frameworks. The entire application uses plain HTML, CSS, and JavaScript. This was an intentional decision to learn as much about the structure of the web as possible at a low level.

- **Single-page App:** All content on the site is in one single HTML file (the `index.html`). All pages are made up of `div` elements which are either hidden or displayed by using JavaScript. No navigation ever loads a new html document.
- **State Management:** One global object `S` contains the entirety of current states, i.e. the currently logged in user, the active conversation, filters applied, tags used, etc.
- **Polling:** Because I did not utilize WebSocket's to get real-time updates from the server, the Messages page will poll the server every 2.5 seconds for new message(s) and the Sidebar will poll every 3 seconds to see if there are unread count(s).

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

- Set up a skill exchange meeting - determine what you want to trade, the day/time, length of meeting, and type of meeting 
- **Video Call:** enter the video call link from Zoom / Google Meet / Teams and the person will have a “Join Video Call” option.
- **Recorded Session**: after completing the meeting, enter the URL for that recorded meeting (Google Drive, YouTube, etc.), it will be saved permanently in this section so both parties will always be able to access it.
- **In-Person Meeting**: enter the date, time and agenda for the meeting; no link required
- After setting up a session, the recipient will receive an alert with options to Accept, Decline or Propose a new date and time for the meeting.
- At anytime prior to accepting, the sender may edit the time or cancel the meeting
- When either party accepts, each parties’ swap count will increase by one for each confirmed session. 
- Only after a session’s end time has been reached does the star rating appear (it doesn’t show as soon as they accept)

### Rating System

- Star ratings with emojis (Poor / Fair / Okay / Good / Excellent).
- On hover there is a preview of how many stars are selected; on click there is an option to select, then submit. 
- Confirmation dialog appears before submitting to prevent accidental submissions. 
- For each user, the average rating will automatically update as additional sessions occur.

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
cd Skill-Swap1
go run main.go
```

Then open `http://localhost:8080` in your browser.

The database file `skillswap.db` is created automatically on first run. Two demo bot accounts (Sarah Martinez and Alex Kim) are seeded automatically so the browse page is not empty when you first start.

**To get admin access:** Register with `ayem4004@gmail.com` — it is automatically promoted to admin on registration.

---

## Project Structure

```
Skill-Swap1/
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

**Why did I NOT use a Framework?** I am interested in learning the basics first. Using React would have hidden much of what is actually going on. By building it all from scratch, I was able to learn more about how HTTP works (for example), how cookies are stored, how state is managed and how the DOM is manipulated.

**Why did I choose SQLite?** For a project such as this SQLite is great. A separate database server does not need to be installed and configured. The whole database is simply one file which can be copied, inspected or deleted with ease.

**Why did I choose polling over WebSockets?** While WebSockets may be an easier method for implementing real time communication they increase significantly the amount of code that needs to be written for both the client and the server. In addition to the simplicity of polling every 2.5 seconds, it is also very reliable and suitable for projects of this size.

**Colour Choices:** Blue (`#2563EB` ) has been chosen as the primary action color for all buttons. Blue is a universally recognized and accessible color for all interactive buttons. Coral Red (`#C0392B`) is being saved strictly for the branding logo and not for interactive elements.

---

## What I Learned

- How to implement a complete HTTP API using only the Standard Library in Go 
- How cookie and token based sessions are implemented for Authentication
- How to define a relational database schema with SQLite and how to do it safely with Migrations.
- How Single Page Applications (SPAs) operate without use of a Framework.
- How file uploads will be handled; decoding base64 at server and serving static files.
- Why separation of concerns is important -- API logic in Go, UI logic in JavaScript
- How you can create "real-time" like functionality without the need for WebSockets by utilizing polling. 
- How to create moderation systems that utilize role-based access control

---

_Built with Go, SQLite, HTML, CSS, and JavaScript. No external frameworks._

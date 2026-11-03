# Peerly — a hangout space for Burmese people abroad

Peerly is where Myanmar people living overseas meet, chat, call, watch things together and study together. It starts with the Burmese diaspora (Finland, Japan, Thailand, Singapore, the UK and more) and can open up to everyone later.

## What's built

| Area | What works now |
|---|---|
| **Feed** | Text + photo posts, likes, comments, "Everyone" / "My groups" |
| **Groups** | 8 starter groups, join/leave, create your own, group pages |
| **Group chat + group call** | Every group gets a **Lounge** room automatically: live chat + voice/video |
| **Watch together** | YouTube links or an uploaded MP4/WebM, synced play/pause/seek for everyone, late joiners land at the right moment, live chat beside the video, floating emoji reactions |
| **Study rooms** | Shared Pomodoro timer (25/5, 50/10, 90/15), auto focus→break, chime, chat on breaks, optional voice/camera |
| **Hangouts** | Voice chat rooms with friends |
| **Calls** | Voice, camera and **screen share** in any room (LiveKit); private 1-to-1 voice/video calls from Messages with a ringing banner and a "Join" card in the chat |
| **Messages** | Original Skill Swap DMs, now safe from injected HTML |
| **Sharing** | Every room has a link (`/room/12`) — friends who aren't members sign up and land straight in the room |
| **Language** | English / မြန်မာ toggle |
| **Mobile** | Bottom tab bar, phone-sized room layout |

Tested end to end with two and three separate users in real browsers: sync, late joining, chat, reactions, voice + camera through a local LiveKit server, study timer, 1-to-1 calls, and the security fixes (26/26 checks, twice in a row).

## Turning on calls (10 minutes)

Calls need LiveKit. Everything else works without it — the call buttons just say calls aren't set up.

1. Make a free account at <https://cloud.livekit.io> and create a project. The free **Build** plan needs no credit card and includes 5,000 participant-minutes a month and 100 people at once. (Five friends on a one-hour call uses 300 minutes.)
2. In the project's **Settings → Keys**, create an API key. Copy the URL (`wss://….livekit.cloud`), the key and the secret.
3. On your computer, in the project folder:
   ```
   fly secrets set LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud LIVEKIT_API_KEY=xxx LIVEKIT_API_SECRET=yyy
   ```
   Fly restarts the app and calls are live.

If it grows past the free plan, LiveKit's next plan is $50/month, or LiveKit can be self-hosted (it's open source) — a good cloud project for your degree.

## Things to know

- **Uploaded videos** are stored on the Fly volume (max 400 MB each; the old file is deleted when someone plays a different video or the room closes). Check the volume size with `fly volumes list` — extend it with `fly volumes extend` if people upload a lot.
- **Watch together only syncs what each person can already play**: YouTube links, or videos the uploader has the right to share. Don't add support for streaming pirated films — it's illegal and would get the site taken down.
- **One server**: live rooms keep connections in memory, so keep Fly at **one machine** (the current setup). Going multi-machine later means adding Redis or NATS for room events.
- **Database**: switched SQLite to WAL mode. Before, every request wrote to the database and reads blocked writes, which caused 5-second stalls once rooms were busy.

## Next steps (suggested order)

1. **Deploy and invite 10–20 friends** abroad. Real feedback beats more features.
2. **Phone notifications** (Web Push) so calls ring and messages arrive when the app is closed. Today a call only rings while Peerly is open.
3. **Install as an app** (PWA manifest + icon) so it sits on phone home screens.
4. **Watch-party queue** and "host only" controls for bigger rooms.
5. **Room scheduling** ("Movie night Fri 20:00") with reminders in the group feed.
6. **Moderation**: report post/message/room, admin queue, slow mode in busy chats.
7. **Study stats**: focus minutes per week, streaks, study-buddy matching (ties back to skill swap).
8. **Learning streams**: one person teaches live (screen share already works), with replays.
9. **Native apps** later via Capacitor, reusing this web app.
10. Open to other communities once the Burmese one is lively.

# THIS README IS OUTDATED

# Spellforge Showdown Backend Networking Implementation Plan

**Version:** November 2025\
**Authors:** Aidan Decina (Unity), Networking Team (Node.js / PostgreSQL)

---

## Overview

The backend stack supports **Unity Netcode gameplay** by managing **lobbies, player connections, and persistent match data** through a **Node.js + Express + Socket.IO** server and **PostgreSQL** database.

Unity handles all *real-time gameplay*; Node.js handles *meta-networking* and persistence.

---

## Architecture Summary

```
[Unity Game Client]
   ↓ REST / WebSocket
[Node.js Server]
   ↓ SQL Queries
[PostgreSQL Database]
```

- Unity connects to Node.js via HTTP (`UnityWebRequest`) and Socket.IO (`DogHappy’s Socket.IO client`).
- Node.js handles room creation, player joins, and match lifecycle.
- PostgreSQL stores users, matches, and stats.

---

## Division of Responsibility

| Layer          | Technology                  | Responsibilities                                 |
| -------------- | --------------------------- | ------------------------------------------------ |
| **Unity (C#)** | Unity Netcode (NGO) + Relay | Gameplay, movement, combat, projectiles, syncing |
| **Node.js**    | Express + Socket.IO         | Lobbies, join codes, match coordination, stats   |
| **PostgreSQL** | Managed DB (DigitalOcean)   | Persistent user, match, and stat data            |

---

## Step-by-Step Implementation Plan

### Phase 1: Document & Refine Existing Code&#x20;

**Files:** `index.js`, `rooms.js`, `client-create.js`, `client-join.js`, `schemas.js`

1. Review current event flow (`create-room`, `join-room`, `list-rooms`).
2. Add inline comments explaining each event and expected payload.
3. Ensure all event inputs are validated via **Zod** in `schemas.js`.
4. Add error handling (`try/catch` with `socket.emit('error', message)`).

**Deliverable:** Documented, stable in-memory room management system with clean event logging.

---

### Phase 2: Add REST API for Lobby Management&#x20;

**Files:** new `/routes/lobbies.js` + update `index.js`

Implement standard REST endpoints for Unity to call:

```js
POST /api/lobbies/create
POST /api/lobbies/join
GET  /api/lobbies/list
```

Each endpoint should:

- Validate input using `schemas.js`.
- Call helper functions in `rooms.js` to create/join/list rooms.
- Return a JSON response (e.g. `{ roomCode, players, status }`).

**Deliverable:** HTTP-based lobby creation and joining fully functional and testable from Postman.

---

### Phase 3: Integrate PostgreSQL&#x20;

**Files:** new `db.js`, new `/models` folder, update `index.js`

1. **Install:**  `npm install pg`

2. **Connect:**

   ```js
   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
   export default pool;
   ```

3. **Schema:** (based on `Spellforge_Showdown_ER_Diagram.pdf`)

   - `users (id, username, password_hash)`
   - `lobbies (id, room_code, host_id, created_at)`
   - `matches (id, lobby_id, winner, duration, created_at)`
   - `match_players (match_id, user_id, kills, deaths, damage)`

4. **Add database writes:**

   - When room created → `INSERT INTO lobbies`
   - When match ends → `INSERT INTO matches` + stats

**Deliverable:** Persistent PostgreSQL storage for lobbies and matches.

---

### Phase 4: Unity Relay Coordination 

**Goal:** Allow Unity clients to request and retrieve Relay join codes.

**Process:**

1. Host creates match in Unity → gets Relay code.
2. Unity sends `POST /api/lobbies/updateRelay` with `{ roomCode, relayCode }`.
3. Node stores `relayCode` in the `lobbies` table.
4. When a client joins, Node responds with `{ relayCode }`.

**Deliverable:** Relay codes successfully exchanged via Node API, enabling automatic Unity connection setup.

---

### Phase 5: Match Lifecycle + Stats&#x20;

**Files:** new `/routes/match.js`

Add:

```js
POST /api/match/start
POST /api/match/end
```

- On start: mark lobby as “in-progress.”
- On end: Unity sends `{ matchId, kills, deaths, winner }`.
- Node saves results to DB and marks match as “complete.”

**Deliverable:** Full match lifecycle tracked and saved in database.

---

### Phase 6: Authentication (later milestone)

**Files:** `/routes/auth.js`

Add JWT-based user authentication:

- `/auth/register`
- `/auth/login`
- `/auth/me`

Use `bcrypt` for password hashing. Secure endpoints like `/api/match/end` with a JWT middleware.

**Deliverable:** Secure, token-based user accounts and authorization.

---

### Phase 7: Logging & Monitoring

Add simple logs using `winston` or `pino`:

```js
logger.info(`User ${id} joined room ${roomCode}`);
```

**Deliverable:** Server logs key events with timestamps for debugging and QA.

---

## Final Expected Flow

```
Unity Menu → Node.js → Relay → Unity Netcode
          ↓           ↓           ↓
     Create Lobby → Store Code → Start Match
          ↓                          ↓
     Join Lobby → Get Relay Code → Join Game
          ↓                          ↓
      End Match  → Save Stats  → Return to Menu
```

---

## Folder Structure (after all phases)

```
server/
├── index.js
├── db.js
├── rooms.js
├── routes/
│   ├── lobbies.js
│   ├── match.js
│   └── auth.js
├── models/
│   ├── Lobby.js
│   ├── Match.js
│   ├── User.js
│   └── MatchPlayer.js
├── schemas.js
└── package.json
```

---

## Key Takeaways for the Networking Team

- Node.js = Lobby + Coordination + Persistence
- Unity = Real-time Gameplay (via Relay & Netcode)
- PostgreSQL = Long-term Stats + Player Data
- Both systems **cooperate**, not overlap.


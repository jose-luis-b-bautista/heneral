# Game of the Generals (Salpakan) Online: End-to-End Implementation Plan

This document outlines the complete architectural design and step-by-step implementation plan for an online multiplayer recreation of **Game of the Generals (Salpakan)**.

---

## 1. System Architecture Overview

```text
[ Vite + React (Netlify) ]  <--- WebSockets (Socket.io) --->  [ Node.js Arbiter (Render RAM) ]
                                                                       │
                                                                  SQL (pg pool)
                                                                       ▼
                                                           [ Neon PostgreSQL ]
```

* **Client (Netlify):** Handles user interface, piece drag-and-drop, board rendering, and sound effects.
* **Server (Render RAM):** Runs authoritative Arbiter logic, maintains in-memory match state, masks hidden piece ranks, and mediates battles secretly.
* **Database (Neon PostgreSQL):** Manages user authentication, profile data, and match history.

---

## 2. Directory Structure

A decoupled monorepo or two sibling repositories for easy deployment:

```text
salpakan-online/
├── client/                     # Vite + React (Deploys to Netlify)
│   ├── public/
│   │   └── _redirects         # SPA routing fallback for Netlify
│   ├── src/
│   │   ├── assets/            # Insignias, piece backings, sound effects
│   │   ├── components/
│   │   │   ├── Board/         # 9x8 CSS Grid, Square, Piece
│   │   │   ├── Setup/         # Initial piece placement tray (21 pieces)
│   │   │   ├── HUD/           # Turn tracker, timer, audio controls
│   │   │   └── Modals/        # Matchmaking, Win/Loss post-match reveal
│   │   ├── context/           # AuthContext, SocketContext, GameContext
│   │   ├── hooks/             # useGameSocket, useSoundEffects
│   │   ├── services/          # REST API helpers (Axios/Fetch)
│   │   ├── types/             # Shared client-side types/constants
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
├── server/                     # Node.js + Express + Socket.io (Deploys to Render)
│   ├── db/
│   │   ├── init.sql           # Database schema migrations
│   │   └── pool.js            # Neon PostgreSQL connection pool
│   ├── src/
│   │   ├── config/            # Environment configurations (JWT, CORS)
│   │   ├── controllers/       # Auth and user profile controllers
│   │   ├── game/
│   │   │   ├── Arbiter.js     # Battle adjudication and elimination logic
│   │   │   ├── GameState.js   # Board representation and move validator
│   │   │   └── RoomManager.js # RAM-based room tracking Map
│   │   ├── middleware/        # JWT auth verification for HTTP & Sockets
│   │   ├── routes/            # /api/auth, /api/users
│   │   ├── sockets/           # Socket event listeners and emitters
│   │   └── server.js          # App entry point
│   ├── package.json
│   └── render.yaml            # Render deployment blueprint (optional)
```

---

## 3. Database Schema & Authentication (Neon PostgreSQL)

### 3.1. SQL Schema (`db/init.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User Profiles & Authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(32) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    wins INT DEFAULT 0,
    losses INT DEFAULT 0,
    draws INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Completed Match Records
CREATE TABLE match_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    white_player_id UUID REFERENCES users(id) ON DELETE SET NULL,
    black_player_id UUID REFERENCES users(id) ON DELETE SET NULL,
    winner_id UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL indicates draw
    win_reason VARCHAR(64) NOT NULL,                       -- 'FLAG_CAPTURED', 'FLAG_REACHED_BACK_RANK', 'RESIGNATION', 'STALEMATE'
    ended_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2. Authentication Flow
1. **Password Hashing:** Passwords are salted and hashed using `bcrypt` (work factor 10).
2. **Session Token:** Returns a signed JSON Web Token (JWT) with user ID and username on login.
3. **Socket Auth:** The token is forwarded during the Socket.io handshake:
   ```javascript
   const socket = io(SERVER_URL, {
     auth: { token: localStorage.getItem("token") }
   });
   ```

---

## 4. Arbiter Core Engine (`server/src/game/Arbiter.js`)

The Arbiter adjudicates combat between two pieces without disclosing the surviving piece's rank to the players.

### 4.1. Rank Hierarchy & Piece Values

| Piece Name | Rank Constant | Count Per Side |
| :--- | :--- | :--- |
| **Five-Star General** | `15` | 1 |
| **Four-Star General** | `14` | 1 |
| **Three-Star General** | `13` | 1 |
| **Two-Star General** | `12` | 1 |
| **One-Star General** | `11` | 1 |
| **Colonel** | `10` | 1 |
| **Lt. Colonel** | `9` | 1 |
| **Major** | `8` | 1 |
| **Captain** | `7` | 1 |
| **1st Lieutenant** | `6` | 1 |
| **2nd Lieutenant** | `5` | 1 |
| **Sergeant** | `2` | 1 |
| **Private** | `1` | 6 |
| **Spy** | `0` | 2 |
| **Flag** | `-1` | 1 |
| **Total** | | **21 Pieces** |

### 4.2. Battle Resolution Logic

```javascript
/**
 * Adjudicates a challenge between an attacking piece and a defending piece.
 * @param {Object} attacker - { id, side, rank }
 * @param {Object} defender - { id, side, rank }
 * @returns {Object} result - Details which side won the challenge
 */
function resolveChallenge(attacker, defender) {
  // 1. Flag Rules: Flag is eliminated by any opposing piece
  if (defender.rank === -1) {
    return { outcome: 'ATTACKER_WINS', eliminatedIds: [defender.id], flagCaptured: true };
  }
  if (attacker.rank === -1) {
    return { outcome: 'DEFENDER_WINS', eliminatedIds: [attacker.id], flagCaptured: true };
  }

  // 2. Spy vs Officers (Rank 2 through 15)
  // Spy eliminates all officers
  if (attacker.rank === 0 && defender.rank >= 2) {
    return { outcome: 'ATTACKER_WINS', eliminatedIds: [defender.id] };
  }
  if (defender.rank === 0 && attacker.rank >= 2) {
    return { outcome: 'DEFENDER_WINS', eliminatedIds: [attacker.id] };
  }

  // 3. Spy vs Private
  // Private eliminates Spy
  if (attacker.rank === 1 && defender.rank === 0) {
    return { outcome: 'ATTACKER_WINS', eliminatedIds: [defender.id] };
  }
  if (defender.rank === 1 && attacker.rank === 0) {
    return { outcome: 'DEFENDER_WINS', eliminatedIds: [attacker.id] };
  }

  // 4. Equal Rank (e.g., Spy vs Spy, Private vs Private, General vs General)
  // Both pieces are eliminated
  if (attacker.rank === defender.rank) {
    return { outcome: 'MUTUAL_ELIMINATION', eliminatedIds: [attacker.id, defender.id] };
  }

  // 5. Standard Rank Comparison
  if (attacker.rank > defender.rank) {
    return { outcome: 'ATTACKER_WINS', eliminatedIds: [defender.id] };
  } else {
    return { outcome: 'DEFENDER_WINS', eliminatedIds: [attacker.id] };
  }
}

module.exports = { resolveChallenge };
```

---

## 5. Real-Time Networking & State Masking

Live matches are maintained in **RAM** inside `RoomManager.js`.

### 5.1. Fog of War / Board Sanitization

To ensure players cannot access opposing ranks via browser inspection, the Arbiter removes sensitive data before broadcasting:

```javascript
function sanitizeBoardForPlayer(boardGrid, targetSide) {
  return boardGrid.map(row =>
    row.map(cell => {
      if (!cell) return null;

      // Full data for player's own pieces
      if (cell.side === targetSide) {
        return { ...cell };
      }

      // Masked data for opponent's pieces
      return {
        id: cell.id,
        side: cell.side,
        rank: 'HIDDEN' // Ranks hidden from the opposing client
      };
    })
  );
}
```

### 5.2. Socket.io Event Protocol

```text
Client                                                   Server (Arbiter)
  │                                                            │
  ├─────────────── lobby:create / lobby:join ─────────────────>│
  │<────────────── lobby:joined { role, side } ────────────────┤
  │                                                            │
  │─── setup:ready { positions: [{ id, rank, r, c }] } ───────>│ (Waiting for both)
  │<────────────── match:start { board, activeTurn } ──────────┤ (Board is sanitized)
  │                                                            │
  │─── move:request { from: [r, c], to: [r, c] } ─────────────>│
  │                                                            │ (Validates turn & adjacency)
  │                                                            │ (Resolves combat if occupied)
  │<── challenge:broadcast { eliminatedIds, movedPieceId } ────┤ (Does NOT reveal survivor rank)
  │<── board:update { board, activeTurn } ─────────────────────┤
  │                                                            │
  │                                                            │ (If Flag captured/back rank reached)
  │<── match:conclude { winner, reason, fullBoard } ───────────┤ (Reveals all pieces)
  │                                                            │
```

---

## 6. Frontend Architecture (Vite + React)

### 6.1. Board Specifications
* **Grid Layout:** 9 columns (A through I) × 8 rows (Row 1 to Row 8) = 72 squares.
* **Orientation:** Always flipped to place the active player's base at the bottom rows:
  * **White:** Setup in Rows 1–3.
  * **Black:** Setup in Rows 6–8.

### 6.2. Component Tree

```text
<App />
├── <Navbar /> (User status, win/loss stats, logout button)
├── <LobbyView /> (Create match, enter room code, public queue)
└── <GameView />
    ├── <MatchHeader /> (Turn indicator, timers, resign button)
    ├── <Board /> (9x8 Grid container)
    │   └── <Square r={row} c={col}>
    │       └── <Piece side={side} rank={rank} isDraggable={isTurn} />
    ├── <SetupTray /> (Shows remaining unplaced pieces during placement)
    └── <PostMatchModal /> (Displays winner, reason, and unmasked board)
```

### 6.3. Drag-and-Drop & Move Validation
* Moves are strictly **orthogonal** (horizontal or vertical) by **1 square** per turn.
* Client-side validation prevents dragging onto friendly pieces or making diagonal moves before passing the request to the network.

---

## 7. Match Lifecycle Execution Plan

### Step 1: Authentication & Entry
* User registers or logs in; client stores JWT in `localStorage`.
* User joins the matchmaking queue or enters a 6-character room code.

### Step 2: Setup Phase
* A 9x8 board renders with an unplaced piece tray containing 21 pieces.
* Players drag pieces into the first 3 rows of their side.
* Clicking **"Ready"** locks the formation and sends the setup to the Arbiter.
* When both are ready, the Arbiter initiates the match.

### Step 3: Game Loop
* Active player moves a piece 1 square orthogonally.
* Destination check:
  * **Empty Square:** Piece updates location; Arbiter broadcasts the move.
  * **Enemy Square:** Arbiter evaluates `resolveChallenge()`. Eliminated pieces are removed. Surviving attacker advances to the square. Arbiter emits the battle results without revealing the survivor's rank.
* Active turn swaps to the other player.

### Step 4: Win Condition Adjudication
Checked by the Arbiter after every move:
1. **Flag Capture:** An opposing piece attacks the enemy Flag.
2. **Flag Infiltration:** A Flag reaches the opponent's back row (Row 8 for White, Row 1 for Black) on an unthreatened square.
3. **Elimination / Stalemate:** A player has no remaining movable pieces.
4. **Resignation:** A player concedes.

### Step 5: Post-Match Settlement
1. Arbiter emits `match:conclude` containing the unmasked board state so both players can review the opponent's formation.
2. Arbiter writes the match record to the `match_history` table in Neon PostgreSQL.
3. Arbiter increments `wins` and `losses` for the corresponding users.
4. Active room is purged from Node.js RAM memory.

---

## 8. Deployment Configuration

### 8.1. Backend on Render (Web Service)
* **Environment:** Node.js
* **Build Command:** `npm install`
* **Start Command:** `node src/server.js`
* **Environment Variables:**
  * `DATABASE_URL`: `postgres://user:pass@ep-xyz.neon.tech/neondb?sslmode=require`
  * `JWT_SECRET`: High-entropy random secret key
  * `CLIENT_ORIGIN`: `https://your-app.netlify.app`
* **Keep-Alive:** Because Render's free tier spins down after 15 minutes of inactivity, set up an external monitor (e.g., via a cron service) to ping `GET /api/health` every 10 minutes.

### 8.2. Frontend on Netlify
* **Build Command:** `npm run build`
* **Publish Directory:** `dist`
* **Environment Variables:**
  * `VITE_SERVER_URL`: `https://your-backend.onrender.com`
* **SPA Redirects:** Ensure `client/public/_redirects` contains:
  ```text
  /*    /index.html   200
  ```
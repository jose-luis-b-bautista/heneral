# Salpakan — Game of the Generals (Online)

A complete online multiplayer implementation of **Game of the Generals (Salpakan)**:
an authoritative Node.js arbiter that masks hidden piece ranks, mediates battles
secretly, and enforces the rules — paired with a mobile-first React client.

```
[ Vite + React (Netlify) ]  <--- WebSockets (Socket.io) --->  [ Node.js Arbiter (Render) ]
                                                                        │
                                                                   SQL (pg)
                                                                        ▼
                                                            [ Neon PostgreSQL ]
```

- **Server (`server/`)** — Express + Socket.io. Runs the authoritative game logic
  in RAM and persists users/matches. No database required to run locally
  (falls back to in-memory storage when `DATABASE_URL` is unset).
- **Client (`client/`)** — Vite + React 19 + TypeScript + Tailwind CSS 4.
  Dark-first, mobile-first UI with tap-to-move, fog of war, a turn timer, and
  synthesized sound effects.

---

## Game rules (summary)

- 8×9 board. Each side has **21 pieces**: 1 Flag, 2 Spies, 6 Privates, 1 Sergeant,
  and one of each officer rank from 2nd Lieutenant up to 5-Star General.
- Pieces move **one square orthogonally** per turn. Ranks 3 and 4 are intentionally
  skipped (Sergeant = 2, 2nd Lieutenant = 5).
- **Fog of war:** enemy ranks are hidden. A challenge reveals *who survived*, never
  the survivor's rank, until the match ends (full-board reveal).
- **Combat:** higher rank beats lower; equal ranks both die. The **Spy** beats every
  officer (rank 2–15); the **Private** beats the Spy. **Any piece** captures the
  **Flag**.
- **Win:** capture the enemy Flag, reach the enemy back row with your Flag, have
  your opponent run out of legal moves, or by resignation/disconnect.
- **Turn timer:** on expiry the arbiter auto-plays a random legal move for the
  lagging side so matches never stall.

---

## Local development

Requires **Node.js 20+**.

```bash
# 1. Install both packages
npm run install:all

# 2. Configure the server (in-memory DB is the default; no step needed)
cp server/.env.example server/.env

# 3. Run server + client together
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001 (health: `GET /api/health`)

In dev the Vite server proxies `/api` and `/socket.io` to `localhost:3001`, so the
client needs **no** backend URL configuration. To play a full match, open two
browser windows (private + normal) and use "Create a match" / the room code.

### Testing

```bash
npm test                      # runs both suites
npm --prefix server test      # arbiter, game state, and full socket integration
npm --prefix client test      # loadout/formation and move-logic parity
```

The server **integration test** spins up a real Express/Socket.io app (ephemeral
port, in-memory store), registers two users over REST, connects two socket
clients, and plays lobby → setup → moves → win, asserting fog-of-war masking,
friendly-capture rejection, the end-of-match reveal, and persisted win/loss stats.

---

## Configuration

### Server (`server/.env`)

| Variable        | Description                                                        | Default                       |
| --------------- | ------------------------------------------------------------------ | ----------------------------- |
| `PORT`          | HTTP port                                                          | `3001`                        |
| `DATABASE_URL`  | Neon/Postgres connection string. **Unset = in-memory storage**     | —                             |
| `JWT_SECRET`    | High-entropy signing key.                                           | dev fallback (warns in prod)  |
| `CLIENT_ORIGIN` | Allowed CORS/Socket origin (the deployed client)                   | `http://localhost:5173`       |
| `TURN_SECONDS`  | Per-turn countdown before an auto-move is played                   | `60`                          |

### Client (`client/.env`)

| Variable           | Description                                                    | Default     |
| ------------------ | -------------------------------------------------------------- | ----------- |
| `VITE_SERVER_URL`  | Full backend URL. **Unset = same origin** (dev proxy / netlify)| —           |

---

## Production deployment

### Backend → Render (Web Service)

`render.yaml` (repository root — Render only reads Blueprints from the repo root) is
a ready blueprint. It sets **Build Command `npm install`** and **Start Command
`node src/server.js`**. The server is plain JavaScript with no compile step, so
never point Render's build command at `npm run build` — `server/package.json` has
no `build` script and the deploy fails with `npm error Missing script: "build"`.

If you create the Web Service manually instead of using the Blueprint, use:

| Setting         | Value                |
| --------------- | -------------------- |
| Root Directory  | `server`             |
| Build Command   | `npm install`        |
| Start Command   | `node src/server.js` |

Then set these env vars in the Render dashboard:

- `DATABASE_URL` — your Neon PostgreSQL connection string (`sslmode=require`)
- `JWT_SECRET` — a long random string
- `CLIENT_ORIGIN` — your Netlify site URL

Because Render's free tier sleeps after ~15 min idle, ping `GET /api/health` from an
external cron every ~10 min to keep it warm.

### Frontend → Netlify

`netlify.toml` builds `client/` and publishes `client/dist`. Set one build-time env
var in the Netlify dashboard:

- `VITE_SERVER_URL` — your Render backend URL

The client is a state-driven SPA (the view is driven by auth + match state, not the
URL), so no custom redirect rules are required.

---

## Project layout

```
heneral/
├── client/                    # Vite + React + TS + Tailwind 4
│   ├── src/
│   │   ├── components/        # Layout, Board, Setup, HUD, Modals, ui primitives
│   │   ├── context/           # AuthContext, SocketContext, GameContext
│   │   ├── hooks/             # useTheme, useSoundEffects
│   │   ├── lib/               # constants, game rules (client copy), loadout
│   │   ├── pages/             # AuthPage, LobbyPage
│   │   ├── services/          # REST API helper
│   │   └── types/             # shared client-side types
│   └── ...
├── server/                    # Node.js + Express + Socket.io
│   ├── db/                    # init.sql, pool.js, init.js
│   ├── src/
│   │   ├── game/              # constants, Arbiter, GameState, RoomManager
│   │   ├── sockets/           # the full real-time protocol
│   │   ├── routes/            # auth, users, health
│   │   ├── middleware/        # JWT auth
│   │   └── server.js          # entry point
│   └── test/                  # arbiter, game state, socket integration
├── render.yaml                # Render blueprint (must be at repo root)
├── netlify.toml
└── package.json               # root convenience scripts
```

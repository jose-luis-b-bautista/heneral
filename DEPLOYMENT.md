# Salpakan — Deployment Runbook

Operational reference for the live deployment: what runs where, the exact settings
each provider needs, how to redeploy, and every gotcha hit while getting it green.

| Item | Detail |
| --- | --- |
| **Repository** | `github.com/jose-luis-b-bautista/heneral` — branch `main` |
| **Last verified** | 2026-10-22 — 19 server + 10 client tests passing; clean production build |
| **Config files** | `render.yaml`, `netlify.toml` (both at repo root, both committed) |

---

## 1. What is deployed where

| Piece | Provider | Plan | URL | Role |
| --- | --- | --- | --- | --- |
| Client | **Netlify** | Free | `https://heneralalpha.netlify.app` | Vite + React 19 + TS + Tailwind 4 SPA |
| API + WebSocket | **Render** | Free web service | `https://heneral.onrender.com` | Express + Socket.io arbiter (authoritative game logic) |
| Database | **Neon** | Free | *(dashboard only — no public app URL)* | Postgres: `users`, `match_history` |
| Keep-alive | **cron-job.org** | Free | *(no repo footprint)* | Pings `/api/health` every 10 min so Render never sleeps |

```
                 ┌──────────────────────┐
   Browser ─────▶│ Netlify (static SPA) │
                 └──────────┬───────────┘
                            │ fetch (REST) + WebSocket (Socket.io)
                            ▼
                 ┌──────────────────────┐
                 │ Render (Express API) │◀──── GET /api/health ──── cron-job.org (10 min)
                 └──────────┬───────────┘
                            │ pg (SQL, sslmode=require)
                            ▼
                 ┌──────────────────────┐
                 │ Neon Postgres        │
                 └──────────────────────┘
```

**What lives where, and what is lost on restart:**

- **In RAM on Render** — every in-progress match (board, hidden ranks, turn timer).
  A Render restart/redeploy **kills live games**. Only a 30s reconnect grace window exists.
- **In Neon** — user accounts (`bcrypt` hashes), win/loss/draw counters, completed match
  history. This is the only durable state.

---

## 2. Platform configuration (copy-paste reference)

### 2.1 Netlify — client

Source of truth: [`netlify.toml`](netlify.toml). No dashboard build settings need editing.

> **Dashboard settings override `netlify.toml`.** If someone types a build command into
> Netlify's UI, it wins over the file and the fix above is silently ignored. Keep the
> dashboard's Base/Build/Publish fields **empty** so `netlify.toml` stays authoritative
> (confirm via `commandOrigin: config` in the deploy log).

| Field | Value |
| --- | --- |
| Base directory | *(empty — repo root)* |
| Build command | `npm ci --prefix client && npm --prefix client run build` |
| Publish directory | `client/dist` |
| Node version | `20` (from `[build.environment] NODE_VERSION`) |
| Functions directory | *(none)* |
| Redirect rules | **None needed** — the view is driven by auth + match state, not the URL |

Why the build command is unusual: Netlify's automatic dependency install runs in the
**base directory** (repo root), whose only dependency is `concurrently`. The client's
~124 packages live in `client/`, so they must be installed explicitly or the build dies
with `tsc: command not found` (exit 127).

### 2.2 Render — server

Source of truth: [`render.yaml`](render.yaml) (root-level Blueprint).

| Field | Value |
| --- | --- |
| Root Directory | `server` |
| Build Command | `npm install` |
| Start Command | `node src/server.js` |
| Health Check Path | `/api/health` |
| Runtime / Plan | `node` / `free` |

> **The server has no build step.** It is plain CommonJS JavaScript executed directly by
> Node. Never set the build command to `npm run build` — `server/package.json` has no
> `build` script and the deploy fails with `npm error Missing script: "build"`.

### 2.3 Neon — database

**Only the "Postgres database" product is used.** Object storage, Functions, AI gateway,
Realtime and Better Auth are all unnecessary for this app:

- No file/media uploads — sound effects are synthesized in the browser (`useSoundEffects.ts`).
- No serverless functions — all logic runs in the long-lived Express process.
- Real-time is Socket.io on our own server, not Neon change-feed subscriptions.
- Auth is custom: `bcryptjs` + `jsonwebtoken` (`server/src/routes/auth.js`).

| Setting | Value |
| --- | --- |
| Connection string | **Pooled** connection (`-pooler` in the host), `?sslmode=require` |
| Region | Same region as the Render service (cross-region adds latency to every query) |
| Schema | `server/db/init.sql` → creates `users`, `match_history`, indexes, `uuid-ossp` |

Apply the schema **once** after creating the project:

```bash
cd server
# DATABASE_URL=... in server/.env  (or export it inline)
npm run db:init
```

Or paste `server/db/init.sql` into the Neon SQL Editor. `CREATE TABLE IF NOT EXISTS`
makes it safe to re-run.

### 2.4 cron-job.org — keep-alive

Render's free tier spins down after ~15 min of no traffic. Cold starts add seconds to the
first request, which reads as "the site is broken".

| Field | Value |
| --- | --- |
| URL | `https://heneral.onrender.com/api/health` |
| Method | `GET` |
| Schedule | Every 10 minutes (`*/10 * * * *`) — must be **under 15 min** |
| Expected result | `HTTP 200` + `{"ok":true,"service":"salpakan-server","postgres":true,...}` |
| Notifications | Enabled for failed executions |

Verify with **Test run** in cron-job.org, or manually:

```bash
curl -i https://heneral.onrender.com/api/health
```

---

## 3. Environment variables — single source of truth

Secrets live **only in provider dashboards**. `.env*` files are gitignored (verified: no
`.env` is tracked in git).

### Render

| Variable | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Neon pooled connection string | **Unset ⇒ in-memory store.** Accounts and match history vanish on every restart/redeploy. |
| `JWT_SECRET` | 32-byte random hex | Falling back to the dev default logs a production warning and is insecure. **Rotating it logs every user out.** |
| `CLIENT_ORIGIN` | `https://heneralalpha.netlify.app` | **No trailing slash.** Comma-separate to allow more origins (custom domain, previews). Enforced on both CORS and the Socket.io handshake. |
| `NODE_VERSION` | `20.15.1` | Pinned in `render.yaml`. |
| `TURN_SECONDS` | `60` | Optional. Per-turn countdown before the arbiter auto-plays a random legal move. |
| `PORT` | *(do not set)* | Injected by Render. `server/src/config/index.js` reads it; never hardcode 3001 in production. |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Netlify

| Variable | Value | Notes |
| --- | --- | --- |
| `VITE_SERVER_URL` | `https://heneral.onrender.com` | **Build-time.** Baked into the JS bundle — changing it requires a **redeploy**, not just a restart. When unset, the client talks to its own origin (dev proxy / Netlify) and every API call 404s. |

Trailing slashes are stripped client-side (`client/src/services/api.ts`) and server-side
(`server/src/config/index.js`), but keep both values bare anyway.

---

## 4. Deploy runbook

### First-time setup order

Neon → Render → Netlify → cron-job.org. The two app platforms reference each other
(`CLIENT_ORIGIN` ↔ `VITE_SERVER_URL`), so pick the Netlify site name before you start —
then both URLs are known up front.

1. **Push code** to `main` (`render.yaml` and `netlify.toml` must be at the repo root).
2. **Neon** — create the project, copy the pooled connection string.
3. **Apply the schema** — `cd server && npm run db:init` with `DATABASE_URL` set.
4. **Render** — New → Web Service (or Blueprint from `render.yaml`):
   Root Directory `server`, Build `npm install`, Start `node src/server.js`.
   Add `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`.
5. **Netlify** — connect the repo, add `VITE_SERVER_URL`, deploy.
6. **cron-job.org** — create the 10-minute health job.
7. **Verify** using §5.

### Redeploying after a change

| Change | Action required |
| --- | --- |
| Client code | Push to `main` → Netlify rebuilds automatically |
| Server code | Push to `main` → Render rebuilds and restarts (**live matches are lost**) |
| Netlify env var (`VITE_*`) | Edit in dashboard, then **Trigger deploy → Clear cache and deploy** |
| Render env var | Edit in dashboard → Render restarts the service automatically |
| Database schema | Manual — no migration framework. Edit `server/db/init.sql` and apply it yourself; only `CREATE ... IF NOT EXISTS` is idempotent. |

---

## 5. Verification checklist

Run after every deploy. All of these have been confirmed working at least once.

### 5.1 Backend is up and durable

```bash
curl -i https://heneral.onrender.com/api/health
```

Expect `HTTP/2 200` and:

```json
{"ok":true,"service":"salpakan-server","postgres":true,"time":"..."}
```

**`"postgres": true` is the critical bit** — `false` means `DATABASE_URL` is missing and
you are running in memory.

### 5.2 Render startup log

Every boot prints two lines:

```
[salpakan] listening on :10000 (db: postgres)
[salpakan] allowed origin(s): https://heneralalpha.netlify.app
```

- `db: postgres` — Neon is wired up. `db: memory` — it is not.
- `allowed origin(s)` — must exactly match the Netlify origin, bare (no trailing slash).
  This line exists specifically to debug CORS without opening a browser.

### 5.3 Browser smoke test

1. Open `https://heneralalpha.netlify.app`.
2. Register a user. In DevTools → Network: the `POST /api/auth/register` → `201`, **no
   CORS error**, and the response carries `access-control-allow-origin`.
3. Confirm the Socket.io connection opens (`/socket.io/?EIO=4` → `200`, then upgrade).
4. In the console: `localStorage.getItem('salpakan-token')` is non-null.

Quick CORS probe from the terminal (mirrors what the browser does):

```bash
curl -s -i -X OPTIONS https://heneral.onrender.com/api/auth/register \
  -H 'Origin: https://heneralalpha.netlify.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' | grep -i access-control
```

### 5.4 Full match (end-to-end)

1. Open two windows — normal + private/incognito (two sessions, one token each).
2. **Create a match** in one, join with the room code in the other.
3. Set up formations, lock in, play to a conclusion.
4. Confirm the **loser's stats increment** — this is the only test that proves the Neon
   write path works, not just the read path.

### 5.5 Keep-alive

In cron-job.org, run the job manually (**Test run**) and confirm `HTTP 200` with the
`{"ok":true,...}` body.

---

## 6. Things to remember (hard-won gotchas)

1. **`CLIENT_ORIGIN` must have no trailing slash.** CORS is an exact string match against
   the browser's `Origin` header, which never ends in `/`. A value of
   `https://site.netlify.app/` rejects *everything* with
   *"… is not equal to the supplied origin"*. The server now normalizes slashes, but keep
   the value clean.
2. **`VITE_SERVER_URL` is build-time.** It is compiled into the bundle. Changing it in the
   Netlify dashboard does nothing until you trigger a fresh deploy (clearing cache is safest).
3. **Render's build command is `npm install`, never `npm run build`.** There is no build
   script — `Missing script: "build"` kills the deploy.
4. **`render.yaml` must sit at the repo root.** A Blueprint in `server/` is silently ignored
   and the service falls back to a default (wrong) build command.
5. **Netlify installs dependencies at the base directory.** Client deps are in `client/`,
   hence `npm ci --prefix client && npm --prefix client run build`.
6. **No `DATABASE_URL` ⇒ in-memory store.** Everything looks fine, then accounts vanish on
   the next restart. Always read `db: postgres` in the logs.
7. **Render free tier sleeps after ~15 min idle.** First request afterwards is a cold start
   of several seconds. The cron-job.org ping every 10 min prevents this.
8. **The health ping does not wake Neon.** `/api/health` never queries the database, so Neon
   compute still autosuspends; the first *login* after a quiet period can be slow. Harmless,
   but don't diagnose it as a bug.
9. **Render's own Cron Jobs are not free** — minimum charge of **$1/month per cron service**.
   That is why keep-alive lives on cron-job.org.
10. **Healthchecks.io is the wrong tool here** — it is an inbound "dead man's switch"; your
    app pings it. It cannot make outbound requests to wake Render.
11. **One awake service uses most of the free quota.** A free Render workspace has a monthly
    instance-hour budget (~750h); one service awake 24/7 is ~730h. Don't keep a second free
    service warm.
12. **`JWT_SECRET` must be set in production.** The dev fallback is insecure and logs a
    warning. Rotating it invalidates every existing token (everyone is logged out).
13. **Never hardcode the port.** Render injects `PORT`; the server reads it from the env.
14. **Live matches are volatile.** Game state is in RAM on Render. Any server restart,
    redeploy, crash, or free-tier spin-down ends in-progress games. Users get a 30s
    reconnect grace window. Only accounts and match history survive.
15. **Adding a custom domain touches two places:** add it in Netlify, and append it to
    `CLIENT_ORIGIN` on Render, comma-separated:
    `https://heneralalpha.netlify.app,https://yourdomain.com`.
16. **Socket.io handshake uses the same origin list as REST.** If REST works but the socket
    fails with `connect_error`, check `CLIENT_ORIGIN` first, then token expiry.
17. **No migration framework.** Schema changes are hand-applied. `CREATE ... IF NOT EXISTS`
    is safe to re-run; `ALTER TABLE` is not.
18. **Node versions differ by environment:** Netlify 20, Render 20.15.1, local may be newer
    (Node 25). Keep them aligned when debugging build-only failures.
19. **Secrets never enter the repo.** `.gitignore` covers `node_modules/`, `client/dist/`,
    `server/.env`, `client/.env`, `.env` — verified no `.env` file is tracked.
20. **No SPA rewrite rule is needed.** The view is state-driven (auth + match state), not
    URL-driven; there are no client-side routes to fall back on.

---

## 7. Troubleshooting — symptom → cause → fix

Every one of these was hit for real during the first deployment.

| Symptom | Cause | Fix |
| --- | --- | --- |
| Netlify: `Command failed with exit code 127` / `tsc: command not found` | Netlify installed deps at the repo root only; `vite`/`typescript` live in `client/` | Build command `npm ci --prefix client && npm --prefix client run build` |
| Netlify: `npm error Missing script: "build"` | Running the root `build` script; it used `npm --prefix client build` (missing `run`) | `"build": "npm --prefix client run build"` in the root `package.json` |
| Render: `npm error Missing script: "build"` | Render's build command is `npm run build`; `server/package.json` has no `build` script | Set Build Command to `npm install` |
| Render builds from the wrong directory / ignores the Blueprint | `render.yaml` was in `server/`, not the repo root | Move it to the repo root (`rootDir: server` handles the subdirectory) |
| Browser: *"… is not equal to the supplied origin"* | `CLIENT_ORIGIN` has a trailing slash or the wrong host | Set it to the bare origin, e.g. `https://heneralalpha.netlify.app` |
| Browser: CORS blocked, **no** `Access-Control-Allow-Origin` in the response | Origin genuinely not in the allow-list | Append it to `CLIENT_ORIGIN` (comma-separated) |
| API works in DevTools but the board never updates; `connect_error` on the socket | Socket.io CORS blocked, or expired/invalid JWT in the handshake | Fix `CLIENT_ORIGIN`; re-login to refresh the token |
| Every API call hits `netlify.app` and 404s | `VITE_SERVER_URL` missing at build time | Set it on Netlify **and redeploy** |
| First request after idle takes seconds / 502 | Render free tier cold start | Expect it; keep cron-job.org running every 10 min |
| Accounts disappear after a redeploy | `DATABASE_URL` unset → in-memory store | Set `DATABASE_URL`, redeploy, confirm `db: postgres` |
| `Failed to initialize database` on `db:init` | Bad/unreachable connection string, or missing `sslmode=require` | Use the Neon **pooled** string with `?sslmode=require` |
| Everyone logged out after a deploy | `JWT_SECRET` changed | Expected — tokens are signed with it. Keep it stable. |
| In-progress matches vanish | Server restarted; game state is in RAM | Expected. Only users/history are durable. |
| `postgres: true` but queries fail | Schema never applied | Run `npm run db:init` (or paste `init.sql` into Neon's SQL editor) |

---

## 8. Current state & open items

Verified working:

- [x] Netlify build succeeds (`npm ci --prefix client && npm --prefix client run build`)
- [x] Render build + start (`npm install`, `node src/server.js`), health check passes
- [x] CORS preflight + registration from the Netlify origin (201, correct ACAO)
- [x] Disallowed origins blocked (no ACAO)
- [x] Socket.io handshake accepted from the Netlify origin
- [x] Comma-separated multi-origin support
- [x] 19 server + 10 client tests passing; clean production build

Confirm these in the dashboards (cannot be verified from the repo):

- [ ] `DATABASE_URL` set on Render → health shows `"postgres": true`
- [ ] Schema applied to Neon (`users`, `match_history` exist)
- [ ] `JWT_SECRET` set to a real random value on Render
- [ ] `CLIENT_ORIGIN` on Render exactly `https://heneralalpha.netlify.app` (no slash)
- [ ] `VITE_SERVER_URL` on Netlify exactly `https://heneral.onrender.com`
- [ ] cron-job.org job active, interval ≤ 10 min, last run `HTTP 200`
- [ ] A completed match increments the loser's `losses` (proves the Neon write path)
- [ ] Neon region matches the Render region

Known limitations (by design, not bugs):

- Matches are in-memory; a restart forfeits live games.
- Single-instance only — the in-memory `RoomManager` means **do not scale Render above one
  instance**, or players will be split across processes and never find each other.
- No migration tooling; schema changes are manual.
- Free tiers are best-effort: Render cold starts, Neon autosuspend.

---

## 9. Local development quick reference

```bash
npm run install:all              # install server + client deps
npm run dev                      # server :3001 + client :5173 (Vite proxies /api, /socket.io)
npm test                         # 19 server + 10 client tests
npm --prefix client run build    # production build → client/dist
npm --prefix server run db:init  # apply server/db/init.sql to DATABASE_URL
```

Local behaviour notes:

- No `DATABASE_URL` locally ⇒ in-memory store. Nothing to set up; data resets on restart.
- The Vite dev proxy means the client needs no `VITE_SERVER_URL` locally.
- Test a full match by opening two browser windows (private + normal).




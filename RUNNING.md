# Orbit — running the app

This repo contains a production implementation of the **Orbit** life-tracking
app that was prototyped in `project/Orbit.dc.html` (see `chats/` for the design
history). It is split into:

- **`web/`** — the app UI: React + TypeScript + Vite. Pixel-recreates the
  prototype (welcome/sign-in, home, workouts, habits, sleep, finances,
  analytics, settings, empty states, light/dark theming, bottom sheets).
  Includes the v2 additions: **Counters** (tally anything, with per-counter
  month/year/all-time totals) and a full **Finances** module — accounts &
  net worth, budgets, savings goals, recurring transactions, custom
  categories, insights, and a dedicated add/all-transactions flow.
- **`server/`** — a Node + Express + PostgreSQL API with real email/password
  authentication (JWT + bcrypt). Replaces the prototype's `localStorage` with
  per-user accounts and server-side persistence.

## Prerequisites

- Node 20+ and npm
- PostgreSQL 16 — either via Docker (`docker-compose.yml` provided) or a local
  install.

## 1. Start PostgreSQL

**Option A — Docker (recommended):**

```bash
docker compose up -d        # starts Postgres on localhost:5432 (user/pass/db = orbit)
```

**Option B — existing local Postgres:** create a database and user, then set
`DATABASE_URL` accordingly in `server/.env`.

## 2. Start the API

```bash
cd server
cp .env.example .env         # adjust DATABASE_URL / JWT_SECRET if needed
npm install
npm run migrate              # creates the schema
npm run dev                  # API on http://localhost:4000
```

New accounts are seeded with the same demo dataset as the original prototype
(habits + 12 weeks of check-in history, workout categories, workouts, nights,
transactions), so the app looks alive on first sign-in.

## 3. Start the web app

```bash
cd web
npm install
npm run dev                  # app on http://localhost:5173 (proxies /api to :4000)
```

Open http://localhost:5173, tap **Get started**, and create an account
(email + password, min 6 chars). Your JWT is stored in `localStorage`, so the
session survives reloads. **Sign out** (Settings) clears it.

## Production build

```bash
cd web && npm run build      # outputs web/dist
cd server && npm run build   # compiles to server/dist, run with: npm start
```

When serving the built frontend, point its `/api` requests at the API origin
(e.g. behind a reverse proxy, or set the API base URL).

## What changed vs. the prototype

The prototype's four known gaps (flagged at the end of `chats/chat1.md`) are
fixed in this implementation:

1. **Habit heatmap is real** — the "Last 12 weeks" grid is computed from actual
   daily check-ins, not a math function.
2. **Longest streak is real** — the Analytics "Longest streak: N days" is
   derived from check-in history (no longer hardcoded to 23).
3. **Haptics are wired** — the Haptic-feedback toggle drives `navigator.vibrate`
   on actions (where the device/browser supports it). Daily reminders persists
   as a preference (real push notifications would need a backend scheduler +
   service worker, out of scope here).
4. **Workouts capture distance & calories** — the log and edit sheets now have
   distance and calories fields, shown in the recent list.

Plus the prototype's local-only storage is replaced by **real accounts**:
email/password auth, bcrypt-hashed passwords, JWT sessions, and per-user data
in Postgres. The "Continue with Apple/Google" buttons (non-functional in the
prototype) were dropped in favor of working email/password sign-in.

## API surface (all JSON, `Authorization: Bearer <token>` except auth)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/signup` | Create account (returns token + state) |
| POST | `/api/auth/login` | Sign in |
| GET | `/api/state` | Full data bundle for the user |
| PATCH | `/api/me` | Update profile / theme / preferences |
| POST/PATCH/DELETE | `/api/habits[/:id]` | Habit CRUD |
| POST | `/api/habits/:id/toggle` | Toggle a day's check-in |
| POST/PATCH/DELETE | `/api/categories[/:id]` | Workout-category CRUD (delete reassigns) |
| POST/PATCH/DELETE | `/api/workouts[/:id]` | Workout CRUD |
| POST/DELETE | `/api/nights[/:id]` | Sleep CRUD |
| POST/DELETE | `/api/txns[/:id]` | Transaction CRUD |
| POST | `/api/reset` | Wipe + reseed the user's data |
| POST/PATCH/DELETE | `/api/accounts[/:id]` | Money-account CRUD (delete unlinks its txns) |
| POST/PATCH/DELETE | `/api/fcats[/:id]` | Finance-category CRUD |
| POST/PATCH/DELETE | `/api/budgets[/:id]` | Budget CRUD |
| POST/PATCH/DELETE | `/api/goals[/:id]` | Savings-goal CRUD |
| POST/PATCH/DELETE | `/api/recurring[/:id]` | Recurring-transaction CRUD |
| POST/PATCH/DELETE | `/api/counters[/:id]` | Counter CRUD |
| POST | `/api/counters/:id/log` | Log an amount against a counter |

# Link Shortener

A complete, self-hostable URL shortener in the spirit of Bitly / Dub.co — fast redirects, rich analytics, and full link management. Built as a **single Rust (Axum) binary over SQLite** that also serves a static **Vite + React** SPA. No Node runtime, no Redis, no Postgres, no Docker — one process and one file.

> Originally produced by a multi-agent feature pipeline (Next.js + Postgres + Redis), then re-platformed to Rust/SQLite for a feather-weight, self-contained deployment. Design + plan: [`docs/superpowers/`](docs/superpowers/). Behavioral contract: [`docs/features/link-shortener/`](docs/features/link-shortener/).

## Features

- **Shorten** any URL to a 6-character code, or pick a **custom alias**
- **Fast redirects** — in-memory cache-fronted hot path; clicks ingested asynchronously
- **Analytics** — total clicks, unique visitors, clicks over time, referrers, geography, device/browser (per-link and aggregate), each with an accessible data table
- **QR codes** — auto-generated per link, downloadable as PNG
- **Link management** — expiration (date and/or max clicks), password protection, destination editing, enable/disable
- **Title/description scraping** of destinations (SSRF-safe, in a background task)
- **UTM builder** with live preview, and **bulk shortening**
- **Auth** — Google, GitHub, and email/password; **guest mode** (24h links, claimable on sign-up)
- **Anti-abuse** — per-IP rate limiting + an offline phishing/malware blocklist
- **Polished UI** — dark/light themes, WCAG 2.1 AA, loading/empty/error states, copy-to-clipboard toasts

---

## Architecture

```
Browser ─▶ [ Rust / Axum binary ]  ──▶  SQLite (data/app.db, WAL)
              ├─ /api/**            REST API (auth, links, analytics, qr, guest)
              ├─ /:code             redirect hot path (302 / password gate / dead-link)
              ├─ static + SPA       serves the built Vite bundle (dist/) with SPA fallback
              └─ tokio tasks        click ingest · metadata scraper · expiry sweep
```

One binary holds the HTTP server, an in-memory redirect cache, an in-process rate limiter, the
background work queues, and the SQLite connection pool. **Single-instance** by design (in-process
cache/queues) — the self-host sweet spot; scale vertically.

---

## Run the project

### Prerequisites
- **Rust** (stable, ≥1.80) — install via [rustup](https://rustup.rs/)
- **Node.js 20+** and **[pnpm](https://pnpm.io/) 10** — only to *build* the frontend (not at runtime)

### Quick start

```bash
cp .env.example .env        # defaults run everything locally, no external services
bash scripts/start.sh       # builds frontend + backend, seeds on first run, serves → http://localhost:8080
```

`scripts/start.sh` runs `pnpm build` (Vite → `dist/`), `cargo build --release`, seeds demo data on
first run, and launches the binary (which applies SQLite migrations on startup). Open
**http://localhost:8080** — guest shortening works immediately; sign up for the full dashboard.

### Manual / development

```bash
cp .env.example .env
pnpm install

# Backend (terminal 1) — serves API + redirect on :8080; migrates on startup.
cd backend && cargo run --bin seed   # one-time: seed demo data
cd backend && cargo run --bin shortener

# Frontend dev server with hot reload (terminal 2) — proxies /api → :8080.
pnpm dev                              # → http://localhost:5173
```

For a production-style run, `pnpm build` then point the backend at it via `STATIC_DIR=dist` (the
default) and just run the binary — it serves the SPA itself, so the Vite dev server isn't needed.

### Sample accounts (after seeding)

`cargo run --bin seed` (or `pnpm backend:seed`) creates these for local use. **Sample credentials — not for production.**

| Email | Password | Role |
|---|---|---|
| `admin@example.com` | `admin-password-123` | `ADMIN` |
| `user@example.com` | `user-password-123` | `USER` |
| `demo@example.com` | `demo-password-123` | `USER` |

The seed also adds sample links covering each state — active, password-protected (link password `secret`), expired, max-clicks, and a 24h guest link.

---

## Configuration

Copy `.env.example` to `.env`. Defaults run the whole app locally. Key variables:

| Variable | Required | Notes |
|---|---|---|
| `SQLITE_PATH` | – | SQLite file path (default `data/app.db`, created on first run) |
| `PUBLIC_PORT` | – | Port the binary listens on (default `8080`) |
| `STATIC_DIR` | – | Built frontend directory (default `dist`) |
| `AUTH_SECRET` | ✅ | Signs the session JWT — set a strong value (≥32 bytes) in production |
| `BASE_URL` | ✅ | Public app URL (builds short URLs + OAuth callbacks) |
| `VISITOR_IP_PEPPER` | ✅ | Pepper used to hash visitor identifiers (privacy) |
| `GOOGLE_CLIENT_ID` / `_SECRET` | optional | Enables Google sign-in (omit to hide it) |
| `GITHUB_CLIENT_ID` / `_SECRET` | optional | Enables GitHub sign-in (omit to hide it) |
| `MAXMIND_LICENSE_KEY` / `GEOIP_DB_PATH` | optional | Geo analytics (see below) |
| `REDIRECT_STATUS`, `GUEST_TTL_HOURS`, `BULK_MAX`, `RL_*` | optional | Tunables with sensible defaults |

OAuth is **optional** — with no Google/GitHub keys the app runs fine on email/password alone (fully offline).

### Geo analytics (optional)

```bash
# add MAXMIND_LICENSE_KEY=... to .env, then:
pnpm fetch:geoip            # downloads data/GeoLite2-City.mmdb
```

Without it the app runs normally; geo fields are simply left empty.

---

## Testing

```bash
cd backend && cargo test   # Rust unit + integration tests (the bulk of the logic)
pnpm typecheck             # tsc --noEmit (frontend)
pnpm e2e                   # Playwright end-to-end (boots the binary + serves dist)
```

---

## Project structure

```
backend/                    the Rust/Axum binary (the whole server)
  migrations/0001_init.sql  SQLite schema
  src/
    main.rs                 bootstrap: config, db, migrate, tasks, serve
    config.rs db.rs models.rs ids.rs state.rs queue.rs
    error.rs                uniform API error envelope
    auth/                   argon2 + JWT session + Google/GitHub OAuth + extractors
    services/               ported business logic (links, analytics, redirect, cache,
                            ratelimit, ssrf, blocklist, referrer, ua, geo, qr, …)
    routes/                 /api handlers + /:code redirect + static/SPA serving
    tasks/                  click-ingest · scraper · expiry-sweep (tokio)
    bin/seed.rs             demo data seeder
index.html, vite.config.ts  Vite SPA entry/build
src/
  main.tsx router.tsx       SPA bootstrap + react-router route tree
  auth/                     AuthContext + auth-client (talks to /api/auth/*)
  components/               UI (primitives, links, analytics, auth, app shell)
data/                       offline assets (blocklist; GeoLite2 once provisioned)
docs/                       specs/plans (docs/superpowers) + behavioral contract (docs/features)
```

`docs/features/link-shortener/ARCHITECTURE.md` is the authoritative behavioral contract.

---

## Scripts

| Command | Description |
|---|---|
| `bash scripts/start.sh` | build frontend + backend, seed (first run), serve |
| `pnpm dev` / `pnpm build` / `pnpm preview` | Vite dev server / production build / preview |
| `pnpm backend:run` / `:seed` / `:build` / `:test` | run / seed / build / test the Rust backend |
| `pnpm fetch:geoip` | download the GeoLite2 database (needs `MAXMIND_LICENSE_KEY`) |
| `pnpm typecheck` / `pnpm e2e` | frontend typecheck / end-to-end tests |

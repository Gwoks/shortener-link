# Link Shortener

A complete, self-hostable URL shortener in the spirit of Bitly / Dub.co — fast redirects, rich analytics, and full link management. Built with **Next.js 14 (App Router) + TypeScript**, **PostgreSQL** (Prisma), and **Redis**, with a background worker for analytics and link maintenance.

> This repository was produced by a **multi-agent feature pipeline** (see [`.claude/`](.claude/) and the design docs in [`docs/features/link-shortener/`](docs/features/link-shortener/)). The shortener is the pipeline's first feature.

## Features

- **Shorten** any URL to a 6-character code, or pick a **custom alias**
- **Fast redirects** — cache-fronted (Redis) hot path; clicks are ingested asynchronously
- **Analytics** — total clicks, unique visitors, clicks over time, referrers, geography, device/browser (per-link and aggregate), each with an accessible data table
- **QR codes** — auto-generated per link, downloadable as PNG
- **Link management** — expiration (date and/or max clicks), password protection, destination editing, enable/disable
- **Title/description scraping** of destinations (SSRF-safe, in the worker)
- **UTM builder** with live preview, and **bulk shortening** with CSV export
- **Auth** — Google, GitHub, and email/password (Auth.js); **guest mode** (24h links, claimable on sign-up)
- **Anti-abuse** — per-IP rate limiting + an offline phishing/malware blocklist
- **Polished UI** — dark/light themes, WCAG 2.1 AA, loading/empty/error states, copy-to-clipboard toasts

---

## Run the project

### Prerequisites
- [Docker](https://www.docker.com/) + Docker Compose **(easiest path)**, or
- **Node.js 20+** and **[pnpm](https://pnpm.io/) 10** for local development, plus a Postgres 16 and Redis 7 instance.

### Option A — Docker (recommended)

One command brings up everything (web + worker + Postgres + Redis); database migrations run automatically on startup.

```bash
cp .env.example .env        # defaults work out of the box for local Docker
docker compose up --build   # → http://localhost:3000
```

Then open **http://localhost:3000**. Guest shortening works immediately; sign up (email/password) for the full dashboard. To stop:

```bash
docker compose down         # add -v to also wipe the database/redis volumes
```

### Option B — Local development

Run Postgres + Redis in Docker but the app on your host (with hot reload):

```bash
cp .env.example .env
pnpm install

pnpm db:up          # starts postgres + redis containers
pnpm db:migrate     # apply Prisma migrations
pnpm db:seed        # (optional) seed sample data

pnpm dev            # web app → http://localhost:3000
pnpm worker         # in a second terminal: the analytics/scrape/expiry worker
```

The worker is required for click analytics, metadata scraping, and expiry sweeps. The web app runs without it, but those features won't update.

---

## Configuration

Copy `.env.example` to `.env`. The defaults are wired for the local Docker stack. Key variables:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `NEXTAUTH_SECRET` | ✅ | Auth.js session secret (set a strong value in production) |
| `BASE_URL` / `NEXTAUTH_URL` | ✅ | Public app URL (e.g. `http://localhost:3000`) |
| `VISITOR_IP_PEPPER` | ✅ | Pepper used to hash visitor IPs (privacy) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Enables Google sign-in (omit to hide it) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | optional | Enables GitHub sign-in (omit to hide it) |
| `MAXMIND_LICENSE_KEY` / `GEOIP_DB_PATH` | optional | Geo analytics (see below) |
| `REDIRECT_STATUS`, `GUEST_TTL_HOURS`, `BULK_MAX`, `RL_*` | optional | Tunables with sensible defaults |

OAuth is **optional** — with no Google/GitHub keys the app runs fine on email/password alone (works fully offline).

### Geo analytics (optional)

Geography breakdowns use a locally-bundled MaxMind GeoLite2 database. It needs a **free** MaxMind license key:

```bash
# add MAXMIND_LICENSE_KEY=... to .env, then:
pnpm fetch:geoip            # downloads data/GeoLite2-City.mmdb
```

Without it the app runs normally; geo fields are simply left empty.

---

## Testing

```bash
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint
pnpm test          # unit + integration (Vitest)
pnpm e2e           # Playwright end-to-end (needs the app running)
```

- **Unit tests** run anywhere (no services needed).
- **Integration tests** exercise the real data layer; start `pnpm db:up` first (they auto-skip if Postgres/Redis aren't reachable).

---

## Project structure

```
src/
  app/                  Next.js App Router
    [code]/route.ts     the redirect hot path (302 / password gate / dead-link)
    api/                REST endpoints (links, analytics, auth, qr, guest-links, healthz)
    (app)/              authenticated dashboard (links, analytics, bulk, settings)
    page.tsx, signin/   public landing + auth
  lib/                  business logic (links, analytics, cache, redirect, ssrf, hashing, …)
  worker/               background worker (click consumer, scraper, expiry sweep)
  components/           UI (primitives, links, analytics, auth, app shell)
prisma/                 schema, migrations, seed
data/                   offline assets (blocklist; GeoLite2 once provisioned)
scripts/                fetch-geoip, pipeline validation
docs/features/link-shortener/   PRD · USER-JOURNEY · DESIGN · ARCHITECTURE · QA-REPORT
.claude/                the multi-agent pipeline (agents + workflow) that built this
```

`docs/features/link-shortener/ARCHITECTURE.md` is the authoritative technical contract; `QA-REPORT.md` records verification status.

---

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js dev / production build / serve |
| `pnpm worker` | run the background worker |
| `pnpm db:up` / `pnpm db:down` | start / stop Postgres + Redis (Docker) |
| `pnpm db:migrate` / `pnpm db:deploy` / `pnpm db:seed` / `pnpm db:reset` | Prisma database lifecycle |
| `pnpm fetch:geoip` | download the GeoLite2 database (needs `MAXMIND_LICENSE_KEY`) |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm e2e` | quality gates |

# Design: Feather-Weight Migration to Rust/Axum + SQLite + Vite SPA

**Date:** 2026-06-19
**Status:** Proposed (awaiting review)
**Scope:** Re-platform the Link Shortener from Next.js (Node) + Postgres + Redis + Docker
to a single Rust/Axum binary over SQLite, serving a static Vite SPA. UI/UX and user
journeys are preserved exactly; the existing Playwright E2E suite is the fidelity gate.

---

## 1. Goals & Non-Goals

### Goals
- **One process, one file.** A single Rust/Axum binary serves the API, the `/:code`
  redirect, the static frontend, and all background work, over a single SQLite file.
- **Feather-weight.** No Node runtime, no Redis, no Postgres, no Docker. Resident memory
  in the tens of MB, not hundreds.
- **Identical UI/UX and flow.** Every visual component and every user journey is
  preserved. Verified by the existing Playwright E2E suite.
- **Backend ~100% Rust.** Auth (incl. OAuth), redirect, analytics, scraping, expiry — all
  in Rust.

### Non-Goals
- **Horizontal scaling.** In-process cache/queues mean single-instance only. This matches
  the self-host target and is documented as a constraint.
- **Preserving production data.** Start fresh on SQLite with a ported seeder (no
  Postgres→SQLite data migration).
- **Redesigning any screen or changing any user-facing flow.**

---

## 2. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Frontend runtime | **Vite SPA + react-router**, static build, served by Rust. No Node at runtime. |
| 2 | Auth ownership | **Rust owns auth** — register/login/logout (argon2id), Google + GitHub OAuth, stateless **JWT cookie**. |
| 3 | Session strategy | **Stateless JWT** in an HttpOnly/SameSite=Lax cookie. No server-side session table. Logout clears the cookie (no server revocation — acceptable for single-instance self-host). |
| 4 | Redis | **Removed.** In-memory LRU cache (moka), in-process token-bucket rate limiter (governor), tokio mpsc channels for the click/scrape queues. SQLite is the durable store. |
| 5 | Background work | **In-process tokio tasks** in the same binary: click-ingest, scraper, expiry sweep. |
| 6 | Front door | **Rust is the only listener.** Serves static assets + SPA fallback + `/api/**` + `/:code`. No reverse proxy (Node is gone). |
| 7 | Database | **SQLite** via `sqlx` (WAL, `foreign_keys=ON`). Schema ported from Prisma. |
| 8 | Data migration | **Start fresh** + Rust seeder (port of `prisma/seed.ts`). |
| 9 | Clicker pages | Gate + dead-link served by Rust as **ported on-brand HTML** with correct status codes (200/410/404). |

---

## 3. Target Architecture

```
                 ┌─────────────────────────────────────────────────────────┐
  Browser  ───▶  │  RUST / AXUM  (single public listener)                   │
                 │                                                           │
                 │   GET /:code            → redirect decision (hot path)    │──▶ SQLite
                 │   /api/**               → API handlers (15 endpoints)     │   (data/app.db, WAL)
                 │   /api/auth/* + OAuth cb → auth (argon2 + oauth2 + JWT)    │
                 │   /assets/*, /, /index  → static Vite bundle (ServeDir)    │
                 │   any other GET         → SPA fallback (index.html)        │
                 │                                                           │
                 │   in-mem: moka cache · governor rate-limiter              │
                 │   tokio tasks: click-ingest · scraper · expiry-sweep      │
                 └─────────────────────────────────────────────────────────┘
```

**Routing precedence in Axum (most specific first):**
1. `/api/**` → typed handlers.
2. `/_app static assets` (hashed Vite output) → `ServeDir`.
3. `/:code` → redirect handler (guarded by a `^[A-Za-z0-9_-]{3,50}$` shape check; reserved
   roots never reach here).
4. Fallback `GET` → serve `index.html` (SPA client routing handles `/dashboard/**`, `/signin`, etc.).

Everything is same-origin on one port, so cookies and CSRF behave exactly as before.

---

## 4. Frontend — Next.js → Vite SPA

### 4.1 What stays identical
- All ~40 framework-agnostic components in `src/components/**` (UI, forms, charts, tables,
  dialogs, analytics) — **unchanged**.
- `src/components/lib/api.ts` (typed REST client) and `types.ts` — **unchanged**; calls stay
  same-origin relative `/api/...`.
- Tailwind config, design tokens, `globals.css`, theme system — **unchanged**.

### 4.2 What changes (mechanical, no visual diff)
- **Routing layer (17 files):** `next/link` → react-router `Link` (13 files);
  `next/navigation` hooks (`useRouter`/`useSearchParams`/`usePathname`, 9 files) →
  react-router equivalents (`useNavigate`/`useSearchParams`/`useLocation`).
- **Auth client (4 files):** `next-auth/react` (`SessionProvider`, `signIn`, `signOut`,
  `getProviders`) → a thin client auth module that calls the Rust auth endpoints:
  - `SessionProvider` → a React `AuthContext` that loads `GET /api/session` on mount.
  - `signIn(provider)` → redirect to `/api/auth/oauth/:provider` (OAuth) or
    `POST /api/auth/login` (credentials).
  - `signOut()` → `POST /api/auth/logout`, then redirect to `/`.
  - `getProviders()` → static list (google, github) or a tiny `GET /api/auth/providers`.
- **Page shells → route components.** The ~13 `src/app/**/page.tsx` + `layout.tsx` files
  become react-router route elements. The server-side `auth()` gate on the `(app)` group and
  `middleware.ts` are both replaced by a **client `<ProtectedRoute>`** wrapper that redirects
  to `/signin?callbackUrl=...` when `AuthContext` has no user. Same redirect UX; API still
  re-checks auth server-side (defense in depth).
- **Dynamic routes** (`/dashboard/links/:id`, `/dashboard/links/:id/analytics`) become native
  react-router params — no static-export workaround needed.

### 4.3 Removed from the frontend
- Next.js entirely: `next`, `next-auth`, `src/middleware.ts`, the `src/app/**` tree,
  `next.config.mjs`, `next-env.d.ts`.
- New build: `vite` + `@vitejs/plugin-react` + `react-router-dom`. Output is static
  HTML/JS/CSS consumed by Rust `ServeDir`.

### 4.4 Build output
- `pnpm build` (Vite) → `dist/` static assets. Rust serves `dist/` (path configurable;
  embedded via `rust-embed` in release builds is an option, default is serve-from-disk).

---

## 5. Backend — Rust/Axum

### 5.1 Crate layout (`backend/`)
Cargo binary crate. Key dependencies:
`axum`, `tokio`, `tower`/`tower-http` (ServeDir, trace, compression), `sqlx`(sqlite, runtime-tokio),
`serde`/`serde_json`, `jsonwebtoken`, `argon2`, `oauth2`, `reqwest` (OAuth token exchange +
SSRF-safe scraping), `scraper` (HTML title/description parse), `qrcode` + `image` (PNG),
`maxminddb` (GeoIP), `governor` (rate limit), `moka` (cache), `cuid` (ID generation), `time`/`chrono`.

Module map (mirrors today's `src/lib/*` so behavior ports 1:1):

| Rust module | Replaces | Responsibility |
|-------------|----------|----------------|
| `db` | `lib/db.ts` | sqlx pool, WAL pragmas, migrations |
| `models` | Prisma types | row structs + (de)serialization |
| `links_service` | `lib/links-service.ts` | create/list/get/patch/delete, alias logic |
| `redirect` | `lib/redirect.ts` | redirect decision (active/gate/dead/not-found) |
| `cache` | `lib/cache.ts` + Redis | moka hot-link cache + live click counter |
| `events` | `lib/events.ts` + Redis stream | click enqueue (mpsc) |
| `ratelimit` | `lib/ratelimit.ts` + Redis | governor token buckets (shorten/unlock) |
| `blocklist` | `lib/blocklist.ts` | offline phishing/malware blocklist |
| `ssrf` | `lib/ssrf.ts` | SSRF-safe URL/IP guard for scraping |
| `scrape_queue` | `lib/scrape-queue.ts` + Redis | scrape enqueue (mpsc) |
| `geo` | `lib/geo.ts` | maxminddb country/city lookup |
| `ua` | `lib/ua.ts` | user-agent → device/browser |
| `referrer` | `lib/referrer.ts` | referrer → category/host |
| `shortcode`/`alias`/`reserved` | same | code generation, alias validation, reserved words |
| `utm`/`qr`/`hash`/`validation`/`serialize` | same | UTM, QR PNG, argon2id, zod-equivalent validation, response shaping |
| `auth`/`session` | `lib/auth.ts`/`lib/session.ts` + Auth.js | login/register/OAuth, JWT issue/verify |
| `errors` | `lib/errors.ts` | uniform error envelope |

### 5.2 API parity (the contract is the oracle)
All non-2xx responses use the existing envelope:
`{ error: { code, message, field?, suggestions? } }` with the exact `ErrorCode` → HTTP status
map (`VALIDATION_ERROR`→422, `ALIAS_TAKEN`→409, `RATE_LIMITED`→429, `UNLOCK_LOCKED`→429,
`WRONG_PASSWORD`→401, `UNAUTHENTICATED`→401, `FORBIDDEN`→403, `NOT_FOUND`→404,
`BULK_LIMIT_EXCEEDED`→413, `EMAIL_TAKEN`→409, `INTERNAL`→500, etc.).

Endpoints reproduced 1:1 (request/response JSON identical to `ARCHITECTURE.md §6`):
- `POST /api/links`, `GET /api/links`, `GET/PATCH/DELETE /api/links/:id`
- `POST /api/links/bulk`, `GET /api/links/check-alias`
- `GET /api/links/:id/analytics`, `GET /api/analytics/summary`
- `GET /api/links/:id/qr`, `GET /api/qr/:code`
- `POST /api/links/:id/unlock`
- `GET /api/guest-links/claimable`, `POST /api/guest-links/claim`
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/oauth/:provider`, `GET /api/auth/oauth/:provider/callback`,
  `GET /api/session`
- `GET /api/healthz`

**Source of truth for parity:** `ARCHITECTURE.md §6` contracts + the Playwright E2E suite +
the unchanged `src/components/lib/{api,types}.ts`. Any Rust handler whose output diverges from
these is a bug.

### 5.3 Auth detail
- **Credentials:** argon2id verify/hash (matches current `passwordHash` format intent).
- **OAuth:** `oauth2` crate authorization-code flow for Google + GitHub; callback creates/links
  `Account` + `User` rows, then issues the JWT cookie. Redirect URIs:
  `${BASE_URL}/api/auth/oauth/:provider/callback`.
- **JWT:** HS256 signed with `AUTH_SECRET`; claims = `{ sub: userId, email, name, image, exp }`.
  Set as an HttpOnly, SameSite=Lax, `Path=/` cookie. `GET /api/session` decodes it and returns
  the user (or `null`) — this is what the SPA `AuthContext` consumes.
- **CSRF:** mutations require same-origin (enforced via SameSite cookie + an origin check on
  unsafe methods), matching today's same-origin posture.

### 5.4 Redirect hot path
`GET /:code`: shape-check → moka cache lookup (miss → SQLite, then populate) → decision:
- **active** → 301/302 (`REDIRECT_STATUS`), enqueue click (fire-and-forget), enforce
  `maxClicks` atomically against the live counter without a DB round-trip on the hot path;
- **gate** (password) → serve ported on-brand gate HTML (200), no click counted;
- **dead** (expired/deactivated/max-clicks) → ported dead-link HTML (410);
- **not-found** → ported dead-link HTML (404).

The gate + dead-link HTML are ported from `lib/clicker-pages.ts` / the `dead-link` page into
Rust string templates that **reuse the existing markup/styling** so they look identical and
carry the correct status code for crawlers and tests.

### 5.5 Background tokio tasks
- **click-ingest:** owns all click writes (single writer → no SQLite lock contention). Drains
  the mpsc channel, batches inserts into `ClickEvent`, updates `VisitorSeen` (unique detection),
  upserts `ClickRollup` (per-day aggregates), and increments `Link.clickCount`.
- **scraper:** drains scrape queue → SSRF-guarded fetch → parse `<title>`/meta description →
  update `metaStatus`/`metaTitle`/`metaDescription`.
- **expiry-sweep:** interval task → mark expired links (`expiresAt`/`maxClicks`), prune
  `ClickEvent` older than `CLICK_RETENTION_DAYS`, purge guest links past `GUEST_TTL_HOURS`.

---

## 6. Data Layer — Postgres → SQLite

Faithful port of `prisma/schema.prisma`:
- **Tables:** `User`, `Account`, `Link`, `ClickEvent`, `ClickRollup`, `VisitorSeen`.
  `Session` and `VerificationToken` are **dropped** (stateless JWT; no email-verification flow
  in scope).
- **Types:** enums (`LinkStatus`, `MetaStatus`, `RefCategory`, `Role`) → `TEXT` + `CHECK`;
  `cuid()` IDs generated in Rust via the `cuid` crate (same format); `DateTime` → ISO-8601
  `TEXT`; `Json` columns (`byReferrer`/`byCountry`/`byDevice`/`byBrowser`) → `TEXT` (serde_json);
  `Boolean` → `INTEGER 0/1`.
- **Indexes:** port all (`Link(ownerId, createdAt desc)`, `Link(status, expiresAt)`,
  `Link(guestKey)`, `ClickEvent(linkId, occurredAt)`, unique `ClickRollup(linkId, day)`,
  unique `Link.code`, unique `User.email`, unique `Account(provider, providerAccountId)`).
- **`ClickEvent.streamId`** (Redis-stream idempotency) → replaced by an in-process idempotency
  key on the mpsc message; the column is dropped.
- **Pragmas:** `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout`.
- **Migrations:** `sqlx` migration files in `backend/migrations/`.
- **Seeder:** `cargo run --bin seed` ports `prisma/seed.ts` (sample admin + users + links).

---

## 7. Configuration

`.env` changes:
- **Remove:** `DATABASE_URL` (pg), `REDIS_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`,
  `CLICK_STREAM_MAXLEN`.
- **Add:** `SQLITE_PATH` (default `data/app.db`), `AUTH_SECRET` (JWT signing key),
  `PUBLIC_PORT`, `STATIC_DIR` (Vite `dist/`).
- **Keep:** `BASE_URL`, `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`,
  `VISITOR_IP_PEPPER`, `GEOIP_DB_PATH`, `MAXMIND_LICENSE_KEY`, `RL_*`, `REDIRECT_*`,
  `CLICK_RETENTION_DAYS`, `GUEST_TTL_HOURS`, `BULK_MAX`, `UNLOCK_SESSION_TTL_SEC`.

---

## 8. Deployment (Docker removed)

- **Delete:** `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`.
- **Build:** `pnpm install && pnpm build` (Vite → `dist/`); `cargo build --release` (Rust).
- **Run:** one binary — `./backend/target/release/shortener` — which runs migrations on
  startup, optionally seeds, and listens on `PUBLIC_PORT`. Optional `scripts/start.sh` wraps
  build+migrate+run; a sample `systemd` unit is provided for self-host supervision.
- **GeoIP:** keep `scripts/fetch-geoip.mjs` (or port to a Rust step) to fetch the `.mmdb`.

---

## 9. Testing & Fidelity Gate

- **Rust unit tests:** redirect decision matrix, alias/shortcode/reserved, SSRF guard, rate
  limiter, validation, referrer/UA/geo mapping, QR generation, JWT issue/verify.
- **Rust integration tests:** Axum app over a temp SQLite, asserting each endpoint's JSON
  against the documented contract (incl. the error envelope + status map).
- **Playwright E2E (kept):** drives the whole stack through the Rust front door — this is the
  **UI/UX + user-journey fidelity gate**. Harness updated to boot the single Rust binary
  instead of Docker. The suite must pass unchanged (same journeys, same screens).
- **Removed:** Vitest backend-lib tests (those modules are now Rust).

---

## 10. Migration Sequence (each phase independently verifiable)

1. **Scaffold** Rust crate in `backend/` + config loader + sqlx/sqlite wiring + Axum hello.
2. **Data layer:** migrations + `models` + seeder; verify seed + basic queries.
3. **Core services (no HTTP):** shortcode/alias/reserved, validation, hash, ssrf, blocklist,
   referrer/ua/geo, redirect decision, cache, ratelimit — with unit tests.
4. **API handlers** + error envelope: links CRUD, bulk, check-alias, qr, unlock, analytics
   (summary + per-link), guest-links — matching exact JSON contracts.
5. **Auth:** register/login/logout + JWT cookie + Google/GitHub OAuth callbacks + `/api/session`.
6. **Redirect hot path** + ported gate/dead-link HTML.
7. **Background tokio tasks:** click-ingest, scraper, expiry-sweep.
8. **Static serving:** Rust `ServeDir` + SPA fallback wired to Vite `dist/`.
9. **Frontend port:** Vite + react-router scaffold; swap routing (17 files) + auth client
   (4 files); page shells → route components + `<ProtectedRoute>`; reuse all visual components.
10. **Remove** Docker, Next.js, Redis/Postgres deps, obsolete `src/lib/*`/`src/app/*`/worker;
    rewrite `.env.example`, `package.json`, README, run scripts.
11. **Verification pass:** `cargo test` + Playwright E2E green; QA against acceptance criteria.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| API/behavior drift from the original | Treat `ARCHITECTURE.md §6` contracts + Playwright E2E + unchanged `api.ts`/`types.ts` as the spec; integration tests assert JSON parity. |
| SQLite write contention under click bursts | WAL + a single writer task (click-ingest owns writes, batched). |
| OAuth flow regressions (Google/GitHub) | Port redirect URIs verbatim; manual + E2E sign-in checks before cutover. |
| Visual drift on gate/dead-link pages | Port the exact existing markup/CSS into the Rust templates; covered by E2E. |
| SPA hard-refresh on deep links | Rust SPA fallback serves `index.html` for any non-API/non-asset/non-`/:code` route. |
| Single-instance constraint surprising operators | Document explicitly in README (in-process cache/queues; scale = vertical). |

---

## 12. Definition of Done

- Single Rust binary serves API + redirect + static SPA over one SQLite file; no Node, Redis,
  Postgres, or Docker remain in the running system.
- All 15 endpoints + redirect behave per the documented contracts.
- Playwright E2E suite passes unchanged (UI/UX + journeys identical).
- `cargo test` passes (unit + integration).
- README + `.env.example` describe the new build/run with no container dependency.

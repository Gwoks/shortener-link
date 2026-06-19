# Feather-Weight Rust/Axum + SQLite + Vite SPA Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-platform the Link Shortener from Next.js(Node)+Postgres+Redis+Docker to a single Rust/Axum binary over SQLite that also serves a static Vite SPA, preserving UI/UX and all user journeys.

**Architecture:** One Rust/Axum binary is the only listener: it serves `/api/**`, the `/:code` redirect, the static Vite bundle (with SPA fallback), and runs background work as in-process tokio tasks over a single SQLite file. The frontend becomes a Vite + react-router SPA reusing every visual component unchanged. Auth moves fully into Rust (argon2id + Google/GitHub OAuth + stateless JWT cookie).

**Tech Stack:** Rust (axum, tokio, sqlx/sqlite, tower-http, serde, jsonwebtoken, argon2, oauth2, reqwest, scraper, qrcode+image, maxminddb, governor, moka, cuid); Vite + React 18 + react-router-dom + Tailwind (unchanged tokens); SQLite (WAL).

**Spec:** `docs/superpowers/specs/2026-06-19-rust-axum-sqlite-migration-design.md`. The existing TypeScript in `src/lib/*`, `src/worker/*`, `src/app/api/**`, `src/app/[code]/route.ts` and the documented contracts in `docs/features/link-shortener/ARCHITECTURE.md §6` are the **behavioral oracle**: each Rust port must reproduce the same inputs→outputs. The Playwright E2E suite (`tests/`) is the **fidelity gate**.

## Global Constraints

- **Issue tracking:** Use `bd` for all task tracking — never TodoWrite/markdown TODOs. (Project rule.)
- **Non-interactive shell:** Every command uses non-interactive flags (`-y`, `-f`, `rustup -y`, `CI=1`, `HOMEBREW_NO_AUTO_UPDATE=1`). Never run a command that can block on a prompt. (AGENTS.md.)
- **Branch:** All work on `feat/rust-axum-sqlite-migration`. Commit after each task. Push at session end.
- **API parity is law:** every `/api/**` response (success and the `{ error: { code, message, field?, suggestions? } }` envelope with the exact `ErrorCode`→status map in `src/lib/errors.ts`) must match the current app byte-for-shape. `src/components/lib/api.ts` and `types.ts` are the consumer contract and do not change.
- **UI/UX parity is law:** no visual or flow change. Only routing (`next/link`, `next/navigation`), auth client (`next-auth/react`), and page-shell files change on the frontend; the ~40 visual components in `src/components/**` stay byte-identical.
- **Single instance:** in-process cache/queues; no horizontal scaling. Document it.
- **IDs:** generate `cuid`-format IDs in Rust to match existing shapes.
- **SQLite:** `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`. A single writer task owns click writes.
- **Secrets:** `AUTH_SECRET` signs/verifies the JWT. OAuth redirect URIs: `${BASE_URL}/api/auth/oauth/:provider/callback`.

---

## File Structure

### Rust backend (`backend/`)
```
backend/
  Cargo.toml
  migrations/0001_init.sql            # full schema (ported from prisma/schema.prisma)
  src/
    main.rs                           # bootstrap: config, db, migrate, seed?, router, tasks, serve
    config.rs                         # env → typed Config (replaces src/lib/env.ts)
    db.rs                             # sqlx pool + pragmas + migrate()
    error.rs                          # ErrorCode enum + status map + IntoResponse envelope (src/lib/errors.ts)
    models.rs                         # row structs + serde (Link, ClickEvent, ClickRollup, User, Account, VisitorSeen)
    ids.rs                            # cuid generation
    auth/
      mod.rs                          # routes: register, login, logout, session, oauth start+callback
      jwt.rs                          # issue/verify HS256 JWT cookie
      password.rs                     # argon2id hash/verify (src/lib/hash.ts)
      oauth.rs                        # google+github authorization-code (oauth2)
      extractor.rs                    # CurrentUser / OptionalUser axum extractors (src/lib/session.ts, auth.ts)
    services/
      shortcode.rs alias.rs reserved.rs        # src/lib/{shortcode,alias,reserved}.ts
      validation.rs                            # src/lib/validation/{url,link}.ts
      ssrf.rs blocklist.rs                     # src/lib/{ssrf,blocklist}.ts
      referrer.rs ua.rs geo.rs                 # src/lib/{referrer,ua,geo}.ts
      utm.rs qr.rs serialize.rs                # src/lib/{utm,qr,serialize}.ts
      links.rs                                 # src/lib/links-service.ts
      analytics.rs                             # src/lib/analytics-service.ts
      redirect.rs                              # src/lib/redirect.ts (decision) + resolveForRedirect
      cache.rs                                 # moka cache + live click counter (src/lib/cache.ts)
      ratelimit.rs                             # governor buckets (src/lib/ratelimit.ts)
      unlock.rs                                # unlock token verify/issue (src/lib/unlock.ts)
      clicker_pages.rs                         # gate/dead-link HTML (src/lib/clicker-pages.ts)
    queue.rs                          # mpsc senders for click + scrape (src/lib/events.ts, scrape-queue.ts)
    routes/
      mod.rs                          # Router assembly + precedence + static/SPA fallback
      links.rs                        # /api/links* (route + bulk + check-alias + [id] + qr + unlock + analytics)
      analytics.rs                    # /api/analytics/summary
      guest.rs                        # /api/guest-links/*
      qr.rs                           # /api/qr/:code
      redirect.rs                     # GET /:code
      health.rs                       # /api/healthz
    tasks/
      click_ingest.rs scraper.rs sweep.rs      # src/worker/{clickConsumer,scraper,sweep}.ts
    bin/seed.rs                       # port of prisma/seed.ts
  tests/                              # axum integration tests over temp SQLite
```

### Frontend (Vite SPA, repo root)
```
index.html                           # Vite entry (replaces app/layout root)
vite.config.ts
src/main.tsx                         # ReactDOM root + RouterProvider + Providers
src/router.tsx                       # react-router route tree (replaces app/** file routes)
src/auth/auth-context.tsx            # AuthContext (replaces next-auth/react SessionProvider)
src/auth/auth-client.ts              # signIn/signOut/getProviders → Rust endpoints
src/routes/                          # page shells ported from src/app/**/page.tsx
  landing.tsx signin.tsx signup.tsx dead-link.tsx
  app-layout.tsx protected-route.tsx
  dashboard.tsx dashboard-new.tsx dashboard-bulk.tsx dashboard-analytics.tsx
  link-detail.tsx link-analytics.tsx settings.tsx
src/components/**                     # UNCHANGED except 17 routing-import swaps
```

### Removed at the end
`next`, `next-auth`, `next.config.mjs`, `next-env.d.ts`, `src/middleware.ts`, `src/app/**`, `src/lib/*` (server modules), `src/worker/**`, `prisma/**`, `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`, Prisma/Redis deps in `package.json`.

---

## Phase / Task overview

Each phase is one bd issue and ends with an independently testable deliverable. Tasks within a phase follow TDD (failing test → minimal impl → green → commit).

- **Phase 0** — Toolchain + crate scaffold (compiles, `cargo test` runs).
- **Phase 1** — Data layer: migrations + models + db pool + seeder.
- **Phase 2** — Pure services (no HTTP) + unit tests.
- **Phase 3** — Error envelope + API handlers (links/bulk/check-alias/qr/unlock/analytics/guest).
- **Phase 4** — Auth (register/login/logout/session + OAuth) + JWT.
- **Phase 5** — Redirect hot path + clicker pages.
- **Phase 6** — Background tokio tasks (click-ingest, scraper, sweep).
- **Phase 7** — Static serving + SPA fallback + router assembly + integration tests.
- **Phase 8** — Frontend: Vite scaffold + routing/auth swaps + page shells.
- **Phase 9** — Cleanup: remove Node/Next/Redis/Docker, env, README, scripts.
- **Phase 10** — Full verification: cargo tests + Playwright E2E + QA against acceptance criteria.

---

### Task 0: Toolchain + crate scaffold

**Files:** Create `backend/Cargo.toml`, `backend/src/main.rs`, `backend/rust-toolchain.toml`.

**Interfaces:**
- Produces: a compiling Axum binary that binds `PUBLIC_PORT` and answers `GET /api/healthz` → `200 {"status":"ok"}`.

- [ ] **Step 1:** Install Rust non-interactively:
  `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && . "$HOME/.cargo/env"`
  Verify: `cargo --version` prints a version.
- [ ] **Step 2:** Write `backend/Cargo.toml` with deps (axum 0.7, tokio 1 full, sqlx 0.8 sqlite+runtime-tokio, tower-http fs/trace/compression, serde/serde_json, jsonwebtoken 9, argon2 0.5, oauth2 4, reqwest 0.12 json, scraper, qrcode + image, maxminddb, governor, moka future, cuid2, time, tracing). `[[bin]] name="shortener" path="src/main.rs"`, `[[bin]] name="seed" path="src/bin/seed.rs"`.
- [ ] **Step 3:** Write minimal `src/main.rs`: load `PUBLIC_PORT` (default 8080), build `Router` with `/api/healthz`, serve via `tokio::net::TcpListener`.
- [ ] **Step 4:** `cargo build` → success; `cargo run &` then `curl localhost:8080/api/healthz` → `{"status":"ok"}`.
- [ ] **Step 5:** Commit `feat(backend): scaffold axum binary + healthz`.

### Task 1: Data layer (migrations + models + pool + seeder)

**Files:** Create `backend/migrations/0001_init.sql`, `backend/src/{db,models,ids,config}.rs`, `backend/src/bin/seed.rs`. **Oracle:** `prisma/schema.prisma`, `prisma/seed.ts`.

**Interfaces:**
- Produces: `db::pool(&cfg) -> SqlitePool` (WAL/FK/busy_timeout pragmas + `sqlx::migrate!()`); `models::{User,Account,Link,ClickEvent,ClickRollup,VisitorSeen}` structs with `FromRow`; `ids::cuid() -> String`; `config::Config::from_env()`.

- [ ] **Step 1:** Translate `prisma/schema.prisma` into `0001_init.sql`: tables `User, Account, Link, ClickEvent, ClickRollup, VisitorSeen`; enums→`TEXT CHECK(...)`; cuid `TEXT PRIMARY KEY`; datetimes `TEXT` (ISO-8601); JSON cols `TEXT`; booleans `INTEGER`. Drop `Session`, `VerificationToken`, `ClickEvent.streamId`. Recreate all indexes + uniques from the spec §6.
- [ ] **Step 2:** Write `config.rs` porting every key in `src/lib/env.ts` (+ new `SQLITE_PATH`, `AUTH_SECRET`, `PUBLIC_PORT`, `STATIC_DIR`; minus pg/redis/nextauth). Test: `Config::from_env()` parses a fixture env.
- [ ] **Step 3:** Write `db.rs` (`pool`, pragmas, `migrate`). Write `models.rs` structs. Test: open in-memory DB, run migrations, insert+select a `Link`, assert round-trip.
- [ ] **Step 4:** Port `prisma/seed.ts` → `src/bin/seed.rs` (sample admin + users + links, argon2id passwords). Run `cargo run --bin seed` against a temp DB; assert row counts.
- [ ] **Step 5:** `cargo test` green; commit `feat(backend): sqlite schema, models, pool, seeder`.

### Task 2: Pure services + unit tests

**Files:** `backend/src/services/{shortcode,alias,reserved,validation,ssrf,blocklist,referrer,ua,geo,utm,qr,serialize,unlock,cache,ratelimit,redirect,clicker_pages}.rs`. **Oracle:** the same-named files under `src/lib/` (+ `src/lib/validation/`).

**Interfaces (key signatures later tasks rely on):**
- `shortcode::generate() -> String` (6-char base62); `alias::normalize(&str)->String` (lowercased) and `alias::validate(&str)->Result<(),ErrorCode>`; `reserved::is_reserved(&str)->bool`.
- `validation::create_link(payload)->Result<ValidatedCreate, ValidationError>` mirroring `validation/link.ts`.
- `ssrf::is_safe_destination(&Url)->bool`; `blocklist::is_blocked(&Url)->bool`.
- `referrer::categorize(Option<&str>) -> (RefCategory, Option<String>)`; `ua::parse(&str)->(device,browser)`; `geo::lookup(ip)->(Option<country>,Option<city>)`.
- `redirect::resolve(link: Option<&LinkRow>, ctx: RedirectContext) -> Decision` enum `{Redirect{url,status}, Gate, Dead{reason}, NotFound}` — **exact** parity with `src/lib/redirect.ts`.
- `cache::Cache` (moka): `get/put/invalidate` + `incr_click_count`/`peek_click_count`.
- `ratelimit::Limiter::check(key, bucket) -> Result<(), RetryAfter>` for `shorten`/`unlock` buckets using `RL_*` config.
- `unlock::{issue_token, verify_token}`; `qr::png(data:&str)->Vec<u8>`; `clicker_pages::{gate_html(code), dead_link_html(reason)}`.

- [ ] For each module: **Step a** write failing unit test(s) asserting parity with the TS behavior (use the TS file's cases/branches as the table); **Step b** run to confirm fail; **Step c** port the implementation; **Step d** `cargo test <mod>` green; **Step e** commit `feat(backend): port <mod> service`.
- [ ] Priority order (dependencies first): reserved → alias → shortcode → validation → ssrf → blocklist → referrer → ua → geo → utm → qr → serialize → unlock → cache → ratelimit → redirect → clicker_pages.

### Task 3: Error envelope + API handlers

**Files:** `backend/src/error.rs`, `backend/src/routes/{links,analytics,guest,qr,health}.rs`, `backend/src/services/{links,analytics}.rs`, wire in `routes/mod.rs`. **Oracle:** `src/lib/errors.ts`, every file under `src/app/api/**`, `ARCHITECTURE.md §6`, and `src/components/lib/{api,types}.ts` for response shapes.

**Interfaces:**
- `error::ApiError{code:ErrorCode, message, field?, suggestions?, retry_after?}` implementing `IntoResponse` → `{ error: {...} }` with status from the map in `errors.ts`.
- `services::links::{create,list,get,patch,delete,bulk,check_alias}`; `services::analytics::{summary, per_link}`.
- Handlers consume `OptionalUser`/`CurrentUser` extractors (defined in Task 4; until then use a stub that reads the cookie's `sub`).

- [ ] Per endpoint (TDD): write an axum integration test posting the documented request and asserting the documented JSON + status (incl. error cases: `ALIAS_TAKEN`, `VALIDATION_ERROR`, `RATE_LIMITED`, `BULK_LIMIT_EXCEEDED`, `URL_BLOCKED`, `NOT_FOUND`, `FORBIDDEN`); implement the handler+service; green; commit.
- [ ] Endpoint coverage: `POST/GET /api/links`, `GET/PATCH/DELETE /api/links/:id`, `POST /api/links/bulk`, `GET /api/links/check-alias`, `GET /api/links/:id/qr`, `GET /api/qr/:code`, `POST /api/links/:id/unlock`, `GET /api/links/:id/analytics`, `GET /api/analytics/summary`, `GET /api/guest-links/claimable`, `POST /api/guest-links/claim`, `GET /api/healthz`.

### Task 4: Auth + JWT

**Files:** `backend/src/auth/{mod,jwt,password,oauth,extractor}.rs`. **Oracle:** `src/app/api/auth/register/route.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/lib/{auth,session,hash}.ts`.

**Interfaces:**
- `jwt::issue(user)->cookie_value`, `jwt::verify(&str)->Option<Claims{sub,email,name,image,exp}>`.
- Extractors `CurrentUser` (401 `UNAUTHENTICATED` if absent) and `OptionalUser` reading the JWT cookie.
- Routes: `POST /api/auth/register` (argon2id, `EMAIL_TAKEN`→409), `POST /api/auth/login`, `POST /api/auth/logout` (clear cookie), `GET /api/session` (→ `{user}|{user:null}`), `GET /api/auth/oauth/:provider` (302 to provider), `GET /api/auth/oauth/:provider/callback` (exchange, upsert User+Account, set cookie, 302 to `/dashboard`).

- [ ] TDD per route; replace Task 3's stub extractor with the real one; green; commit `feat(backend): rust-owned auth (jwt + oauth)`.

### Task 5: Redirect hot path + clicker pages

**Files:** `backend/src/routes/redirect.rs`. **Oracle:** `src/app/[code]/route.ts`.

- [ ] TDD the decision→response mapping: active→301/302 + click enqueue + atomic max-clicks; gate→`clicker_pages::gate_html` (200); dead→`dead_link_html` (410); not-found→`dead_link_html` (404). Use cache→SQLite lookup via `services::redirect::resolve_for_redirect(code)`. Commit `feat(backend): /:code redirect + clicker pages`.

### Task 6: Background tokio tasks

**Files:** `backend/src/tasks/{click_ingest,scraper,sweep}.rs`, `backend/src/queue.rs`. **Oracle:** `src/worker/{clickConsumer,scraper,sweep}.ts`, `src/lib/{events,scrape-queue}.ts`.

- [ ] `queue.rs`: mpsc senders/receivers for click + scrape, stored in app state.
- [ ] `click_ingest`: single writer; batch insert `ClickEvent`, upsert `VisitorSeen` (unique detection), upsert `ClickRollup`, bump `Link.clickCount`. Test: enqueue N clicks → assert rows + rollups.
- [ ] `scraper`: SSRF-guarded fetch + title/meta parse → update meta fields/status. Test with a local fixture server.
- [ ] `sweep`: expire links, prune `ClickEvent` past `CLICK_RETENTION_DAYS`, purge guest links past `GUEST_TTL_HOURS`. Test with seeded fixtures + fake clock injection.
- [ ] Spawn all three from `main.rs`. Commit per task.

### Task 7: Static serving + SPA fallback + router assembly

**Files:** `backend/src/routes/mod.rs`, `backend/src/main.rs`. **Oracle:** spec §3 routing precedence.

- [ ] Assemble Router precedence: `/api/**` → handlers; hashed assets dir → `ServeDir` on `STATIC_DIR`; `/:code` (regex-guarded) → redirect; fallback `GET` → serve `index.html`. Integration test: unknown `/dashboard/x` returns `index.html`; `/api/healthz` returns JSON; bad `/zz` (no link) returns dead-link 404.
- [ ] Commit `feat(backend): static + SPA fallback + router precedence`.

### Task 8: Frontend — Vite SPA

**Files:** Create `index.html`, `vite.config.ts`, `src/main.tsx`, `src/router.tsx`, `src/auth/{auth-context,auth-client}.{tsx,ts}`, `src/routes/*`; modify the 17 routing files + 4 auth files under `src/components/**`. **Oracle:** `src/app/**/page.tsx`, `src/components/providers.tsx`, `auth-screen.tsx`, `app-shell.tsx`, `settings-page.tsx`.

**Interfaces:**
- `auth-context`: `useAuth() -> { user, loading, refresh }`, loads `GET /api/session` on mount.
- `auth-client`: `signIn(provider?)`, `signOut()`, `getProviders()`.
- `<ProtectedRoute>`: redirects to `/signin?callbackUrl=...` when `!user`.

- [ ] **Step 1:** Add Vite + react-router + plugin-react to `package.json`; `vite.config.ts` (React plugin, dev proxy `/api`→Rust, build `outDir: dist`); `index.html` mounting `#root`; `src/main.tsx`.
- [ ] **Step 2:** `src/router.tsx` mapping every former route (landing `/`, `/signin`, `/signup`, `/dead-link`, protected `(app)` group: `/dashboard`, `/dashboard/new`, `/dashboard/bulk`, `/dashboard/analytics`, `/dashboard/links/:id`, `/dashboard/links/:id/analytics`, `/settings`).
- [ ] **Step 3:** Port each `page.tsx`/`layout.tsx` to a `src/routes/*` component (drop `force-dynamic`/server `auth()`; `(app)/layout` → `<AppShell>` inside `<ProtectedRoute>`).
- [ ] **Step 4:** Swap routing imports in the 17 component files: `next/link`→react-router `Link` (`href`→`to`); `useRouter().push`→`useNavigate()`; `useSearchParams`/`usePathname`→react-router hooks.
- [ ] **Step 5:** Replace `next-auth/react` in the 4 files with `auth-context`/`auth-client`.
- [ ] **Step 6:** `pnpm build` → `dist/`; smoke: `cargo run` (with `STATIC_DIR=dist`) + open `/` → landing renders; sign-in flow works against Rust.
- [ ] **Step 7:** Commit `feat(frontend): vite SPA + react-router (UI unchanged)`.

### Task 9: Cleanup — remove Node/Next/Redis/Docker

**Files:** delete `next.config.mjs`, `next-env.d.ts`, `src/middleware.ts`, `src/app/**`, server `src/lib/*`, `src/worker/**`, `prisma/**`, `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`; rewrite `package.json` (drop next/next-auth/prisma/ioredis/argon2/etc., scripts → vite + cargo), `.env.example`, `README.md`; add `scripts/start.sh`, sample `deploy/shortener.service`.

- [ ] Remove files; `pnpm build` (frontend) still green; `cargo build --release` green; `git rm` deletions; commit `chore: remove next/node/redis/postgres/docker`.

### Task 10: Full verification (fidelity gate)

- [ ] `cargo test` (unit + integration) all green.
- [ ] Update Playwright harness (`playwright.config.ts` / global setup) to boot the single Rust binary (build frontend, migrate+seed temp SQLite, run binary) instead of Docker.
- [ ] `pnpm e2e` green — UI/UX + journeys identical. Triage any failure as a parity bug in the Rust port (not a test change), except harness/boot wiring.
- [ ] Re-check acceptance criteria in `docs/features/link-shortener/PRD.md` / `QA-REPORT.md`.
- [ ] Commit `test: e2e + cargo green on rust/sqlite stack`; push branch; open PR.

---

## Self-Review

**Spec coverage:** §3 architecture→Tasks 7,5,3; §4 frontend→Task 8; §5 backend modules→Tasks 2–6 (module-by-module table); §5.2 API parity→Task 3; §5.3 auth→Task 4; §5.4 redirect→Task 5; §5.5 tasks→Task 6; §6 data→Task 1; §7 config→Task 1/9; §8 deploy→Task 9; §9 testing→Tasks 2–10; §10 sequence→phase order; §11 risks mitigated in-task (single-writer in Task 6, SPA fallback in Task 7, parity oracle throughout). No gaps.

**Placeholder scan:** Bulk ports intentionally reference the existing same-named TS file as the behavioral oracle (the implementation already exists and is the spec) — this is a port, not a from-scratch build, so "port `src/lib/x.ts`" is a concrete instruction, not a TODO. All signatures the cross-task interfaces depend on are named in the Interfaces blocks.

**Type consistency:** `Decision` enum variants (Task 2) are consumed verbatim in Task 5; `ApiError`/`ErrorCode` (Task 3) reused in Tasks 4–6; `CurrentUser`/`OptionalUser` extractors (Task 4) replace the Task 3 stub; `cuid()` (Task 1) used everywhere; cache/queue handles created in Tasks 2/6 and read in Task 7's app state. Consistent.

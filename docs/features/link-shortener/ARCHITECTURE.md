# ARCHITECTURE: Link Shortener Platform

- **Slug:** `link-shortener`
- **Status:** Design phase — stable contract for parallel build
- **Author:** System Architect (multi-agent pipeline)
- **Date:** 2026-06-19
- **Inputs:** `docs/features/link-shortener/PRD.md`
- **Consumers:** Backend, Frontend, QA. This document is the **binding contract**. Where PRD and this doc disagree on a number/shape, this doc wins; where this doc is silent, the PRD governs intent.

> **Reading order for engineers:** §1 (stack) → §7 (directory plan) → §5 (data model) → §6 (API contract) → §10 (build/run/test). Frontend can treat §6 as the source of truth and mock against it on day one.

---

## 0. Decision summary (TL;DR)

| Concern | Decision | PRD ref |
| --- | --- | --- |
| App framework | **Next.js 14 (App Router) + TypeScript** — one deployable serving UI, internal API, and the redirect path | A-STACK, OQ-1 |
| Topology | **Modular monolith** in one Next app + **one background worker** process (same codebase) | §9 |
| Auth | **Auth.js (NextAuth v5)** — Google + GitHub OAuth + Credentials (email/password) | A-STACK, FR-27 |
| Primary datastore | **PostgreSQL 16** via **Prisma ORM** | A-DATASTORE, OQ-5 |
| Cache + queue + rate-limit + unlock sessions | **Redis 7** (cache-aside for redirects; **Redis Streams** for click ingestion; token-bucket rate limiting) | NFR-1, NFR-3, A-INGEST |
| Click ingestion | **Async, at-least-once** — redirect `XADD`s an event to a Redis Stream; a **worker** consumes via consumer group and writes events + updates rollups | NFR-3, A-INGEST |
| Redirect status | **302** default (configurable per-link later; not required now) with `Cache-Control: private, no-store` | A-REDIR, OQ-2 |
| Short code | **Base62 `[0-9A-Za-z]`, length 6**, random-and-check with retry; auto-grow to 7 at saturation | A-COL |
| Alias namespace | **Global**, case-insensitive, shares table with generated codes; reserved-word + charset + length checks | A-ALIAS |
| GeoIP | **MaxMind GeoLite2-City `.mmdb`**, bundled into the image via documented provisioning | A-GEO, NFR-11 |
| Threat blocklist | **Offline bundled host/URL blocklist** (newline file → in-memory set), no online API | A-GEO, FR-36 |
| Visitor PII | **Hashed+truncated IP** (HMAC-SHA256, `/24` IPv4 / `/48` IPv6, server-pepper) + cookie-first unique-visitor key | A-PII, A-UNIQUE, OQ-3 |
| Password hashing | **argon2id** for both link passwords and email/password accounts | NFR-5 |
| Local run | **`docker-compose up`** brings up `web`, `worker`, `postgres`, `redis` — no paid keys | NFR-10 |

Everything in §3.1 of the PRD is in scope for this single build. Nothing is deferred.

---

## 1. Chosen stack & rationale

### 1.1 The core decision: how to keep the redirect hot path fast while shipping a rich app

This product is two workloads in one: a **high-traffic, latency-critical redirect path** (clickers) and a **feature-dense management/analytics app** (owners). The architecture is shaped primarily by NFR-1/2/3 — the redirect must resolve from cache and must not block on an analytics write.

I considered five framework/topology approaches before choosing.

| # | Approach | Pros | Cons | Verdict |
| --- | --- | --- | --- | --- |
| 1 | **Next.js full-stack monolith + a worker process** (chosen) | One language/repo; App Router gives both SSR dashboard and route handlers; Auth.js is first-class; redirect is a thin Edge/Node route hitting Redis; one `docker-compose` | Must be disciplined so heavy app code doesn't bloat the redirect path | **Chosen** — best fit for "fully local, one build, rich UI + fast redirect," least integration surface for parallel agents |
| 2 | **Split: Next.js frontend + standalone Node/Express (or NestJS) API** | Clean separation; API independently scalable | Two deploy units, two auth integrations, CORS, duplicated types, more `docker-compose` services — more integration churn for parallel agents (the PRD's #1 risk, §9) | Rejected: extra seams hurt the parallel build |
| 3 | **Go/Fastify redirect microservice + Next app for everything else** | Theoretically fastest redirect | Polyglot; second build/test toolchain; the latency target (p95 < ~50 ms cache-hit, local) is comfortably met by Node+Redis, so the speed win is unneeded | Rejected: premature; violates "minimal local footprint" |
| 4 | **SvelteKit / Remix monolith** | Comparable full-stack ergonomics | Auth.js + ecosystem maturity for this exact feature set (OAuth providers, QR, charts, Prisma) is strongest on Next; PRD names NextAuth as the default | Rejected: no advantage, weaker default-library alignment |
| 5 | **Serverless/edge-first (e.g. Cloudflare Workers + D1/KV)** | Excellent redirect latency at the edge | Directly conflicts with "fully runnable locally via docker-compose, no paid keys"; not self-hostable in the required way | Rejected: violates NFR-10 hard constraint |

**Chosen: Approach 1 — Next.js modular monolith + a co-located worker.** It minimizes the integration surface (the dominant delivery risk per PRD §9), runs entirely locally, and keeps the redirect path a thin handler over Redis. The "monolith bloats the hot path" risk is mitigated structurally: the redirect route handler imports only `lib/redirect`, `lib/cache`, and `lib/events` — never the dashboard/Prisma-heavy modules (see §7, §8.1).

### 1.2 Final stack

| Layer | Choice | Why (and trade-off accepted) |
| --- | --- | --- |
| **Language** | TypeScript (strict) | One language across web + worker; shared types/validators (the API contract) live in one place, eliminating frontend/backend drift. |
| **Runtime** | Node.js 20 LTS | Stable, broad library support; the redirect handler runs on the Node runtime (needs Redis client + ioredis, not Edge-only APIs). |
| **Framework** | Next.js 14, App Router | SSR dashboard + Route Handlers (`app/api/**`) + the catch-all redirect route in one app. Server Components keep dashboard data-fetching on the server. Trade-off: App Router's caching defaults require care — we explicitly mark all API/redirect routes dynamic (§8.1). |
| **Auth** | Auth.js (NextAuth v5) | Google + GitHub OAuth and a Credentials provider (email/password, argon2id) with the Prisma adapter. Fully self-hosted, no paid key. JWT session strategy (stateless, simpler local). Trade-off: Credentials + JWT means we manage email/password verification ourselves (acceptable; argon2id + rate limiting). |
| **ORM / DB access** | Prisma 5 | Type-safe schema → client, painless migrations (`prisma migrate`), good DX for parallel agents. Trade-off: raw SQL still available via `$queryRaw` for the few hot aggregate queries. |
| **Primary DB** | PostgreSQL 16 | Relational integrity for the global short-code uniqueness constraint, partial indexes for "active links," JSONB where useful, and good-enough analytics aggregation at this scale. One store keeps the local container count low (A-DATASTORE). |
| **Cache / broker / limiter** | Redis 7 (via `ioredis`) | (a) cache-aside store for resolved redirects; (b) **Redis Streams** + consumer groups for at-least-once click ingestion; (c) token-bucket rate limiting; (d) short-lived password-unlock sessions; (e) debounced alias-availability is just a DB read, not cached. One Redis covers four concerns → minimal footprint. Trade-off: Redis is in the critical path for redirects; on a Redis miss we fall back to Postgres and re-warm (correctness preserved, latency degrades). |
| **Validation** | Zod | Single schema set validates API inputs server-side AND is reused by the frontend for form validation — the contract is executable. |
| **Styling / UI** | Tailwind CSS + **CSS custom properties (semantic design tokens)** + Radix UI primitives | Semantic tokens (not hardcoded inversion) satisfy FR-41/NFR-13 dark-light theming; Radix gives accessible, keyboard-operable menus/dialogs/popovers (NFR-14) for free. DESIGN.md owns the token values; this doc only fixes the mechanism. |
| **Charts** | Recharts (or visx) | Lightweight line/area/bar/donut per A-GEOVIZ; every chart ships an accessible table/summary equivalent (NFR-15). Final pick is the frontend's, bounded here to a dependency-free-of-paid-keys lib. |
| **QR generation** | `qrcode` (npm) | Server-side PNG generation + sizes (FR-13); no external service. |
| **HTML metadata scrape** | `undici` fetch + `cheerie`/`node-html-parser` + custom SSRF guard | Outbound scrape with strict SSRF controls (§4.5); runs in the **worker**, never on link-create. |
| **Geo lookup** | `maxmind` (npm) reading a bundled `GeoLite2-City.mmdb` | Offline geo enrichment in the worker (FR-6, NFR-11). |
| **Password hashing** | `argon2` (argon2id) | NFR-5. |
| **Testing** | **Vitest** (unit/integration) + **Playwright** (E2E, used by QA) | Vitest for fast unit/integration of `lib/*` and route handlers; Playwright drives real browser flows (redirect, password gate, dark mode, mobile). |
| **Lint/format** | ESLint (next/core-web-vitals + @typescript-eslint) + Prettier | Quality gate for both engineers. |
| **Containerization** | Docker + docker-compose | `web`, `worker`, `postgres`, `redis` (NFR-10). |

---

## 2. High-level architecture

### 2.1 Components

```
                          ┌─────────────────────────────────────────────┐
   Clicker  ──GET /:code──▶│  web (Next.js, Node runtime)                │
                          │                                             │
                          │  ┌───────────────────────────────────────┐  │
                          │  │ Redirect path (HOT)                    │  │
   Owner / Guest          │  │  app/[code]/route.ts                   │  │
   ── UI + /api ────────▶ │  │   → lib/cache (Redis GET)  ── miss ──┐ │  │
                          │  │   → lib/redirect (rules)            │ │  │
                          │  │   → lib/events.enqueue (XADD)       │ │  │
                          │  └─────────────────────────────────────┼─┘  │
                          │                                         │    │
                          │  ┌──────────────────────────────────┐  │    │
                          │  │ App/API (WARM)                    │  │    │
                          │  │  app/api/**  (route handlers)     │  │    │
                          │  │  app/(dashboard)/**  (RSC pages)  │  │    │
                          │  │  Auth.js, Prisma, Zod, QR         │  │    │
                          │  └──────────────────────────────────┘  │    │
                          └──────────┬───────────────┬─────────────┼────┘
                                     │               │             │ (cache miss → read)
                              ┌──────▼─────┐   ┌─────▼──────┐      │
                              │  Redis 7   │   │ Postgres16 │◀─────┘
                              │  - cache   │   │  - source  │
                              │  - stream  │   │    of truth│
                              │  - limiter │   └─────▲──────┘
                              │  - unlock  │         │ write events + rollups
                              └──────┬─────┘         │
                                     │ XREADGROUP    │
                              ┌──────▼───────────────┴─────┐
                              │  worker (Node, same repo)   │
                              │  - click ingestion consumer │
                              │  - geo + UA + referrer enrich│
                              │  - metadata scraper (SSRF)  │
                              │  - expiry/TTL sweep (cron)  │
                              └─────────────────────────────┘
```

### 2.2 Request flows

**A. Redirect (hot path) — `GET /:code`**
1. Validate code shape (cheap regex). If it collides with a reserved app route, Next routing already handled it (reserved words are real routes / excluded — see §3.1).
2. `lib/cache.getRedirect(code)` → Redis `GET redirect:{code}`.
   - **Hit (active link):** read the cached record `{destination, status, expiresAt, maxClicks, hasPassword, ...}`.
   - **Miss:** read from Postgres, compute the resolution, and `SET` the cache entry (or a negative/"dead" marker) with TTL.
3. Apply resolution rules (`lib/redirect.resolve`), in order:
   - not found → **404** dead-link page.
   - deactivated / expired (by datetime) / max-clicks reached → **410** dead-link page.
   - password-protected & no valid unlock cookie → **200** password-gate page (no redirect, no click counted).
   - otherwise → **302** to destination with `Location` + `Cache-Control: private, no-store`.
4. On a *counted* redirect (incl. just-unlocked), `lib/events.enqueue()` does a fire-and-forget `XADD clicks * ...` (capped stream). **The response is returned without awaiting durable analytics.** Max-click enforcement uses an atomic Redis counter so the (K+1)th request is denied without a DB round-trip (§4.4).

**B. Click ingestion (async) — worker**
1. `XREADGROUP` from the `clicks` stream (consumer group `ingest`).
2. Enrich: GeoIP (country/city), UA → device/browser, referrer → category, hash visitor key.
3. Insert a `ClickEvent` row; upsert the per-link daily rollup (`ClickRollup`) and `Link.clickCount`.
4. `XACK` on success. At-least-once: a crash between insert and ACK may reprocess; dedupe by stream entry id (store `lastEntryId`) keeps over-count negligible (NFR-3, AC-9 tolerance).

**C. Create link (warm) — `POST /api/links`**
1. Auth context (registered or guest-by-cookie). Rate-limit by IP (token bucket, Redis).
2. Validate URL (Zod) → scheme/host check → **inbound blocklist** check (offline set). Reject blocked with FR-36 messaging.
3. Resolve alias (if any): charset/length/reserved/uniqueness. Else generate Base62 code with retry-on-collision.
4. Insert `Link` (metadata `status=PENDING_META`). Enqueue a **scrape job** (worker) — does not block the response.
5. Generate QR lazily on request (§4.3). Return the created link.

**D. Metadata scrape (async) — worker**: SSRF-guarded outbound fetch of destination, parse `<title>`/`<meta description>`, update `Link.metaTitle/metaDescription/metaStatus`. Bounded by timeout/size/redirects. Never blocks create (FR-19, AC-26/27).

**E. Expiry sweep (async) — worker cron (e.g. every 60s):** flips links whose `expiresAt` passed or whose guest TTL elapsed to `EXPIRED`, and invalidates their cache entries. Redirect-time checks are the authoritative guard (defense in depth, NFR-12); the sweep keeps dashboards/listing honest.

---

## 3. Routing & namespace (critical, shared by FE/BE)

### 3.1 URL namespace partition

The redirect route is a catch-all that must **not** shadow application routes. Partition:

- **Reserved roots (real app routes, never short codes):** `api`, `login`, `signup`, `logout`, `dashboard`, `admin`, `settings`, `account`, `analytics`, `links`, `bulk`, `qr`, `auth`, `healthz`, `_next`, `static`, `assets`, `favicon.ico`, `robots.txt`, `sitemap.xml`. The reserved-word list lives in `lib/reserved.ts` and is the single source for both Next route definitions and alias validation (FR-3, AC-5).
- **Short codes / aliases:** everything else matching `^[A-Za-z0-9_-]{3,50}$` resolves through `app/[code]/route.ts`. Generated codes are exactly 6 Base62 chars; user aliases are 3–50 chars from `[A-Za-z0-9_-]`.

Next.js route precedence resolves static/defined segments before the dynamic `[code]` catch, so reserved roots win automatically; alias validation additionally rejects reserved words at create-time so they can never be minted.

### 3.2 Page routes (frontend)

| Route | Audience | Purpose |
| --- | --- | --- |
| `/` | Guest | Focused hero: paste → shorten → result card (A-LANDING, FR-32/45). |
| `/login`, `/signup` | All | Auth.js sign-in (Google/GitHub/email-password). |
| `/dashboard` | Registered | Link list (table → stacked cards on mobile), search/filter/sort/pagination (FR-28/29). |
| `/dashboard/new` | Registered | Create form + UTM builder + custom alias + expiry/password (FR-2/15/16/22). |
| `/dashboard/bulk` | Registered | Bulk shorten + results table + CSV export (FR-24/26). |
| `/dashboard/links/[id]` | Registered | Link detail + edit. |
| `/dashboard/links/[id]/analytics` | Registered | Per-link analytics (FR-7). |
| `/dashboard/analytics` | Registered | Aggregate analytics (FR-8). |
| `/settings` | Registered | Theme, account. |
| `/[code]` | Clicker | Redirect / password gate / dead-link (handled by route handler, not a normal page). |

---

## 4. Cross-cutting concerns

### 4.1 Authentication & authorization
- **Auth.js (NextAuth v5)** with Prisma adapter, **JWT session strategy**. Providers: Google, GitHub, Credentials (email/password, argon2id verify).
- Session exposes `user.id`. All `/api/links/**` and `/dashboard/**` require a session except the explicitly guest-allowed create path (§4.7).
- **Authorization rule:** a `Link` is mutable/visible in management views only by `link.ownerId === session.user.id`. Analytics read of a link requires ownership. Guest links have `ownerId = null` and are addressable only via the redirect path + the creating browser's guest cookie until claimed.
- **Route protection:** `middleware.ts` guards `/dashboard/**` and `/settings` (redirect to `/login`). API handlers re-check authorization server-side (never trust the middleware alone).

### 4.2 Guest mode & claiming
- A guest is identified by a signed httpOnly cookie `guest_id` (random UUID) minted on first guest shorten.
- Guest links: `ownerId = null`, `isGuest = true`, `expiresAt = now + 24h`, `guestKey = hash(guest_id)`.
- On signup/first login, if `guestKey` for the current cookie maps to still-live links, the API offers them via `GET /api/guest-links/claimable`; the user opts in via `POST /api/guest-links/claim`, which sets `ownerId`, clears `isGuest`, and nulls the guest `expiresAt` (FR-34, AC-42).

### 4.3 QR codes
- Generated **on demand** at `GET /api/links/{id}/qr?size=sm|md|lg&format=png` (and a guest variant by code). Server returns `image/png`. Inline display uses the same endpoint; download triggers `Content-Disposition: attachment`. Size presets map to pixel dimensions (e.g. sm=256, md=512, lg=1024) — ≥2 presets per FR-13. The accessible alt text and the copyable short link are rendered by the frontend beside the image (FR-14).

### 4.4 Rate limiting & max-clicks (Redis)
- **Token-bucket** in Redis keyed independently:
  - `rl:shorten:{ipHash}` — link creation (FR-35).
  - `rl:unlock:{linkId}:{ipHash}` — password attempts, with escalating lockout/backoff (FR-18, AC-24).
- Limits are env-configurable (defaults documented in `.env.example`). On limit, API returns **429** with a structured body (§6.3) the UI renders as a friendly, recoverable message (never a bare 429 to the user) (FR-35/37, AC-43).
- **Max-clicks** is enforced with an atomic Redis `INCR` on `clicks:count:{code}` compared to the cached `maxClicks`, so the (K+1)th hit is denied on the hot path without touching Postgres (AC-21). The durable counter is reconciled by the worker.

### 4.5 SSRF-safe scraper (mandatory, distinct from inbound blocklist)
Two **separate** trust boundaries (PRD §9):
- **Inbound (create-time):** destination URL checked against the offline phishing/malware blocklist (`lib/blocklist.ts`). Reject → FR-36 message.
- **Outbound (scrape-time, worker only):** `lib/ssrf.ts` enforces:
  - scheme must be http/https; resolve DNS and **reject** if any resolved IP is private/loopback/link-local/ULA/`169.254.0.0/16`/`::1`/cloud-metadata `169.254.169.254`.
  - **Pin the resolved IP** for the actual connection to defeat DNS-rebinding (re-validate post-redirect on each hop).
  - max **3** redirects, **5s** total timeout, **512 KB** body cap, no auth/cookies forwarded.
  - On any violation: abort, mark `metaStatus=FAILED`; the link is still created (AC-27).

### 4.6 Visitor privacy / PII
- Stored visitor identity = `HMAC-SHA256(pepper, truncatedIP + dailySalt)` where IPv4 is truncated to `/24` and IPv6 to `/48` (A-PII). Raw IP is **never** persisted or logged.
- **Unique visitor** = cookie-first (`vid` analytics cookie); fallback to `hash(ip + userAgent)` when absent (A-UNIQUE).
- Click events have a finite retention window (default 400 days, env-configurable); rollups are retained indefinitely. The same hashed-IP key bases guest rate-limiting.

### 4.7 Error handling (uniform contract)
- All API errors return a structured JSON envelope (§6.3) with a stable machine `code` and a human `message` carrying a recovery path (FR-37). The frontend maps `code` → localized, friendly copy and recovery affordance.
- Clicker-facing failures render **on-brand pages**, not raw errors: 404 (never existed), 410 (expired/deactivated/max-clicks), password gate (FR-38/39, AC-20/21/22).
- Validation errors are 422 with field-level detail (from Zod). Never leak stack traces or internal IDs.

### 4.8 Multi-tenancy
Single-user accounts only (no orgs/teams — PRD §3.2). "Tenancy" = per-user data isolation enforced by `ownerId` scoping on every query. There is no shared workspace concept; analytics and links are strictly owner-scoped.

---

## 5. Data model

PostgreSQL via Prisma. Auth.js standard tables (`Account`, `Session`, `VerificationToken`) are included via the adapter and elided here except `User`.

### 5.1 Entities

**User**
| Field | Type | Notes |
| --- | --- | --- |
| id | `String` (cuid) PK | |
| email | `String` unique | |
| emailVerified | `DateTime?` | |
| name, image | `String?` | from OAuth |
| passwordHash | `String?` | argon2id; null for OAuth-only users (NFR-5) |
| createdAt | `DateTime` default now | |

**Link** (core entity; short code is the natural key for redirects)
| Field | Type | Notes |
| --- | --- | --- |
| id | `String` (cuid) PK | internal handle used by management API |
| code | `String` unique | the short code OR custom alias; **global namespace** (FR-2). Stored lowercased for case-insensitive matching; original-case alias kept in `aliasDisplay?` |
| destinationUrl | `String` | the (UTM-assembled) target |
| ownerId | `String?` FK→User.id | null = guest link (FR-33) |
| isGuest | `Boolean` default false | |
| guestKey | `String?` | hash of guest cookie for claiming (FR-34) |
| status | `LinkStatus` enum | `ACTIVE \| EXPIRED \| DEACTIVATED` |
| metaStatus | `MetaStatus` enum | `PENDING \| READY \| FAILED` (FR-43) |
| metaTitle | `String?` | scraped (FR-19) |
| metaDescription | `String?` | scraped |
| passwordHash | `String?` | argon2id; presence ⇒ password-protected (FR-16) |
| expiresAt | `DateTime?` | datetime expiry (FR-15) |
| maxClicks | `Int?` | click cap (FR-15) |
| clickCount | `Int` default 0 | denormalized running total (worker-maintained) |
| createdAt | `DateTime` default now | |
| updatedAt | `DateTime` updatedAt | cache invalidation trigger (FR-21) |

**ClickEvent** (raw async-ingested events; the analytics fact table)
| Field | Type | Notes |
| --- | --- | --- |
| id | `String` (cuid) PK | |
| linkId | `String` FK→Link.id | `onDelete: Cascade` (deleting a link removes analytics, AC-14) |
| occurredAt | `DateTime` | event time (from redirect) |
| visitorKey | `String` | hashed/truncated, for unique counting (A-PII/A-UNIQUE) |
| isUnique | `Boolean` | computed at ingest (first-seen visitorKey for link) |
| referrerCategory | `RefCategory` enum | `SOCIAL \| SEARCH \| DIRECT \| REFERRAL \| OTHER` (FR-7) |
| referrerHost | `String?` | normalized host, null = direct |
| country, city | `String?` | from GeoLite2 (FR-6) |
| deviceType | `String?` | mobile/desktop/tablet/bot |
| browser | `String?` | UA-derived |
| streamId | `String` unique | Redis stream entry id, for idempotent ingest (NFR-3) |

**ClickRollup** (per-link daily aggregate for fast charts)
| Field | Type | Notes |
| --- | --- | --- |
| id | PK | |
| linkId | FK→Link.id | `onDelete: Cascade` |
| day | `DateTime` (date) | bucket |
| clicks | `Int` | |
| uniques | `Int` | |
| byReferrer, byCountry, byDevice, byBrowser | `Json` | small maps for breakdown charts |
| | | **unique (linkId, day)** |

**ReservedAlias** — not a table; a static list in `lib/reserved.ts` (§3.1). Kept in code so Next routing and validation share one source.

### 5.2 Enums
`LinkStatus { ACTIVE, EXPIRED, DEACTIVATED }` · `MetaStatus { PENDING, READY, FAILED }` · `RefCategory { SOCIAL, SEARCH, DIRECT, REFERRAL, OTHER }`

> **Status presentation (FR-30):** `status` is the persisted lifecycle. The UI derives presentation states — *active, expiring-soon (active & expiresAt within 24h), expired, deactivated, password-protected (passwordHash present), metadata-pending (metaStatus=PENDING)* — from these columns; they are not separate stored states. Always rendered as icon + text (AC-38).

### 5.3 Relationships
- `User 1—* Link` (nullable on the Link side for guests).
- `Link 1—* ClickEvent` and `Link 1—* ClickRollup`, both cascade-delete (AC-14/29).

### 5.4 Indexes (performance-critical)
| Index | Purpose |
| --- | --- |
| `Link.code` unique btree | redirect lookup on cache miss; uniqueness enforcement for codes+aliases (AC-2/5) |
| `Link (ownerId, createdAt desc)` | dashboard listing/pagination (FR-29) |
| partial `Link (ownerId) WHERE status='ACTIVE'` | fast active-link filters/counts |
| `Link (status, expiresAt)` | expiry sweep (NFR-12) |
| `Link (guestKey) WHERE isGuest` | guest-claim lookup (FR-34) |
| `ClickEvent (linkId, occurredAt)` | per-link time-series + retention pruning |
| `ClickEvent.streamId` unique | idempotent ingest dedupe (NFR-3) |
| `ClickRollup (linkId, day)` unique | upsert target for rollups; powers charts |

---

## 6. API contract

> **This section is binding.** All routes are under the Next app. JSON unless noted. All mutating routes are CSRF-protected (Auth.js) and dynamic (no caching). Auth: **S** = session required (owner), **G** = guest-or-session allowed, **P** = public.

### 6.1 Conventions
- Base path for app API: `/api`. IDs in paths are the `Link.id` (cuid). The redirect path uses `code` and lives at the root (`/:code`), **not** under `/api`.
- Timestamps are ISO-8601 UTC strings. All list endpoints are cursor- or page-paginated and return `{ items, page, pageSize, total }`.
- A `Link` resource serialized to the client:
```json
{
  "id": "clz…",
  "code": "Ab3xK9",
  "shortUrl": "http://localhost:3000/Ab3xK9",
  "destinationUrl": "https://example.com/very/long?utm_source=x",
  "status": "ACTIVE",
  "metaStatus": "READY",
  "metaTitle": "Example",
  "metaDescription": "…",
  "hasPassword": true,
  "expiresAt": "2026-07-01T00:00:00Z",
  "maxClicks": 1000,
  "clickCount": 42,
  "isGuest": false,
  "createdAt": "2026-06-19T…",
  "updatedAt": "2026-06-19T…"
}
```
(`passwordHash` is NEVER serialized; only `hasPassword: boolean`.)

### 6.2 Endpoints

**Links — management**

| Method & path | Auth | Body / query | Success | Errors |
| --- | --- | --- | --- | --- |
| `POST /api/links` | **G** | `{ url, alias?, expiresAt?, maxClicks?, password?, utm?: {source,medium,campaign,term,content} }` | `201 { link }` | 422 invalid url/alias; 409 `ALIAS_TAKEN`; 422 `ALIAS_RESERVED`; 400 `URL_BLOCKED`; 429 `RATE_LIMITED` |
| `GET /api/links` | **S** | `?q=&status=active\|expiring\|expired\|protected&sort=created\|clicks&order=&page=&pageSize=` | `200 { items:[link], page, pageSize, total }` | 401 |
| `GET /api/links/{id}` | **S** | — | `200 { link }` | 401, 403, 404 |
| `PATCH /api/links/{id}` | **S** | `{ destinationUrl?, alias?, expiresAt?, maxClicks?, status?, password?:string\|null }` (password=null clears) | `200 { link }` — **invalidates redirect cache** (FR-21, AC-28) | 401,403,404,409 ALIAS_TAKEN,422 |
| `DELETE /api/links/{id}` | **S** | — | `204` — cascade-deletes analytics, evicts cache (AC-29) | 401,403,404 |
| `GET /api/links/check-alias?alias=` | **G** | — | `200 { available: boolean, reason?: "taken"\|"reserved"\|"invalid", suggestions?: string[] }` (debounced live check, FR-44/AC-4) | 429 |
| `GET /api/links/{id}/qr?size=sm\|md\|lg&download=0\|1` | **S** | — | `200 image/png` (FR-12/13) | 401,403,404 |

**Bulk**

| Method & path | Auth | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| `POST /api/links/bulk` | **S** | `{ urls: string[] }` (max 100, A-BULK) | `200 { results: [{ input, ok, link?, error?: {code,message} }] }` — **partial success** (AC-31/32) | 401; 413 `BULK_LIMIT_EXCEEDED` (>100, AC-34); 429 |

CSV export is performed client-side from the results payload (FR-26/AC-33); no server CSV endpoint needed.

**Password-gated redirect support**

| Method & path | Auth | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| `POST /api/links/{code}/unlock` | **P** | `{ password }` | `200 { ok:true }` + sets short-lived httpOnly `unlock_{code}` cookie (FR-17, AC-23); the subsequent `GET /:code` then 302s and the click is counted (AC-25) | 401 `WRONG_PASSWORD`; 429 `UNLOCK_LOCKED` (independent limiter, AC-24); 404; 410 |

**Analytics**

| Method & path | Auth | Query | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /api/links/{id}/analytics` | **S** | `?range=7d\|30d\|90d\|all` | `200 { totals:{clicks,uniques}, series:[{day,clicks,uniques}], referrers:[{category,host,clicks}], geo:[{country,city,clicks}], devices:[{type,clicks}], browsers:[{name,clicks}], insufficientData: boolean }` (FR-7; `insufficientData` drives the empty state, FR-11/AC-16) | 401,403,404 |
| `GET /api/analytics/summary` | **S** | `?range=` | `200 { totals, series, topLinks:[{link,clicks}], … }` aggregate across user's links (FR-8/AC-13) | 401 |

> **Guest analytics (FR-10/AC-15):** guest links expose **only** `clickCount` (already on the link resource). There is no analytics endpoint for guest links; the per-link analytics endpoint requires ownership and returns 403 for guest/non-owned links.

**Guest claiming**

| Method & path | Auth | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /api/guest-links/claimable` | **S** | — (reads `guest_id` cookie) | `200 { links:[link] }` still-live guest links for this browser (FR-34) | 401 |
| `POST /api/guest-links/claim` | **S** | `{ ids: string[] }` | `200 { claimed: number }` — sets ownerId, clears guest TTL (AC-42) | 401,403 |

**Auth** — handled by Auth.js at `GET/POST /api/auth/[...nextauth]` (sign-in/out, OAuth callbacks, credentials). Sign-up for email/password: `POST /api/auth/register { email, password, name? }` → `201` (argon2id-hashed; then client signs in). Errors: 409 `EMAIL_TAKEN`, 422.

**Health** — `GET /api/healthz` → `200 { status:"ok", db:bool, redis:bool }` (used by docker-compose healthcheck / QA smoke, AC-52).

**Redirect (root, not /api)**

| Method & path | Auth | Behavior | Status |
| --- | --- | --- | --- |
| `GET /:code` | **P** | cache-first resolve → redirect / password-gate page / dead-link page (§2.2.A) | **302** (active), **200** (password gate / served HTML page), **404** (never existed), **410** (expired/deactivated/max-clicks) |

### 6.3 Error envelope (all `/api/*` non-2xx)
```json
{ "error": { "code": "ALIAS_TAKEN", "message": "That custom link is already in use. Try another or pick a suggestion.", "field": "alias", "suggestions": ["spring-sale-2","spring-sale-go"] } }
```
Canonical `code` values: `VALIDATION_ERROR`(422), `INVALID_URL`(422), `ALIAS_TAKEN`(409), `ALIAS_RESERVED`(422), `URL_BLOCKED`(400), `RATE_LIMITED`(429), `UNLOCK_LOCKED`(429), `WRONG_PASSWORD`(401), `UNAUTHENTICATED`(401), `FORBIDDEN`(403), `NOT_FOUND`(404), `BULK_LIMIT_EXCEEDED`(413), `EMAIL_TAKEN`(409), `INTERNAL`(500). Each maps to friendly UI copy with a recovery path (FR-37, AC-43/44).

---

## 7. Code directory / layout plan

One repository, one Next.js app at the root, plus a worker that shares `lib/`. (The existing empty `backend/` dir is superseded by this root-level layout; engineers should treat the repo root as the app root. See §11 OQ-A.)

```
/                                  # repo root = Next app root
├─ package.json                    # scripts: dev, build, start, worker, test, e2e, lint, db:*
├─ next.config.mjs
├─ tsconfig.json   .eslintrc.cjs   .prettierrc   vitest.config.ts   playwright.config.ts
├─ docker-compose.yml              # web, worker, postgres, redis
├─ Dockerfile                      # multi-stage; one image runs web OR worker by CMD
├─ .env.example                    # ALL env vars documented (no real secrets)
├─ prisma/
│  ├─ schema.prisma                # §5 data model
│  ├─ migrations/                  # checked-in migrations
│  └─ seed.ts                      # demo user + sample links for QA
├─ data/                           # bundled offline assets (provisioned, documented)
│  ├─ GeoLite2-City.mmdb           # provisioned per §10.3 (NFR-11) — gitignored, fetched by script
│  └─ blocklist.txt               # offline phishing/malware hosts (FR-36)
├─ scripts/
│  ├─ validate-pipeline.mjs        # (existing)
│  └─ fetch-geoip.mjs              # documented GeoLite2 provisioning (NFR-11)
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx  globals.css   # theme tokens / providers (FR-41)
│  │  ├─ page.tsx                   # guest hero (A-LANDING)
│  │  ├─ login/  signup/  settings/
│  │  ├─ (dashboard)/dashboard/...  # dashboard, new, bulk, links/[id], links/[id]/analytics, analytics
│  │  ├─ [code]/route.ts            # HOT redirect handler (imports only lib/redirect,cache,events)
│  │  ├─ [code]/gate/page.tsx       # password-gate page (clicker)
│  │  ├─ dead-link/page.tsx         # on-brand 404/410 page (FR-38)
│  │  └─ api/
│  │     ├─ auth/[...nextauth]/route.ts  · auth/register/route.ts
│  │     ├─ links/route.ts (POST,GET) · links/[id]/route.ts (GET,PATCH,DELETE)
│  │     ├─ links/[id]/qr/route.ts · links/[id]/analytics/route.ts
│  │     ├─ links/check-alias/route.ts · links/bulk/route.ts · links/[code]/unlock/route.ts
│  │     ├─ analytics/summary/route.ts
│  │     ├─ guest-links/claimable/route.ts · guest-links/claim/route.ts
│  │     └─ healthz/route.ts
│  ├─ components/                   # UI: forms, link table, charts(+a11y table), QR, toasts, theme toggle
│  │  ├─ ui/                        # Radix-wrapped primitives, tokens
│  │  └─ analytics/                 # chart + accessible-table pairs (NFR-15)
│  ├─ lib/
│  │  ├─ db.ts                      # Prisma client singleton
│  │  ├─ redis.ts                   # ioredis singleton
│  │  ├─ cache.ts                   # redirect cache get/set/invalidate
│  │  ├─ redirect.ts                # pure resolution rules (unit-tested core)
│  │  ├─ events.ts                  # XADD enqueue + stream constants
│  │  ├─ shortcode.ts               # Base62 generate + retry-on-collision (FR-1)
│  │  ├─ alias.ts                   # alias validation + suggestions (FR-2/3/44)
│  │  ├─ reserved.ts                # reserved-word list (single source, §3.1)
│  │  ├─ ratelimit.ts               # token bucket (FR-35/18)
│  │  ├─ ssrf.ts                    # outbound SSRF guard (NFR-6)
│  │  ├─ blocklist.ts               # inbound offline blocklist (FR-36)
│  │  ├─ geo.ts  ua.ts  referrer.ts # enrichment helpers
│  │  ├─ hash.ts                    # argon2 + visitor-key HMAC (NFR-5, A-PII)
│  │  ├─ qr.ts                      # QR PNG generation (FR-12/13)
│  │  ├─ utm.ts                     # UTM assembly + preview (FR-22/23)
│  │  ├─ auth.ts                    # Auth.js config
│  │  └─ validation/                # Zod schemas (shared FE/BE contract)
│  └─ worker/
│     ├─ index.ts                   # boots all consumers + cron
│     ├─ clickConsumer.ts           # Redis Streams consumer group (NFR-3)
│     ├─ scraper.ts                 # SSRF-safe metadata scrape (FR-19)
│     └─ sweep.ts                   # expiry/guest-TTL sweep (NFR-12)
└─ tests/
   ├─ unit/                         # vitest: shortcode, alias, redirect rules, ssrf, ratelimit, utm
   ├─ integration/                  # vitest: route handlers against test DB/Redis
   └─ e2e/                          # playwright: redirect, password gate, dark mode, mobile, a11y
```

**Ownership for parallel work:** Backend owns `prisma/`, `src/lib/**`, `src/worker/**`, `src/app/api/**`, `src/app/[code]/**`, `tests/unit`, `tests/integration`, `docker-compose.yml`, `Dockerfile`, seed/provisioning scripts. Frontend owns `src/app/**` pages/layouts (non-API), `src/components/**`, `globals.css`/tokens. **Shared, backend-authored, frontend-consumed:** `src/lib/validation/**` (Zod) and the §6 contract. The redirect handler is backend-owned but its dead-link/gate **pages** are frontend-styled.

---

## 8. Performance & scale notes

### 8.1 Redirect hot path (the one that matters)
- **Budget:** p95 server processing for a cache hit **< 25 ms** (well under the PRD's ~50 ms ceiling, NFR-2), excluding network. Measured as handler entry → response sent.
- The handler does at most: one Redis `GET` (+ one atomic `INCR` when `maxClicks` is set) + one fire-and-forget `XADD`. **No Postgres, no Prisma, no Auth.js on a cache hit.** Import graph is kept minimal so the route's cold path is light.
- **Cache entries** store the fully-resolved decision (`destination`, `status`, `expiresAt`, `maxClicks`, `hasPassword`) with a TTL (default 1h) and are **explicitly invalidated** on `PATCH`/`DELETE` (FR-21/AC-28). Negative cache for not-found/dead codes (short TTL) prevents repeated DB misses under abuse.
- **XADD** uses a capped stream (`MAXLEN ~ N`) so a worker outage can't grow Redis unbounded; the redirect never blocks on stream backpressure (best-effort enqueue; NFR-3 tolerance).

### 8.2 Analytics ingestion
- Worker batches `XREADGROUP` (e.g. COUNT 100, BLOCK 2s), enriches, bulk-inserts events, and upserts daily rollups in one transaction per batch. Charts read **rollups**, never scan raw events, so dashboard latency is independent of click volume.

### 8.3 Listing & search
- Dashboard list uses keyset/`(ownerId, createdAt)` index + the partial active-link index; `q` search is a prefix/ILIKE on `code`/`destinationUrl`/`metaTitle` (sufficient at single-user scale; documented as the chosen approach, not full-text).

### 8.4 Bulk
- Synchronous, capped at 100 (A-BULK); validates and inserts per row with partial-success accounting; scrape jobs for valid rows are enqueued (not awaited). 100×insert is well within request time at local scale.

---

## 9. Security summary (maps to NFR-5..9)
- argon2id for account + link passwords; no plaintext in storage or logs (AC-45).
- Two distinct URL trust boundaries: inbound blocklist (create) + outbound SSRF guard (scrape) — never merged (PRD §9).
- Per-IP token-bucket rate limiting, with an **independent** unlock limiter + lockout (AC-24/43).
- Hashed/truncated visitor IPs; finite event retention (A-PII).
- Security ceiling per A-SECCEIL: rate-limit + offline blocklist + SSRF only — **no CAPTCHA/WAF/ATO** in this build.
- httpOnly, `SameSite=Lax`, `Secure`-in-prod cookies for session/guest/unlock; CSRF via Auth.js for mutations.

---

## 10. Build, run & test commands (binding for engineers & QA)

> Package manager: **pnpm** (npm works too; commands shown for pnpm). Node 20.

### 10.1 First-time / local dev (no Docker)
```bash
pnpm install
cp -f .env.example .env                 # fill OAuth client IDs OR use email/password only locally
pnpm db:up                              # docker compose up -d postgres redis   (db+cache only)
pnpm prisma migrate dev                 # apply migrations
pnpm db:seed                            # demo user + sample links (QA fixtures)
pnpm fetch:geoip                        # provision GeoLite2-City.mmdb into data/ (see §10.3)
pnpm dev          # Next dev server  → http://localhost:3000   (terminal 1)
pnpm worker:dev   # background worker (tsx watch src/worker)    (terminal 2)
```

### 10.2 Full stack via Docker (the QA gate, AC-52)
```bash
cp -f .env.example .env
pnpm fetch:geoip                        # one-time, documented; data/ is bind-mounted
docker compose up --build               # web + worker + postgres + redis
# migrations + seed run automatically via the web container entrypoint
# → http://localhost:3000 ; GET /api/healthz returns {status:"ok"} when ready
```
No paid API keys are required to boot. OAuth (Google/GitHub) needs free developer client IDs to exercise those buttons; **email/password fully works offline** for QA of all auth-gated flows. This is the documented offline path (NFR-10/11).

### 10.3 GeoIP / blocklist provisioning (NFR-11)
- `data/GeoLite2-City.mmdb`: GeoLite2 requires a **free** MaxMind account/license key. `scripts/fetch-geoip.mjs` downloads it given `MAXMIND_LICENSE_KEY` in `.env`, OR a maintainer drops the file into `data/` manually. The file is git-ignored; the steps are in README + `.env.example`. If absent, geo enrichment degrades gracefully (country/city null) and the app still runs — but AC-12 requires it present, so QA provisions it once.
- `data/blocklist.txt`: a checked-in newline-delimited host list (seeded with known test entries so AC-44 is verifiable offline); extendable.

### 10.4 Quality gates
```bash
pnpm lint            # eslint + prettier check
pnpm typecheck       # tsc --noEmit
pnpm test            # vitest run (unit + integration)
pnpm test:cov        # coverage
pnpm e2e             # playwright (boots app; redirect/password/dark-mode/mobile/a11y)
pnpm build           # next build (must pass for PR)
```
QA runs `pnpm build`, `pnpm test`, then `pnpm e2e` against the docker-compose stack; the smoke path is shorten → redirect (302) → analytics populates (after worker) → QR download → expire → dead-link (410). Tests use a **separate** `DATABASE_URL`/Redis DB index (set in `.env.test`) so they don't clobber dev data.

### 10.5 Environment variables (documented in `.env.example`)
`DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`, `BASE_URL`/`SHORT_DOMAIN`, `VISITOR_IP_PEPPER`, `MAXMIND_LICENSE_KEY` (optional), `RL_SHORTEN_*`, `RL_UNLOCK_*`, `REDIRECT_CACHE_TTL`, `CLICK_RETENTION_DAYS`, `GUEST_TTL_HOURS=24`, `BULK_MAX=100`, `REDIRECT_STATUS=302`.

---

## 11. Assumptions & open questions

**Assumptions adopted from the PRD (confirmed as architecture decisions):** A-STACK (Next+Auth.js), A-REDIR (302 + no-store), A-INGEST (Redis Streams, at-least-once), A-DATASTORE (Postgres + Redis, rollups in primary), A-GEO (bundled GeoLite2 + offline blocklist), A-PII (hashed/truncated IP), A-UNIQUE (cookie-first/IP+UA fallback), A-COL (Base62-6, grow at saturation), A-ALIAS (global, `[A-Za-z0-9_-]`, 3–50, reserved list), A-PWCOUNT (count on successful unlock), A-BULK (registered-only, ≤100, partial success), A-SECCEIL (rate-limit+blocklist+SSRF only), A-DEADLINK (404 never-existed / 410 expired-deactivated-maxclicks).

**New architecture-level assumptions:**
- **A-MONO** — One Next.js app + one worker process from a shared codebase, not split services, to minimize the integration surface for parallel agents (PRD §9). If the team prefers a standalone API service, that is a larger restructure.
- **A-PM** — pnpm as package manager; Vitest + Playwright as test stack; Recharts for charts (frontend may substitute a comparable no-paid-key lib without changing the contract).
- **A-ROLLUP** — Charts read pre-aggregated `ClickRollup` (daily granularity); sub-daily series are out of this build's analytics resolution.
- **A-QR-ONDEMAND** — QR PNGs are generated on demand (cached by CDN-style headers), not stored as blobs.

**Open questions (do not block the build; defaults are in place):**
- **OQ-A (repo layout):** The repo has an empty `backend/` dir from init. This architecture uses a **root-level Next app** (so the redirect path, API, and UI are one deployable). Confirm we abandon the separate `backend/` tree. *Default: yes, root-level app; `backend/` is removed/ignored.*
- **OQ-B (short domain in dev):** `shortUrl` is built from `BASE_URL` (`http://localhost:3000` locally). Confirm there's no separate short domain for this build (PRD §3.2 says single configured domain). *Default: same origin serves both app and short links.*
- **OQ-C (redirect runtime):** Redirect handler runs on the **Node** runtime (needs ioredis). If sub-ms edge latency is later required, a thin edge variant over an HTTP-accessible cache could be added — out of scope now. *Default: Node runtime.*
- Inherited from PRD and still genuinely human decisions: OQ-2 (per-link status configurability + exact cache-control — pinned here to `private,no-store`), OQ-3 (IP hashing acceptable vs raw — assumed acceptable), OQ-6 (GeoLite2 free-license provisioning path — documented in §10.3). These are flagged for the human; the build proceeds on the stated defaults.

---

## 12. Traceability (architecture → PRD)
- Redirect latency/async ingestion: §2.2, §8.1–8.2 ⇐ NFR-1/2/3, A-REDIR/A-INGEST, AC-8/9.
- Complete, stable contract for parallel build: §6 (every FR endpoint present) ⇐ PRD §9 (under-specification = rework).
- Two separate trust boundaries: §4.5, §9 ⇐ FR-19/36, NFR-6, PRD §9.
- Dead-link/password-gate/empty states as first-class: §2.2, §3.2, §6.2, components/analytics ⇐ FR-11/38/39/43, PRD §9.
- Fully local, no paid keys: §10.2–10.3 ⇐ NFR-10/11, AC-52.
```

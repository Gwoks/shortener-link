# PRD: Link Shortener Platform

- **Slug:** `link-shortener`
- **Status:** Draft (design phase)
- **Author:** Product Manager (multi-agent pipeline)
- **Date:** 2026-06-19
- **Downstream consumers:** Architect (`ARCHITECTURE.md`), Journey, Design, Backend, Frontend, QA

---

## 1. Overview & problem statement

Marketers, developers, and everyday users need to turn long, unwieldy URLs into short, memorable, trackable links, and then understand how those links perform. Existing free tools strip away analytics, lock essential capabilities (custom aliases, expiration, QR codes) behind paywalls, or are not self-hostable.

This project delivers a complete, self-hostable URL-shortening platform comparable to **Bitly / Dub.co**: fast cache-fronted redirects, rich link management, a privacy-respecting analytics dashboard, QR codes, a UTM builder, bulk shortening, authenticated accounts, a zero-friction guest mode, and baseline anti-abuse. It ships as **one fully-featured build** (not a trimmed MVP) and must be **fully runnable locally** via `docker-compose` so QA can exercise real flows end-to-end with no paid third-party API keys.

**Two human directives govern this PRD and override default product instincts:**
1. **SCOPE DIRECTIVE — everything is in-scope for this one build.** Do not defer features to a later phase or cut to an MVP subset. The "out of scope" section is deliberately near-empty, and acceptance criteria cover every feature.
2. **STACK DIRECTIVE — the architect recommends and justifies the stack** in `ARCHITECTURE.md`. The redirect hot path must be optimized for low latency (cache in front of the lookup). The whole system must run locally with `docker-compose` for any datastore/cache.

---

## 2. Target users & top user stories

### Personas
- **Guest / anonymous sharer** — wants to shorten a link instantly with zero friction. Links are ephemeral (24h TTL), basic analytics only, no account.
- **Registered individual (power user)** — wants a persistent dashboard, link history, QR codes, custom aliases, expiration/password controls, and per-link analytics.
- **Marketer / growth user** — cares most about analytics depth, the UTM builder, and bulk shortening for campaigns.
- **Clicker / recipient** — never sees the dashboard; only ever encounters redirect-side screens (interstitials, password gate, expired/dead-link page). A first-class, high-traffic persona.
- **Self-hoster / operator** — wants the platform to spin up locally via `docker-compose` and behave like a real, scalable system (cache-fronted redirects, async analytics ingestion, rate limiting, abuse protection).

### Top user stories
1. As a **guest**, I want to paste a long URL and get a short link instantly, so that I can share it without signing up.
2. As a **registered user**, I want a custom back-half (e.g. `/spring-sale`), so that my links are memorable and on-brand.
3. As **anyone with a short link**, I want the redirect to be near-instant, so that clicks never feel slow.
4. As a **marketer**, I want a dashboard showing total clicks, unique visitors, top referrers (categorized), country/city, and device/browser, so that I can measure campaign performance.
5. As a **marketer**, I want to build UTM-tagged URLs and bulk-shorten many links at once, so that I can launch campaigns efficiently.
6. As a **user**, I want to set an expiration date/time and/or a max-click limit and optionally password-protect a link, so that I control its lifetime and access.
7. As a **user**, I want a downloadable QR code for every link and auto-scraped title/description, so that my links are usable offline and self-describing in my history.
8. As a **clicker**, I want a clear, on-brand page when a link is password-protected, expired, or deactivated, so that I understand what happened instead of hitting a raw error.
9. As an **operator**, I want per-IP rate limiting and phishing/malware URL validation, so that the platform is not abused for spam or attacks.
10. As a **new signer-upper**, I want to claim the still-live links I created as a guest in this browser, so that I do not lose work when I create an account.

---

## 3. In-scope vs. out-of-scope

### 3.1 In-scope (the entire feature set — per the SCOPE DIRECTIVE)
All of the following are in-scope for this single build:

- **Core shortening:** 6-character unique hash generation with retry-on-collision; custom aliases sharing the same namespace with reserved-word protection; cache-fronted low-latency redirect (302 default).
- **Analytics:** total clicks, unique visitors, top referrers (categorized: social / direct / search / referral / other), geo (country + city), device + browser; per-link and aggregate views; click events captured **asynchronously off the redirect hot path**.
- **QR codes:** auto-generated, downloadable (PNG minimum; size options), for every link, with accessible text alternative.
- **Link management:** expiration by datetime AND/OR max-click limit (auto-deactivate when either is reached); optional password protection; async destination title/description scraping with SSRF protection.
- **UTM builder:** integrated source / medium / campaign / term / content tagging with live preview of the assembled URL before shortening.
- **Bulk shortening:** multi-URL input (one per line) producing many short links at once, with per-row success/failure reporting and copy/export of results.
- **User system:** authentication supporting **Google, GitHub, and Email/Password** (provider/library chosen by architect — NextAuth/Auth.js is the leading default for local-runnability); user dashboard with link history, active/expired management, and per-link analytics; search/filter/sort/pagination on the link list.
- **Guest mode:** anonymous shortening with 24h TTL and no advanced analytics; an at-creation expiry affordance; guest-link claiming on signup.
- **Security / anti-abuse:** per-IP rate limiting (shorten + password-unlock attempts, keyed independently); URL validation against an offline phishing/malware blocklist; mandatory SSRF protection on the scraper.
- **UI/UX:** modern minimalist dashboard; toggleable dark/light mode built on semantic tokens; WCAG 2.1 AA accessibility; copy-to-clipboard with toast; complete empty/loading/error/zero-data states across both the dashboard and the redirect-side surfaces.
- **Runnable locally:** `docker-compose` provisions every datastore/cache so QA can exercise real flows offline with no paid API keys.

### 3.2 Out-of-scope (deliberately minimal — edges only)
These are explicitly NOT required for this build (feature-gating between guest and registered IS in scope; the items below are not):
- Paid billing / subscription tiers / payment integration (e.g. Stripe).
- Team / organization workspaces, seats, and role-based sharing (single-user accounts only).
- Per-user custom branded domains (the platform runs on one configured domain).
- A documented, versioned **public** developer REST API as a product surface (an internal API exists; a public one is not a requirement).
- Native mobile apps (mobile **web** is in-scope and must be responsive).
- Production cloud deployment / IaC (the bar is "fully runnable locally," not "deployed").

Any of these may be pulled in if the human disagrees; they are recorded so the architect and QA know where the edges are.

---

## 4. Functional requirements

Numbered `FR-n`. Acceptance criteria in §6 trace back to these.

### Core shortening & redirect
- **FR-1** The system SHALL generate a unique 6-character short code (alphabet defined in §Assumptions A-COL) for any submitted valid URL, retrying on collision.
- **FR-2** A registered user SHALL be able to specify a custom alias (back-half). Aliases share the global short-code namespace and SHALL be rejected if taken, reserved, or malformed.
- **FR-3** Custom aliases SHALL be validated against a reserved-word list (e.g. `api`, `login`, `signup`, `logout`, `dashboard`, `admin`, `settings`, `account`, `analytics`, `healthz`, `_next`, `static`, `assets`, `favicon.ico`, `robots.txt`) and an allowed character set, with min/max length bounds (see A-ALIAS).
- **FR-4** A request to a short code SHALL resolve via a cache-first lookup and issue an HTTP redirect (default **302**) to the destination URL. The destination metadata, password, and analytics MUST NOT block the redirect on the hot path beyond the cache lookup.
- **FR-5** URL submissions SHALL be validated for syntactic correctness (scheme `http`/`https`, well-formed host) before a short link is created.

### Analytics
- **FR-6** Every redirect SHALL emit a click event captured **asynchronously** (off the hot path) recording at minimum: timestamp, referrer, user-agent-derived device + browser, and geo (country + city) derived from a locally-bundled GeoIP database.
- **FR-7** A registered user SHALL be able to view per-link analytics: total clicks, unique visitors, clicks over time, top referrers (categorized), geo breakdown (country/city), and device/browser breakdown.
- **FR-8** A registered user SHALL be able to view aggregate analytics across all their links.
- **FR-9** Analytics for a link SHALL remain viewable after the link expires or is deactivated (post-campaign reporting), unless the link is deleted.
- **FR-10** Guest links SHALL expose only basic counts (e.g. total clicks) and SHALL NOT expose the advanced analytics (geo, referrer, device breakdowns).
- **FR-11** Analytics views SHALL render first-class empty / "not enough data yet" states for every chart when a link has zero or insufficient clicks, including a call-to-action to share the link.

### QR codes
- **FR-12** The system SHALL auto-generate a QR code encoding the short link for every link, displayed inline.
- **FR-13** A user SHALL be able to download the QR code (PNG minimum) and select among at least 2 size presets.
- **FR-14** Each QR code SHALL carry an accessible text alternative and the short link SHALL be displayed/copyable beside it for users who cannot scan.

### Link management
- **FR-15** A user SHALL be able to set an expiration datetime, a max-click limit, or both; the link SHALL auto-deactivate when either threshold is reached.
- **FR-16** A user SHALL be able to enable password protection on a link; the password SHALL be stored hashed (never plaintext).
- **FR-17** When a protected link is visited, the system SHALL present a password-gate interstitial; the redirect SHALL proceed only after a correct password. A short-lived unlock session SHALL prevent re-prompting on immediate refresh.
- **FR-18** Password-unlock attempts SHALL be rate-limited independently of the redirect/shorten rate limits to resist brute force, with a lockout/backoff state.
- **FR-19** On link creation, the system SHALL asynchronously fetch the destination page's meta title and description and store them for display in history. The fetch MUST be SSRF-safe (reject private/link-local/loopback/cloud-metadata ranges and DNS-rebinding), redirect-follow-limited, timeout-bounded, and size-bounded; it MUST NOT block link creation.
- **FR-20** A user SHALL be able to edit a link (destination, alias subject to availability, expiration, password) and delete a link.
- **FR-21** When an owner edits or deactivates a link, returning clickers SHALL receive the updated behavior; the redirect cache SHALL be invalidated on edit so stale destinations are not served.

### UTM builder
- **FR-22** The create/edit flow SHALL provide an integrated UTM builder for `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, appended to the destination before shortening.
- **FR-23** The UTM builder SHALL show a live preview of the fully assembled tagged URL before the user commits to shortening.

### Bulk shortening
- **FR-24** A registered user SHALL be able to submit multiple URLs (one per line) and receive short links for the batch.
- **FR-25** Bulk results SHALL be presented as a per-row results table showing per-row success or failure, with invalid/blocked rows clearly flagged and distinguished from successes.
- **FR-26** Bulk results SHALL support copying individual links and copy-all / export (CSV) of the batch.

### User system & dashboard
- **FR-27** The system SHALL support authentication via Google, GitHub, and Email/Password (final library per architect).
- **FR-28** A registered user SHALL have a dashboard listing their links with: short link, destination (monospaced, truncated, full on hover), copy action, click count (with sparkline where feasible), status badge, and a row action menu (edit, QR, analytics, copy, delete).
- **FR-29** The link list SHALL support search, filtering (active / expiring / expired / password-protected), sorting, and pagination (or virtualized scroll) to handle large histories.
- **FR-30** Link status SHALL be communicated by **icon + text label**, not color alone (states: active, expiring soon, expired, deactivated, password-protected, metadata-pending).
- **FR-31** A brand-new registered user with zero links SHALL see a guided empty state with a single primary "create link" call-to-action.

### Guest mode
- **FR-32** A guest (unauthenticated) SHALL be able to shorten a URL and receive a short link with a clearly communicated 24h expiry at the moment of creation.
- **FR-33** Guest links SHALL be marked with a nullable owner and a 24h TTL, after which they auto-deactivate.
- **FR-34** On signup/first-login, if the browser/session has still-live guest links, the system SHALL offer to claim them into the new account via an explicit opt-in prompt; claimed links lose the 24h guest expiry.

### Security & anti-abuse
- **FR-35** The system SHALL apply per-IP rate limiting to link creation (shorten) requests and return a clear, recoverable user-facing message on limit (not a bare 429).
- **FR-36** The system SHALL validate destination URLs at shorten-time against an offline/bundled phishing-malware blocklist and reject matches with a clear explanation that does NOT imply the submitting user is malicious, plus a next step.
- **FR-37** All user-facing error/blocked/rate-limited states (invalid URL, alias taken, blocked URL, wrong password, link expired, rate-limited) SHALL present specific, human-readable messaging with a recovery path.

### Redirect-side / clicker surfaces
- **FR-38** The system SHALL render an on-brand **expired / deactivated / max-clicks-reached** "dead-link" page for clickers (not a raw 404), explaining the link is no longer active.
- **FR-39** The password-gate interstitial SHALL show input, a wrong-password error state, and a lockout/rate-limit feedback state.
- **FR-40** Whether a click on a password-protected link is counted SHALL be defined: a click SHALL be counted only on **successful unlock** (see A-PWCOUNT).

### UI/UX cross-cutting
- **FR-41** The UI SHALL provide a toggleable dark/light mode built on semantic design tokens (not hardcoded inversion); the choice SHALL persist and respect `prefers-color-scheme` on first load.
- **FR-42** Copy-to-clipboard SHALL show an immediate toast ("Link Copied!") AND a button copied-state; on clipboard-permission denial it SHALL fall back to selectable text. The toast SHALL be announced via `aria-live` and SHALL NOT be the sole confirmation channel.
- **FR-43** Every async region (lists, charts, scraped metadata) SHALL show skeleton loaders; metadata-pending rows SHALL show a pending affordance, then filled state, then a scrape-failed fallback (raw URL / no title).
- **FR-44** Custom-alias entry SHALL provide debounced live availability checking with available / taken / invalid affordances and, when taken, suggested alternatives.
- **FR-45** The guest result card and the authenticated dashboard SHALL share design tokens, components, and voice; the guest result card SHALL include the short link, copy button, QR thumbnail, 24h expiry notice, and a non-nagging prompt to sign up to keep the link and unlock analytics.

---

## 5. Non-functional requirements

Numbered `NFR-n`.

### Performance & scale
- **NFR-1** The redirect hot path SHALL resolve via a cache (in-memory/Redis-class) in front of the primary lookup; analytics writes SHALL be off the hot path so the redirect returns before the click event is durably written.
- **NFR-2** Redirect resolution SHALL target low server-side latency under local conditions (target: p95 cache-hit redirect well under ~50 ms server processing, excluding network); the exact budget is the architect's to set and document.
- **NFR-3** Click ingestion SHALL use an async transport (e.g. queue/stream + worker) with at-least-once delivery; minor edge over/under-counting is acceptable in exchange for not adding latency to the redirect (see A-INGEST).
- **NFR-4** Bulk shortening SHALL bound the maximum URLs per submission (see A-BULK) and SHALL behave correctly on mixed-validity batches (accept valid rows, report failures — partial success).

### Security
- **NFR-5** Passwords for password-protected links and Email/Password accounts SHALL be hashed at rest using a modern algorithm (e.g. bcrypt/argon2); no plaintext secrets in storage or logs.
- **NFR-6** The metadata scraper SHALL enforce SSRF protections (deny private/link-local/loopback/cloud-metadata IP ranges and DNS rebinding), redirect-follow limits, and timeout/size bounds.
- **NFR-7** Rate limiting SHALL be enforced per IP for shorten requests and independently for password-unlock attempts.
- **NFR-8** The anti-abuse ceiling for this build is: per-IP rate limiting + offline blocklist URL validation + mandatory SSRF protection on the scraper. CAPTCHA, WAF, and account-takeover protection are NOT required unless the human adds them.
- **NFR-9** Visitor analytics SHALL handle IP data per the privacy stance in A-PII (default: store a hashed/truncated IP, not raw, for unique-visitor counting and abuse keying) — pending human confirmation (OQ-3).

### Reliability & operability
- **NFR-10** The entire system (app, database, cache, queue, worker) SHALL start from a single `docker-compose up` with no paid API keys, and QA SHALL be able to exercise every in-scope flow locally and offline.
- **NFR-11** The GeoIP database and phishing/malware blocklist SHALL be provisioned into the local stack in a documented, reproducible way (see A-GEO); if any dependency requires a free license/account to obtain, the provisioning steps SHALL be documented so QA can run offline.
- **NFR-12** Auto-deactivation of expired / max-clicks-reached / guest-TTL links SHALL be enforced reliably (on read and/or via a background sweep) so a stale link is never followed after its threshold.

### Accessibility & UX quality
- **NFR-13** The UI SHALL meet WCAG 2.1 AA contrast (4.5:1 text, 3:1 large text and UI/graphic boundaries) in **both** light and dark themes.
- **NFR-14** All interactive elements SHALL have visible non-color focus indicators; row action menus, modals (focus trap + Escape), the datetime picker, and the create/UTM form SHALL be fully keyboard operable.
- **NFR-15** Charts SHALL NOT rely on color alone; each chart SHALL be paired with an accessible data summary or table equivalent.
- **NFR-16** All motion (skeleton shimmer, transitions) SHALL respect `prefers-reduced-motion`.
- **NFR-17** The dashboard and analytics SHALL be responsive: long URLs/short codes/UTM strings SHALL truncate predictably (monospace, hover for full) and SHALL never cause horizontal page scroll on mobile; the link table SHALL degrade to stacked cards on small viewports.

---

## 6. Acceptance criteria

Concrete, testable, numbered. These are exactly what QA will verify. Each maps to one or more FR/NFR.

### Core shortening & redirect
- **AC-1** Submitting a valid long URL returns a short link whose code is exactly 6 characters from the defined alphabet. (FR-1)
- **AC-2** Two different submissions never receive the same short code; a forced collision is resolved by retry and still yields a unique code. (FR-1)
- **AC-3** A registered user can create a link with custom alias `my-custom-name` and `/<domain>/my-custom-name` redirects to the destination. (FR-2)
- **AC-4** Attempting a custom alias that already exists is rejected with an "alias taken" message and (in UI) suggested alternatives. (FR-2, FR-44)
- **AC-5** Attempting a reserved alias (e.g. `admin`, `api`, `login`) is rejected and does not shadow any application route. (FR-3)
- **AC-6** Visiting a valid short code returns an HTTP 302 (default) with a `Location` header equal to the destination URL. (FR-4)
- **AC-7** Submitting a malformed URL (e.g. `not-a-url`, `javascript:alert(1)`) is rejected with a specific validation error and no link is created. (FR-5)
- **AC-8** A cache-hit redirect resolves within the architect-documented server-side latency budget and does not perform a synchronous analytics write before responding. (NFR-1, NFR-2, NFR-3)

### Analytics
- **AC-9** After N redirects of a link, the link's analytics show total clicks = N (allowing for documented async at-least-once edge behavior). (FR-6, NFR-3)
- **AC-10** Per-link analytics display unique visitors, clicks-over-time, categorized top referrers, geo (country/city), and device/browser, with values consistent with the simulated traffic. (FR-7)
- **AC-11** Referrers are categorized (e.g. a `facebook.com` referrer appears under "social"; no `Referer` header appears under "direct"). (FR-7)
- **AC-12** Geo is derived from the local GeoIP DB (a known test IP resolves to its expected country) with no outbound paid-API call. (FR-6, NFR-11)
- **AC-13** Aggregate analytics across all of a user's links are viewable and sum correctly. (FR-8)
- **AC-14** A link's analytics remain viewable after it expires/deactivates; deleting the link removes them. (FR-9)
- **AC-15** A guest link exposes only basic click count and does NOT expose geo/referrer/device breakdowns. (FR-10)
- **AC-16** A newly created link with zero clicks shows an explicit "not enough data yet / share this link" empty state on every analytics chart, not a broken/blank chart. (FR-11)

### QR codes
- **AC-17** Every created link has an inline QR code that, when scanned, resolves to the short link. (FR-12)
- **AC-18** The QR code can be downloaded as a PNG and offers at least two size presets. (FR-13)
- **AC-19** The QR code has a non-empty accessible text alternative and the short link is copyable beside it. (FR-14)

### Link management
- **AC-20** A link with an expiration datetime in the past (or reached) no longer redirects; the clicker sees the on-brand dead-link page. (FR-15, FR-38)
- **AC-21** A link with a max-click limit of K stops redirecting after the (K+1)th attempt and shows the dead-link page. (FR-15, FR-38)
- **AC-22** A password-protected link shows the password gate; a wrong password shows an error and does not redirect; a correct password redirects to the destination. (FR-16, FR-17, FR-39)
- **AC-23** An immediate refresh after a correct password does not re-prompt (unlock session honored). (FR-17)
- **AC-24** Repeated wrong-password attempts trigger an independent lockout/backoff state distinct from the shorten rate limit. (FR-18, NFR-7)
- **AC-25** A click on a password-protected link is counted only after a successful unlock, not on a failed/abandoned attempt. (FR-40)
- **AC-26** After creating a link, the destination's meta title/description appear in history shortly after (pending → filled), and a destination with no metadata or that is unreachable shows the scrape-failed fallback rather than a broken row. (FR-19, FR-43)
- **AC-27** The scraper refuses to fetch a destination resolving to a private/loopback/link-local/cloud-metadata address (SSRF blocked) and the link is still created. (FR-19, NFR-6)
- **AC-28** Editing a link's destination causes a subsequent visit to redirect to the new destination (cache invalidated, no stale redirect). (FR-20, FR-21)
- **AC-29** Deleting a link makes its short code return the not-found/dead-link page and removes it from the dashboard. (FR-20)

### UTM builder
- **AC-30** Using the UTM builder appends the chosen `utm_*` parameters to the destination, and the live preview reflects the assembled URL before shortening; the shortened link redirects to the tagged URL. (FR-22, FR-23)

### Bulk shortening
- **AC-31** Submitting multiple URLs (one per line) returns a results table with one row per input. (FR-24, FR-25)
- **AC-32** In a mixed batch (valid + invalid + blocked), valid rows succeed with short links while invalid/blocked rows are flagged with per-row reasons; the whole batch is not rejected. (FR-25, NFR-4)
- **AC-33** Bulk results allow copying an individual link and copy-all / CSV export of the batch. (FR-26)
- **AC-34** A bulk submission exceeding the configured max URL count is rejected/limited with a clear message. (NFR-4)

### Auth & dashboard
- **AC-35** A user can sign up / sign in via Google, GitHub, and Email/Password, and lands on their dashboard. (FR-27)
- **AC-36** The dashboard link list shows short link, truncated monospaced destination (full on hover), copy action, click count, status badge, and a working row action menu (edit, QR, analytics, copy, delete). (FR-28)
- **AC-37** The link list supports searching, filtering by status (active/expiring/expired/password-protected), sorting, and pagination over a large set of links. (FR-29)
- **AC-38** Every status is shown with an icon + text label (verifiable with color disabled / grayscale). (FR-30, NFR-15)
- **AC-39** A brand-new registered user with no links sees a guided empty state with a single create call-to-action. (FR-31)

### Guest mode
- **AC-40** A guest can shorten a URL without authenticating and the result card states the link expires in 24h. (FR-32, FR-45)
- **AC-41** A guest link is no longer active after its 24h TTL and the clicker sees the dead-link page. (FR-33, FR-38)
- **AC-42** On signup, a user with still-live guest links from the same browser/session is offered an explicit prompt to claim them; claimed links appear in the dashboard and no longer carry the 24h expiry. (FR-34)

### Security & anti-abuse
- **AC-43** Exceeding the per-IP shorten rate limit returns a clear, recoverable message (not a bare 429) explaining the limit and next step. (FR-35, FR-37)
- **AC-44** Submitting a URL matching the bundled phishing/malware blocklist is rejected with an explanation that does not imply the user is malicious, plus a next step. (FR-36, FR-37)
- **AC-45** No plaintext password (account or link) is ever stored or logged; stored values are hashed. (NFR-5)

### UI/UX & accessibility
- **AC-46** Toggling dark/light mode switches the whole UI via tokens, persists across reloads, and respects `prefers-color-scheme` on first visit; contrast meets WCAG 2.1 AA in both themes (text 4.5:1, large/UI 3:1). (FR-41, NFR-13)
- **AC-47** Clicking a copy button copies the link, shows a "Link Copied!" toast announced to assistive tech, sets a button copied-state, and falls back to selectable text if clipboard permission is denied. (FR-42)
- **AC-48** All interactive controls show a visible focus indicator; row menus, modals (focus trap + Escape), datetime picker, and the create/UTM form are fully keyboard operable. (NFR-14)
- **AC-49** Each analytics chart has an accessible data summary or table equivalent (analytics are not vision-only). (NFR-15)
- **AC-50** All skeleton/transition motion is suppressed under `prefers-reduced-motion`. (NFR-16)
- **AC-51** On a mobile viewport, the link table renders as stacked cards, long URLs truncate, and the page never scrolls horizontally. (NFR-17)

### Local runnability (QA gate)
- **AC-52** `docker-compose up` (after documented setup) brings up app + datastore + cache + queue/worker with no paid API keys, and a smoke run of shorten → redirect → analytics → QR → expire works end-to-end offline. (NFR-10, NFR-11)

---

## 7. Assumptions log

Every assumption below was made because a question was unanswered and is needed for downstream work to proceed. Assumptions tagged for human confirmation also appear in §8.

- **A-STACK** — The architect picks the web framework on its own merits (per STACK DIRECTIVE). NextAuth/Auth.js is the **leading default** for auth (self-hosted, no paid key, runs offline) over Clerk (hosted SaaS, conflicts with "fully local"). Framework choice precedes the auth-library choice. (OQ-1)
- **A-REDIR** — Default redirect status is **302** (non-cached) to preserve analytics accuracy; a permanent 301 would silently undercount. Per-link configurability of the status is a nice-to-have, not required, for this build. (OQ-2)
- **A-INGEST** — Click ingestion is **async, at-least-once** via a self-hosted broker + worker; minor edge over/under-count is acceptable in exchange for hot-path latency. (OQ documented; decided in favor of async.)
- **A-DATASTORE** — Default topology is **one relational primary (Postgres-class) + Redis-class cache/queue**, with analytics stored as raw events plus periodic/async rollups in the same primary, to keep the local container count minimal. Architect may revise. (OQ-5)
- **A-GEO** — Geo enrichment uses a **locally-bundled GeoIP DB** (e.g. MaxMind GeoLite2) and phishing/malware checks use an **offline/bundled blocklist** — no paid online APIs. Provisioning of any free-license DB into the image is documented so QA runs offline. (OQ-6)
- **A-PII** — Default privacy stance: store a **hashed/truncated visitor IP** (not raw) for unique-visitor counting and abuse keying, with a finite retention window for click events. Needs human confirmation as it affects abuse handling. (OQ-3)
- **A-UNIQUE** — "Unique visitor" is defined as a **cookie-first, IP+User-Agent-hash fallback** heuristic (approximate, not forensic). Same key basis used for guest rate-limiting. (OQ-4)
- **A-COL** — The 6-char hash uses a fixed URL-safe alphabet (recommend Base62 `[A-Za-z0-9]`, or Base58 to avoid ambiguous chars — architect's call) generated **random-and-check** with retry-on-collision. 6 chars is the default; length MAY grow if the keyspace saturates (architect documents the policy). (OQ — hash length at scale.)
- **A-ALIAS** — Custom aliases: case-insensitive matching, allowed set `[A-Za-z0-9-_]`, length ~3–50 chars, **global** uniqueness scope (shared namespace with generated codes), reserved-word list per FR-3. Architect/PRD may extend the reserved list. (OQ — alias rules.)
- **A-PWCOUNT** — A click on a password-protected link is counted **only after successful unlock** (failed/abandoned attempts do not count). (Decided per FR-40; flagged for confirmation in OQ-7.)
- **A-GUESTCLAIM** — Guests CAN claim still-live links into a new account on signup (explicit opt-in); claimed links lose the 24h TTL. Expired guest links are not recoverable. (OQ — guest claiming; decided yes.)
- **A-BULK** — Bulk shortening is **registered-only**, runs synchronously for reasonable batch sizes, with a max of **100 URLs per submission** (architect may tune), and uses **partial-success** semantics (accept valid, report failures). (OQ — bulk limits.)
- **A-SECCEIL** — Anti-abuse ceiling is per-IP rate limiting + offline blocklist + mandatory scraper SSRF protection; **no CAPTCHA/WAF/ATO** protection in this build. (OQ — security ceiling; decided.)
- **A-DEADLINK** — Expired/deactivated/max-clicks/not-found short codes render an **on-brand dead-link page** (HTTP 410 for expired/deactivated, 404 for never-existed — architect's choice on exact codes), not a redirect to homepage. (OQ — clicker dead-link UX; decided in favor of branded page.)
- **A-THEME-DEFAULT** — First-visit theme follows **`prefers-color-scheme`**, with an explicit persisted toggle thereafter. (OQ — designer's default-theme question; decided.)
- **A-BRAND** — Design has latitude to define product name/wordmark and a single restrained accent color (blue/indigo class) since no existing brand was supplied. Needs human confirmation if a brand exists. (OQ-8)
- **A-NAV** — Authenticated app uses a **persistent left-nav shell** (scales as features grow) wrapping a dense-but-breathable content area; links view is **table-first** with stacked-card mobile fallback. (Designer open question; decided for scalability — design may revisit visually.)
- **A-GEOVIZ** — Geo analytics may ship as a **country/city list** (with optional simple map) rather than a full interactive map; lightweight charts (line/area for clicks, bars/donuts for device) are sufficient. (Designer open question; decided to bound complexity.)
- **A-I18N** — UI is **English-only** for this build (no RTL/localization requirement), though token/layout choices should not actively preclude it. (Designer open question; decided.)
- **A-LANDING** — The guest entry is a **focused single-purpose hero** (paste → shorten → result card), not a full marketing site. (Designer open question; decided to keep scope tight on the marketing surface.)

---

## 8. Open questions for the human

Genuinely need a human/architect decision; downstream agents proceed on the assumptions above until told otherwise.

- **OQ-1 (Stack/auth — for architect):** Confirm the architect is free to pick the web framework on its merits, with NextAuth/Auth.js as the auth default over the hosted Clerk for local-runnability. If Clerk is required despite the "fully local, no API key" constraint, flag as an early blocker.
- **OQ-2 (Redirect default):** Confirm **302** (accurate tracking) as the default over 301 (SEO, but browser-cached/undercounts). Should the status be per-link configurable, and what cache-control policy should be pinned?
- **OQ-3 (Visitor-IP privacy/PII):** Is GDPR-style IP **hashing/truncation** acceptable for stored analytics (A-PII), or must **raw IPs** be retained for abuse handling? Sets what we persist and the retention window.
- **OQ-4 (Unique-visitor definition):** Confirm the cookie-first / IP+UA-hash-fallback heuristic (A-UNIQUE) for both analytics and guest rate-limit keying.
- **OQ-5 (Datastore topology):** Confirm one relational primary + Redis-class cache/queue with rollups in the primary (A-DATASTORE), or specify a separate analytical store.
- **OQ-6 (Geo + threat data sources):** Confirm locally-bundled GeoLite2 + offline phishing/malware blocklist satisfy the requirement under "runs locally" (A-GEO). If a hosted API (e.g. Google Safe Browsing) is mandatory, it becomes a blocker. Also confirm how the GeoLite2 DB (free license/account) is provisioned into the image.
- **OQ-7 (Password-protected click counting):** Confirm a click counts **only after successful unlock** (A-PWCOUNT).
- **OQ-8 (Brand identity — for design):** Is there an existing product name, logo, or brand accent color to honor, or does design define it from scratch (A-BRAND)? Any accent-hue preference (blue / indigo / violet)?

---

## 9. Traceability note for downstream agents

- The breadth of this build (~7 advanced feature areas + auth + analytics + security + accessible UI in one non-MVP pass) is the dominant delivery risk. The **architect must produce a complete, stable API contract** so backend, frontend, and QA can build in parallel without integration churn. Under-specification at the architecture stage turns breadth into rework.
- Two trust boundaries are **separate, both mandatory**: (1) the inbound phishing/malware check at shorten-time (FR-36) and (2) the outbound SSRF-safe scraper (FR-19, NFR-6). Do not conflate them into a single "URL validation."
- The analytics-fidelity-vs-redirect-latency tension is resolved deliberately: **cache-fronted 302 redirect + async at-least-once click ingestion** (NFR-1/3, A-REDIR, A-INGEST).
- Clicker-facing surfaces (dead-link page, password gate) and complete empty/loading/error/zero-data states are **first-class requirements**, not afterthoughts — historically where self-hosted clones ship broken-looking screens.

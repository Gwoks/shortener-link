# User Journey: Link Shortener Platform

- **Slug:** `link-shortener`
- **Status:** Draft (design phase)
- **Author:** UX Researcher (multi-agent pipeline)
- **Date:** 2026-06-19
- **Source of truth:** `docs/features/link-shortener/PRD.md` (FR/NFR/AC referenced inline as `FR-n` / `NFR-n` / `AC-n`)
- **Downstream consumers:** Design (`DESIGN.md`), Frontend, QA; cross-checked by Architect

> Scope note: per the PRD SCOPE DIRECTIVE, **all** feature areas below are in-scope for one build. This document describes the experience and screen-state matrix the Design and Frontend agents must realize, and that QA will exercise end-to-end. It does not choose visual style (Design owns that) or technology (Architect owns that).

---

## 1. Primary personas

Condensed from PRD §2. Each persona is tagged with the surfaces they touch, because the surface — not the feature list — drives the journey design.

| Persona | Core goal | Auth state | Surfaces they touch | What "success" feels like |
|---|---|---|---|---|
| **Guest / anonymous sharer** | Shorten one URL instantly, share it | Unauthenticated | Landing hero, guest result card, redirect-side pages | A short link + copy confirmation in seconds, no signup wall |
| **Registered individual (power user)** | Persistent links + control (alias, expiry, password, QR) + per-link analytics | Authenticated | Full dashboard, create/edit flow, analytics, QR, settings | "My links live somewhere I trust and I can see how they do" |
| **Marketer / growth user** | Campaign analytics depth, UTM builder, bulk shortening | Authenticated | Dashboard, UTM builder, bulk tool, aggregate + per-link analytics, CSV export | "I launched a campaign's worth of tagged links and can prove performance" |
| **Clicker / recipient** | Reach the destination behind a short link | Never authenticated (in this product) | **Redirect-only**: instant 302, password gate, dead-link page, scan-target of QR | The redirect is invisible; or, if blocked, a clear human explanation |
| **Self-hoster / operator** | Run the whole thing locally and have it behave like a real system | N/A (runs it) | `docker-compose`, the running app as a black box, abuse/rate-limit behavior | "`docker-compose up` and every flow works offline, no paid keys" (`AC-52`) |

**Design tension to respect throughout:** the **Clicker** is the highest-traffic persona and never sees the dashboard. Their three screens (instant redirect, password gate, dead-link page) are first-class, not error fallbacks (PRD §9). The **Guest** and **Registered** experiences must share tokens, components, and voice (`FR-45`) so the guest card feels like a doorway into the product, not a different product.

---

## 2. Navigation & information architecture

### 2.1 Two top-level zones

The product splits into two experiences that share a design system but almost never share a screen:

```
┌────────────────────────────────────────────────────────────────────┐
│  PUBLIC / CREATOR ZONE                  CLICKER ZONE (redirect-side) │
│  ───────────────────────                ─────────────────────────── │
│  /                Landing hero          /:code        302 redirect   │
│  /signin /signup  Auth                  /:code (pwd)   Password gate  │
│  /app             Dashboard (shell)     /:code (dead)  Dead-link page │
│    ├ Links (default)                                                  │
│    ├ Create / Edit (modal or route)     [No nav chrome in this zone. │
│    ├ Bulk shorten                         A clicker only ever sees    │
│    ├ Analytics (aggregate)                one screen at a time.]      │
│    ├ Per-link analytics                                               │
│    └ Settings (theme, account)                                       │
└────────────────────────────────────────────────────────────────────┘
```

### 2.2 Authenticated shell (PRD `A-NAV`)

- **Persistent left-nav shell** wrapping a dense-but-breathable content area. Chosen for scalability as feature areas grow; Design may revisit the visual treatment but the IA is shell-based.
- Primary nav items: **Links** (default landing), **Analytics** (aggregate), **Create** (primary action, also a global affordance), **Bulk**, **Settings**.
- The **Links** view is **table-first**, degrading to **stacked cards** on small viewports (`NFR-17`, `AC-51`).
- A persistent, always-reachable **"Create link"** primary action (top of nav / floating affordance) — the most common task should never be more than one click away.
- Account menu (avatar) exposes theme toggle (also in Settings), sign-out.

### 2.3 Route ↔ short-code namespace collision (critical IA constraint)

Short codes and app routes **share one path namespace** (`/:code` sits at the root). Therefore the reserved-word list (`FR-3`: `api`, `login`, `signup`, `logout`, `dashboard`, `admin`, `settings`, `analytics`, `healthz`, `_next`, `static`, `assets`, `favicon.ico`, `robots.txt`, …) is an **IA boundary**, not just validation. The custom-alias UX (`FR-44`, §4.3 below) is the user-facing edge of this constraint: a user picking `dashboard` as an alias must be told it's reserved, not handed a link that shadows the app.

### 2.4 Entry-point map

| Entry point | Lands persona on | Leads to |
|---|---|---|
| Root URL `/` | Guest landing hero | Guest result card → optional signup |
| Short link `/:code` (the product in the wild) | Clicker redirect / gate / dead-link | The destination (or an explanation) |
| `/signin`, `/signup`, OAuth callback | Auth | Dashboard; possibly the **guest-claim prompt** (§3.6) |
| Deep link to `/app/...` while logged out | Auth, then return to intended view | Intended dashboard view |
| QR scan | Same as short link `/:code` | The destination |

---

## 3. Key end-to-end journeys

Each journey lists **entry point → steps → success/exit states**, and the **edge/alt paths** that branch off it. Screen-state details (empty/loading/error/success) are consolidated in §4.

### Journey A — Guest shortens a link (zero friction)

**Persona:** Guest. **Entry:** Root `/`. **Stories:** PRD §2 #1. **Covers:** `FR-32`, `FR-33`, `FR-45`, `AC-40`.

1. Guest lands on the **focused single-purpose hero** (`A-LANDING`): one prominent URL input + "Shorten" button, minimal marketing.
2. Guest pastes a long URL and submits.
3. **Loading:** button enters in-progress state; input locked.
4. **Success:** a **guest result card** appears in place, sharing dashboard tokens/components (`FR-45`), containing: the short link, a **copy button**, a **QR thumbnail**, an explicit **"expires in 24h"** notice (`AC-40`), and a **non-nagging** "sign up to keep this link + unlock analytics" prompt.
5. Guest clicks **copy** → toast "Link Copied!" + button copied-state (`FR-42`).

**Success/exit states:**
- **Shared and gone:** guest copies link and leaves. Link works for 24h (`FR-33`).
- **Converts:** guest follows the signup prompt → Journey F, with the just-created link eligible for claiming (§3.6).

**Edge / alt paths:**
- **Invalid URL** (`not-a-url`, `javascript:alert(1)`): inline validation error, no link created (`FR-5`, `AC-7`).
- **Blocked URL** (phishing/malware blocklist): rejection message that does **not** imply the guest is malicious, with a next step (`FR-36`, `AC-44`).
- **Rate-limited** (per-IP shorten limit): clear, recoverable message explaining the limit and next step — never a bare 429 (`FR-35`, `AC-43`).
- **Wants to set expiry as a guest:** an at-creation expiry affordance is exposed even in guest mode (PRD §3.1 "an at-creation expiry affordance").

---

### Journey B — Clicker follows a short link (the invisible hot path)

**Persona:** Clicker. **Entry:** `/:code` (pasted link, QR scan, anywhere the link traveled). **Stories:** PRD §2 #3, #8. **Covers:** `FR-4`, `FR-38`, `FR-39`, `FR-40`, `NFR-1/2`.

This is the **highest-traffic journey** and is mostly *no screen at all* — the win condition is that the clicker never perceives the platform.

1. Clicker requests `/:code`.
2. System resolves via **cache-first lookup** and the **happy path** issues a **302 redirect** to the destination — no interstitial, no analytics write blocking the response (`FR-4`, `NFR-1`, `AC-6`, `AC-8`).

**Success/exit states:**
- **Redirected (default):** clicker lands on the destination; a click event is captured asynchronously (`FR-6`).

**Branch paths (each is a real, on-brand screen, not a raw error):**

- **B1 — Password-protected link** (`FR-17`, `FR-39`, `AC-22/23/24/25`):
  1. Instead of redirecting, show the **password-gate interstitial**: input + submit, on-brand.
  2. **Correct password →** redirect to destination; a short-lived **unlock session** prevents re-prompting on immediate refresh (`AC-23`). **Click counts only on successful unlock** (`FR-40`, `AC-25`).
  3. **Wrong password →** inline error, no redirect.
  4. **Repeated wrong attempts →** independent **lockout/backoff** state (distinct from shorten rate limit), with feedback (`FR-18`, `AC-24`).

- **B2 — Dead link** (expired / deactivated / max-clicks-reached) (`FR-15`, `FR-38`, `AC-20/21/41`):
  - Show an **on-brand dead-link page** explaining the link is no longer active — never a raw 404 or a silent bounce to the homepage (`A-DEADLINK`). Applies to datetime-expired, max-clicks-reached, owner-deactivated, and 24h-TTL-expired guest links.

- **B3 — Never existed / deleted** (`FR-29` delete, `AC-29`):
  - Show the not-found variant of the dead-link surface (Architect chooses 404 vs 410 codes per `A-DEADLINK`); offer a path to the product's own landing/create.

- **B4 — Owner edited the destination just before this click** (`FR-21`, `AC-28`):
  - Clicker receives the **updated** behavior; the redirect cache was invalidated on edit, so no stale destination is served.

---

### Journey C — Registered user creates a controlled link

**Persona:** Registered / Power user. **Entry:** Dashboard "Create link". **Stories:** PRD §2 #2, #6, #7. **Covers:** `FR-1`/`2`/`3`, `FR-15`/`16`/`19`, `FR-22`/`23`, `FR-44`, `FR-12`–`14`.

1. User opens the **create flow** (modal or route) from the persistent Create affordance.
2. Enters the destination URL (validated, `FR-5`).
3. **Optional — custom alias:** as the user types, **debounced live availability check** shows **available / taken / invalid / reserved** affordances; when taken, **suggested alternatives** appear (`FR-44`, `AC-4`). Reserved words are rejected with explanation (`FR-3`, `AC-5`).
4. **Optional — UTM builder:** expands inline; user fills `utm_source/medium/campaign/term/content`; a **live preview** of the fully assembled tagged URL updates before commit (`FR-22/23`, `AC-30`).
5. **Optional — controls:** expiration **datetime** and/or **max-click limit** (`FR-15`); **password protection** toggle (`FR-16`).
6. User submits.
7. **Success:** the new link appears — short link, **inline QR code** (downloadable PNG, ≥2 size presets, with text alternative — `FR-12/13/14`), copy action. The destination's **meta title/description scrape** kicks off **asynchronously**: the row shows a **metadata-pending** affordance, then fills, then (if needed) a **scrape-failed fallback** (raw URL / no title) (`FR-19`, `FR-43`, `AC-26`).

**Success/exit states:**
- **Created → managing:** link is in the user's list; user proceeds to copy/share, view QR, or view analytics.

**Edge / alt paths:**
- **Alias taken / reserved / malformed** → handled live in step 3 (`AC-4/5`).
- **Blocked destination** (phishing/malware) → rejected with non-accusatory message + next step (`FR-36`, `AC-44`).
- **Scraper hits an SSRF target** (destination resolves to private/loopback/link-local/cloud-metadata): scrape is refused, **but the link is still created** (`FR-19`, `NFR-6`, `AC-27`); row shows scrape-failed fallback.
- **Rate-limited** on shorten → recoverable message (`AC-43`).
- **Collision** on generated code → resolved by retry, invisible to user (`FR-1`, `AC-2`).

---

### Journey D — Marketer runs a campaign (UTM + bulk + analytics)

**Persona:** Marketer. **Entry:** Dashboard → Bulk / Create / Analytics. **Stories:** PRD §2 #4, #5. **Covers:** `FR-24`–`26`, `FR-7`/`8`, `FR-22/23`, `AC-31`–`34`, `AC-10/11/13`.

1. **Build tagged links:** marketer uses the **UTM builder** (Journey C step 4) to assemble campaign-tagged destinations with live preview.
2. **Bulk shorten:** opens the **bulk tool**, pastes **multiple URLs (one per line)** (registered-only, `A-BULK`, max 100), submits.
3. **Loading:** batch processes (synchronously for reasonable sizes per `A-BULK`).
4. **Per-row results table:** one row per input, each flagged **success or failure**; invalid/blocked rows show **per-row reasons**, clearly distinguished from successes — the whole batch is **not** rejected on partial failure (`FR-25`, `NFR-4`, `AC-31/32`).
5. **Export:** copy an individual link, **copy-all**, or **CSV export** the batch (`FR-26`, `AC-33`).
6. **Measure (per-link):** opens per-link analytics — total clicks, unique visitors, **clicks-over-time**, **categorized top referrers** (social/direct/search/referral/other), **geo** (country/city), **device/browser** (`FR-7`, `AC-10/11`). Referrer categorization is explicit (e.g. `facebook.com` → "social"; no `Referer` → "direct") (`AC-11`).
7. **Measure (aggregate):** opens aggregate analytics across all their links; values **sum correctly** (`FR-8`, `AC-13`).

**Success/exit states:**
- **Campaign launched + reportable:** a batch of tagged short links exists, exported for distribution, with dashboards that prove performance.
- **Post-campaign:** analytics **remain viewable after links expire/deactivate** (`FR-9`, `AC-14`) — the marketer can still report after the campaign ends.

**Edge / alt paths:**
- **Batch exceeds max (100)** → rejected/limited with a clear message (`NFR-4`, `AC-34`).
- **Mixed-validity batch** → partial success (step 4).
- **Zero/insufficient clicks** on a fresh campaign link → every chart shows a **"not enough data yet / share this link"** empty state with a share CTA, never a broken/blank chart (`FR-11`, `AC-16`).
- **Geo viz scope:** geo may render as a **country/city list** (optional simple map) rather than a full interactive map (`A-GEOVIZ`).

---

### Journey E — Registered user manages existing links

**Persona:** Registered / Power user. **Entry:** Dashboard → Links (default view). **Stories:** PRD §2 #6. **Covers:** `FR-20`/`21`, `FR-28`–`31`, `AC-28/29`, `AC-36/37/38/39`.

1. User lands on the **Links table**: each row shows short link, **destination** (monospaced, truncated, full on hover), copy action, **click count** (sparkline where feasible), **status badge**, and a **row action menu** (edit, QR, analytics, copy, delete) (`FR-28`, `AC-36`).
2. User **searches / filters / sorts / paginates** over a large history; filters include active / expiring soon / expired / password-protected (`FR-29`, `AC-37`).
3. **Status** is read at a glance via **icon + text label, never color alone** — states: active, expiring soon, expired, deactivated, password-protected, metadata-pending (`FR-30`, `NFR-15`, `AC-38`).
4. **Edit:** user changes destination, alias (subject to live availability), expiration, or password (`FR-20`). On save, the **redirect cache is invalidated** so subsequent visits get the new destination — no stale redirect (`FR-21`, `AC-28`).
5. **Delete:** removes the link from the dashboard; its short code now returns the not-found/dead-link page (`FR-20`, `AC-29`).

**Success/exit states:**
- **Maintained:** link list reflects the user's intent; edits propagate to clickers immediately; deleted links are gone everywhere.

**Edge / alt paths:**
- **Editing an alias to one that's taken/reserved** → same live-availability affordances as creation (`FR-44`).
- **Large history** → pagination or virtualized scroll keeps the table usable (`FR-29`).
- **Metadata still pending** for a recently created row → pending affordance persists until filled or failed (`FR-43`).

---

### Journey F — Sign up / sign in, then claim guest links

**Persona:** New signer-upper (often a converted Guest). **Entry:** `/signup`, `/signin`, or OAuth. **Stories:** PRD §2 #10. **Covers:** `FR-27`, `FR-34`, `AC-35`, `AC-42`.

1. User authenticates via **Google, GitHub, or Email/Password** (`FR-27`, `AC-35`).
2. On first login / signup, if the **same browser/session has still-live guest links**, present an **explicit opt-in claim prompt** (`FR-34`, `AC-42`).
3. **User accepts:** claimed links appear in the dashboard and **lose the 24h guest expiry**.
4. **User declines:** guest links keep their 24h TTL and are not added.
5. User lands on the **dashboard**.

**Success/exit states:**
- **Onboarded, work preserved:** the converting guest keeps the link they just made (no lost work).
- **Brand-new with nothing:** a zero-links user sees a **guided empty state** with a single primary "create link" CTA (`FR-31`, `AC-39`).

**Edge / alt paths:**
- **No live guest links in this browser** → no claim prompt; straight to dashboard (or empty state).
- **Expired guest links** → not recoverable; not offered (`A-GUESTCLAIM`).
- **OAuth callback while a deep link was intended** → return user to the intended `/app/...` view after auth.

---

### Journey G — Theme, accessibility, and feedback (cross-cutting)

**Personas:** All authenticated; portions apply to clicker/guest surfaces too. **Covers:** `FR-41`, `FR-42`, `FR-43`, `NFR-13`–`17`, `AC-46`–`51`.

- **Dark/light theme:** first visit follows `prefers-color-scheme` (`A-THEME-DEFAULT`); an explicit toggle persists across reloads; switching re-themes the **whole UI via semantic tokens** (not hardcoded inversion); contrast meets **WCAG 2.1 AA** in **both** themes (`FR-41`, `NFR-13`, `AC-46`).
- **Copy feedback:** copy → "Link Copied!" toast **announced via `aria-live`** + button copied-state; on clipboard-permission denial, **fall back to selectable text**; the toast is never the sole confirmation (`FR-42`, `AC-47`).
- **Async/loading everywhere:** lists, charts, and scraped metadata show **skeleton loaders**; metadata progresses pending → filled → scrape-failed fallback (`FR-43`, `AC-26`).
- **Reduced motion:** all skeleton shimmer and transitions are suppressed under `prefers-reduced-motion` (`NFR-16`, `AC-50`).

---

## 4. Per-screen state matrix

For each screen: **empty / loading / error / success**, plus **notable edge cases**. This is the checklist Design must cover and QA will verify. (PRD §9: complete empty/loading/error/zero-data states are first-class.)

### 4.1 Landing hero (guest entry)

| State | Behavior |
|---|---|
| **Empty / default** | Single URL input + "Shorten" CTA; restrained marketing (`A-LANDING`). Optional at-creation expiry affordance. |
| **Loading** | CTA in-progress; input locked. |
| **Error** | Invalid URL (`AC-7`), blocked URL (non-accusatory, `AC-44`), rate-limited (recoverable, `AC-43`) — inline, link not created. |
| **Success** | Guest result card replaces/augments the hero (see 4.2). |
| **Edge** | Returning guest with theme already chosen; very long pasted URL truncates predictably and never causes horizontal scroll (`NFR-17`). |

### 4.2 Guest result card

| State | Behavior |
|---|---|
| **Success (its reason for existing)** | Short link, copy button, QR thumbnail, explicit **24h expiry notice** (`AC-40`), non-nagging signup prompt; shares tokens/components/voice with the dashboard (`FR-45`). |
| **Loading** | QR thumbnail may render after the link (skeleton). |
| **Error** | Copy permission denied → selectable-text fallback (`AC-47`). |
| **Edge** | Guest creates several links in a session → each is claimable later (Journey F). |

### 4.3 Create / Edit link flow

| State | Behavior |
|---|---|
| **Empty / default** | Destination field focused; optional sections (alias, UTM, expiry, password) collapsed. |
| **Loading** | Submit in-progress; **alias availability** check is its own debounced async affordance. |
| **Error** | Invalid URL (`AC-7`); alias **taken / reserved / invalid** with **suggested alternatives** (`AC-4/5`, `FR-44`); blocked destination (`AC-44`); rate-limited (`AC-43`). |
| **Success** | Link created; inline QR; UTM live-preview reflected; metadata begins as pending. |
| **Edge** | SSRF-target destination → link created, scrape refused (`AC-27`); collision retried invisibly (`AC-2`); editing alias re-runs availability; **editing destination invalidates redirect cache** (`AC-28`). |

### 4.4 Custom-alias field (sub-component, called out because it sits on the IA boundary)

| State | Behavior |
|---|---|
| **Empty** | Placeholder; no claim about availability. |
| **Checking** | Debounced "checking…" affordance. |
| **Available** | Positive affordance (icon + text, not color-only). |
| **Taken** | "Alias taken" + suggested alternatives (`FR-44`, `AC-4`). |
| **Reserved** | Rejected: reserved word, cannot shadow an app route (`FR-3`, `AC-5`). |
| **Invalid** | Out-of-charset or out-of-length (`A-ALIAS`: `[A-Za-z0-9-_]`, ~3–50, case-insensitive). |

### 4.5 Dashboard — Links table

| State | Behavior |
|---|---|
| **Empty (zero links)** | Guided empty state, single primary "create link" CTA (`AC-39`). |
| **Loading** | Skeleton rows (`FR-43`). |
| **Error** | List load failure → retry affordance with human message. |
| **Success** | Rows: short link, monospaced truncated destination (full on hover), copy, click count + sparkline, **icon+text status badge**, row action menu (edit/QR/analytics/copy/delete) (`AC-36`). Search/filter/sort/paginate over large sets (`AC-37`). |
| **Edge** | **Status states**: active, expiring soon, expired, deactivated, password-protected, **metadata-pending** — each icon+text, verifiable in grayscale (`AC-38`). Mobile → stacked cards, no horizontal scroll (`AC-51`). Metadata row: pending → filled → scrape-failed fallback (`AC-26`). |

### 4.6 Per-link & aggregate analytics

| State | Behavior |
|---|---|
| **Empty / zero data** | Every chart shows **"not enough data yet / share this link"** with a share CTA — never blank/broken (`FR-11`, `AC-16`). |
| **Loading** | Chart skeletons (`FR-43`). |
| **Error** | Data fetch failure → retry + message. |
| **Success** | Per-link: total clicks, unique visitors, clicks-over-time, categorized referrers, geo (country/city list, optional map), device/browser (`AC-10/11`). Aggregate sums correctly (`AC-13`). Each chart paired with an **accessible data summary / table equivalent** (`NFR-15`, `AC-49`); charts never rely on color alone. |
| **Edge** | **Expired/deactivated link still shows analytics** (`AC-14`); **guest link shows only basic count**, no geo/referrer/device (`FR-10`, `AC-15`); deleting a link removes its analytics (`AC-14`). |

### 4.7 QR code (inline + download)

| State | Behavior |
|---|---|
| **Loading** | QR may render slightly after the link (skeleton/placeholder). |
| **Success** | Inline QR encoding the short link; **download PNG**, **≥2 size presets** (`AC-18`); **non-empty text alternative**; short link copyable beside it for those who can't scan (`FR-14`, `AC-19`). |
| **Edge** | Reduced-motion respected on any reveal animation (`AC-50`). |

### 4.8 Bulk shortening

| State | Behavior |
|---|---|
| **Empty / default** | Multi-line textarea (one URL per line); max count stated (`A-BULK`, 100). |
| **Loading** | Batch processing indicator. |
| **Error (whole-batch)** | Over the max count → clear limit message (`AC-34`). |
| **Success / partial** | Per-row results table: each row success or failure; invalid/blocked rows flagged with reasons, distinct from successes; batch not rejected on partial failure (`AC-31/32`). Copy individual / copy-all / **CSV export** (`AC-33`). |
| **Edge** | Mixed-validity batch is the **expected** case, not an error (`NFR-4`). |

### 4.9 Auth (sign in / sign up)

| State | Behavior |
|---|---|
| **Empty / default** | Google, GitHub, Email/Password options (`AC-35`). |
| **Loading** | Provider/credential in-progress. |
| **Error** | Failed credentials / OAuth error → human-readable message + retry. |
| **Success** | Land on dashboard; possibly the **guest-claim prompt** (4.10). |
| **Edge** | Deep-link-then-auth returns to intended view. |

### 4.10 Guest-claim prompt

| State | Behavior |
|---|---|
| **Shown** | Only when same browser/session has **still-live** guest links (`AC-42`). Explicit opt-in. |
| **Accept** | Links join dashboard, lose 24h TTL. |
| **Decline** | Guest links keep TTL; not added. |
| **Edge** | No live guest links → prompt suppressed; expired guest links not offered (`A-GUESTCLAIM`). |

### 4.11 Redirect-side: password gate (clicker)

| State | Behavior |
|---|---|
| **Default** | On-brand interstitial: password input + submit (`FR-17`, `FR-39`). |
| **Error (wrong password)** | Inline error; no redirect (`AC-22`). |
| **Locked out** | Independent lockout/backoff feedback (distinct from shorten rate limit) after repeated failures (`AC-24`). |
| **Success** | Redirect to destination; **unlock session** prevents re-prompt on immediate refresh (`AC-23`); **click counts only here** (`AC-25`). |
| **Edge** | Owner changed/removed the password between attempts → current behavior honored. |

### 4.12 Redirect-side: dead-link & not-found (clicker)

| State | Behavior |
|---|---|
| **Dead link** | On-brand page for expired / deactivated / max-clicks-reached / 24h-guest-expired (`AC-20/21/41`); explains the link is no longer active (`A-DEADLINK`). |
| **Not found / deleted** | Not-found variant for never-existed or deleted codes (`AC-29`); Architect sets 404 vs 410 (`A-DEADLINK`). |
| **Edge** | Offer a path back to the product's own landing/create — never a silent bounce or raw error. |

### 4.13 Settings

| State | Behavior |
|---|---|
| **Default** | Theme toggle (persisted, `AC-46`), account controls, sign-out. |
| **Edge** | Theme also reachable from the account menu; choice persists across reloads and respects `prefers-color-scheme` on first load. |

---

## 5. Accessibility considerations

Mapped to `NFR-13`–`17` and `AC-46`–`51`. These are acceptance-tested, so they are requirements, not aspirations.

- **Contrast (`NFR-13`, `AC-46`):** WCAG 2.1 AA in **both** light and dark themes — 4.5:1 text, 3:1 large text and UI/graphic boundaries. Built on **semantic tokens** so both themes are covered by construction, not hand-tuned per element.
- **Keyboard operability (`NFR-14`, `AC-48`):** every interactive control has a **visible, non-color focus indicator**. Fully keyboard-operable: **row action menus**, **modals** (focus trap + Escape to close), the **datetime picker**, and the **create/UTM form**. Focus order follows reading order; opening a modal moves focus in, closing returns it to the trigger.
- **Status not by color alone (`FR-30`, `NFR-15`, `AC-38`):** link status is **icon + text label**; verifiable with color disabled / grayscale.
- **Charts not vision-only (`NFR-15`, `AC-49`):** every analytics chart is paired with an **accessible data summary or table equivalent**; charts never encode meaning in color alone.
- **Copy feedback announced (`FR-42`, `AC-47`):** the "Link Copied!" toast is announced via **`aria-live`** and is **never the sole** confirmation channel (button copied-state also changes); clipboard-denial falls back to selectable text.
- **Reduced motion (`NFR-16`, `AC-50`):** skeleton shimmer and transitions suppressed under `prefers-reduced-motion`.
- **Responsive without loss (`NFR-17`, `AC-51`):** long URLs/codes/UTM strings truncate predictably (monospace, hover for full); the link table degrades to **stacked cards** on small viewports; **no horizontal page scroll** on mobile.
- **Semantics:** QR codes carry a **non-empty text alternative** (`FR-14`, `AC-19`); the short link is always available as copyable text beside any scan-only affordance. Redirect-side pages (password gate, dead-link) are real, semantic, navigable pages — not bare error bodies.
- **Forms & errors:** every user-facing error/blocked/rate-limited state (invalid URL, alias taken, blocked URL, wrong password, link expired, rate-limited) is **specific, human-readable, with a recovery path** (`FR-37`); error text is programmatically associated with its field.

---

## 6. Assumptions

Inherited from PRD §7 where they shape the experience; UX-specific assumptions added below.

**Inherited (UX-relevant):**
- **`A-NAV`** — Authenticated app is a **persistent left-nav shell**; links view is **table-first** with stacked-card mobile fallback.
- **`A-LANDING`** — Guest entry is a **focused single-purpose hero**, not a marketing site.
- **`A-GEOVIZ`** — Geo analytics may be a **country/city list** (optional simple map); charts are lightweight (line/area for clicks, bars/donuts for device).
- **`A-DEADLINK`** — Expired/deactivated/max-clicks/not-found render an **on-brand dead-link page**, not a homepage bounce.
- **`A-THEME-DEFAULT`** — First-visit theme follows `prefers-color-scheme`, explicit persisted toggle thereafter.
- **`A-PWCOUNT`** — A click on a password-protected link counts **only after successful unlock**.
- **`A-GUESTCLAIM`** — Guests can claim **still-live** links on signup (opt-in); claimed links lose the 24h TTL; expired ones are unrecoverable.
- **`A-BRAND`** — Design defines product name/wordmark and a single restrained accent (blue/indigo class) absent a supplied brand (pending human confirmation, OQ-8).
- **`A-I18N`** — UI is **English-only** for this build (no RTL/localization), though tokens/layout shouldn't preclude it later.
- **`A-ALIAS`** — Alias rules drive the alias-field UX: `[A-Za-z0-9-_]`, ~3–50 chars, case-insensitive, global namespace, reserved words rejected.

**UX-specific (this document):**
- **UXA-1** — The **create flow is a modal** by default (keeps the user in the Links context), with a route fallback for deep-linking/refresh. Design may choose a dedicated route instead; either way the modal a11y requirements (`AC-48`) apply.
- **UXA-2** — The guest result card is rendered **in-place on the landing hero** (no navigation), reinforcing "zero friction" (`FR-32`).
- **UXA-3** — Filters in the Links view (`active / expiring / expired / password-protected`) are presented as **toggleable chips/segments**, combinable with search and sort (`FR-29`); "expiring soon" threshold is an Architect/Design parameter.
- **UXA-4** — The signup-conversion prompt on the guest card and the guest-claim prompt post-auth are **two distinct moments** of the same conversion arc; both must read as helpful, not nagging (`FR-45`, `FR-34`).
- **UXA-5** — Sparkline on each link row is **best-effort** ("where feasible", `FR-28`); its absence must not break the row layout, and click-count text remains the source of truth.

---

## 7. Open questions

Carried from PRD §8 where they affect the experience, plus UX-level questions for Design/Architect. Downstream agents proceed on the assumptions above until a human decides.

**Carried from PRD (UX-affecting):**
- **OQ-8 (Brand identity):** Existing product name/logo/accent to honor, or does Design define from scratch? Any accent-hue preference (blue / indigo / violet)? Blocks final visual identity of every shared surface.
- **OQ-3 (Visitor-IP privacy):** Hashed/truncated vs raw IP affects what, if anything, analytics can ever surface about a visitor and the framing of any privacy copy.
- **OQ-2 (Redirect default 302):** Affects whether any per-link "redirect type" control appears in the create/edit UI.

**UX-level (new):**
- **UXOQ-1 (Create surface):** Modal vs dedicated route for create/edit (UXA-1) — affects deep-linking, browser-back behavior, and mobile ergonomics. Recommendation: modal with route fallback.
- **UXOQ-2 ("Expiring soon" threshold):** What window defines the "expiring soon" status/filter (e.g. <24h, <7d)? Needed for the status badge and Links filter (`FR-30`, `FR-29`).
- **UXOQ-3 (Guest expiry affordance depth):** PRD §3.1 mentions an at-creation expiry affordance for guests, while advanced controls are registered-only. Confirm the guest affordance is **display-only / simple** (e.g. acknowledging the fixed 24h) vs an actual shorter-TTL picker.
- **UXOQ-4 (Bulk UTM interplay):** Can the UTM builder apply to a **whole bulk batch** at once, or is UTM per-single-link only? Affects the bulk tool's UI complexity (`FR-22` vs `FR-24`).
- **UXOQ-5 (Empty-state share CTA target):** On zero-data analytics, the "share this link" CTA — does it open copy/QR inline, or deep-link to the link's row? Recommendation: inline copy + QR to keep the user in context (`AC-16`).

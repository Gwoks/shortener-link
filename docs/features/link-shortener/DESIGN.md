# DESIGN: Link Shortener Platform

- **Slug:** `link-shortener`
- **Status:** Draft (design phase)
- **Author:** Designer (multi-agent pipeline)
- **Date:** 2026-06-19
- **Upstream:** `PRD.md`
- **Downstream consumers:** Architect (`ARCHITECTURE.md`), Frontend, Backend (for clicker-surface markup), QA (visual/a11y acceptance)
- **Working product name (placeholder):** **Tess** — a short, neutral wordmark used throughout this doc. Final name pending human confirmation (PRD A-BRAND / OQ-8). Swapping the name must touch only the wordmark token and a few strings, never layout.

> **How to read this doc.** It defines the *design system* (principles, tokens, components, accessibility) once, then specifies *every key screen* as a textual wireframe that maps to the PRD's FRs/ACs. Frontend builds components from §4 and assembles screens from §5. Tokens in §2 are the single source of truth — no hardcoded colors, spacing, or type sizes in components. Where the PRD already decided a design question (A-NAV, A-GEOVIZ, A-THEME-DEFAULT, A-LANDING, A-I18N, A-BRAND), this doc honors that decision and notes it.

---

## 1. Design principles & aesthetic direction

### 1.1 Aesthetic direction
**Calm, dense-but-breathable, utilitarian-modern.** The reference points are Dub.co, Linear, Vercel, and Stripe Dashboard: a near-neutral grayscale canvas, a single restrained accent (indigo), generous whitespace around dense data, crisp 1px hairline borders instead of heavy shadows, and typography doing most of the hierarchy work. The product should feel like a precise instrument, not a marketing site — confident, quiet, and fast.

Three words: **precise, quiet, trustworthy.**

### 1.2 Principles
1. **Hierarchy through type, space, and weight — not chrome.** Prefer a heavier/larger label and more whitespace over boxes, dividers, and drop shadows. Borders are hairlines; shadows are reserved for genuinely floating layers (menus, modals, toasts).
2. **The link table is the product.** The authenticated experience is a data tool. The link list must stay scannable at 100+ rows: monospaced codes/destinations, tabular-figure click counts, status as icon+label, quiet row actions that surface on hover/focus.
3. **Never color alone.** Every status, every chart series, every success/error carries a non-color signal (icon, text label, shape, pattern, or paired data table). This is a hard rule from NFR-15/FR-30/AC-38, not a nicety.
4. **Every async surface has four states.** Empty, loading (skeleton), error/failed, and zero-data are designed first-class for *every* list, chart, and scraped field — never an afterthought (FR-11, FR-43, AC-16, AC-26). The PRD calls broken zero-states the historical failure mode of self-hosted clones; we design them on purpose.
5. **Guest and dashboard are one design language.** The guest result card and the authenticated UI share tokens, components, and voice (FR-45). A guest should feel they've used a slice of the real product.
6. **Clicker surfaces are first-class, on-brand, and reassuring.** Dead-link, password-gate, and interstitial pages are designed with the same care as the dashboard, and their copy never blames or alarms the visitor (FR-37, FR-38, FR-39, AC-44).
7. **Motion is a quiet affordance, fully suppressible.** Transitions are short (≤200ms), purposeful, and entirely removed under `prefers-reduced-motion` (NFR-16, AC-50).
8. **Accessible by construction.** WCAG 2.1 AA in *both* themes, visible non-color focus on everything interactive, keyboard-operable menus/modals/pickers, and an accessible equivalent for every chart (NFR-13/14/15, AC-46/48/49).

### 1.3 Voice & microcopy
- **Plain, specific, recovery-oriented.** Errors say what happened and the next step. "That alias is taken — try `spring-sale-2` or pick another." Not "Error 409."
- **Never blame the user.** A blocklist hit reads: "We can't shorten this link — our safety checks flagged the destination. If you believe this is a mistake, try a different URL or contact the operator." (FR-36, AC-44.)
- **Non-nagging upsell.** The guest sign-up prompt is a single quiet line, dismissible, never a modal wall (FR-45).
- **Sentence case** everywhere (buttons, headings, labels). No ALL-CAPS except the monospaced short-code display is unchanged; small overline labels may use uppercase tracking as a *style*, not for content.

---

## 2. Design tokens

All tokens are **semantic** and theme-aware (FR-41/NFR-13). Components reference semantic tokens (`--color-bg-surface`, `--color-text-primary`), never raw palette values. Two themes resolve the same semantic names. First visit follows `prefers-color-scheme`; an explicit toggle persists thereafter (A-THEME-DEFAULT, AC-46).

### 2.1 Color — primitive palette (raw scales)

Neutral is a slightly cool gray (the canvas). Accent is indigo (PRD A-BRAND blue/indigo class). Plus semantic hues for success/warning/danger/info.

```
/* Neutral (cool gray) */
--gray-0:   #ffffff
--gray-25:  #fbfcfd
--gray-50:  #f6f8fa
--gray-100: #eceff3
--gray-200: #dfe3e9
--gray-300: #cbd2db
--gray-400: #9aa4b2
--gray-500: #6b7686
--gray-600: #4d5765
--gray-700: #363f4d
--gray-800: #222a36
--gray-850: #1a212b
--gray-900: #131820
--gray-950: #0c1016

/* Accent — Indigo */
--indigo-50:  #eef1ff
--indigo-100: #e0e5ff
--indigo-200: #c6cdff
--indigo-300: #a3acff
--indigo-400: #7d87fb
--indigo-500: #5b63f0   /* primary accent (light) */
--indigo-600: #4a50d8   /* primary hover (light) */
--indigo-700: #3b40b0
--indigo-400-dark: #8b93ff  /* accent on dark (lifted for contrast) */

/* Success — Green */
--green-50:#e9f9f0  --green-100:#cdf0dd  --green-500:#16a34a  --green-600:#15803d  --green-400-dark:#4ade80

/* Warning — Amber */
--amber-50:#fdf4e3  --amber-100:#fbe7bf  --amber-500:#d97706  --amber-600:#b45309  --amber-400-dark:#fbbf24

/* Danger — Red */
--red-50:#fdecec  --red-100:#fbd5d5  --red-500:#dc2626  --red-600:#b91c1c  --red-400-dark:#f87171

/* Info — Sky (used sparingly; distinct from indigo accent) */
--sky-50:#e8f4fd  --sky-100:#cce7fb  --sky-500:#0284c7  --sky-600:#0369a1  --sky-400-dark:#38bdf8
```

### 2.2 Color — semantic tokens (light / dark)

| Semantic token | Light | Dark | Use |
|---|---|---|---|
| `--bg-canvas` | `--gray-50` | `--gray-950` | App background behind surfaces |
| `--bg-surface` | `--gray-0` | `--gray-900` | Cards, table, nav, modals |
| `--bg-surface-raised` | `--gray-0` | `--gray-850` | Menus, popovers, toasts (float above surface) |
| `--bg-subtle` | `--gray-50` | `--gray-850` | Table header, input wells, hover rows |
| `--bg-hover` | `--gray-100` | `--gray-800` | Row/list hover |
| `--bg-active` | `--gray-200` | `--gray-700` | Pressed / selected |
| `--border-default` | `--gray-200` | `--gray-700` | Hairline borders, dividers |
| `--border-strong` | `--gray-300` | `--gray-600` | Input borders, emphasized edges |
| `--text-primary` | `--gray-900` | `--gray-50` | Headings, primary body |
| `--text-secondary` | `--gray-600` | `--gray-300` | Secondary/body, labels |
| `--text-tertiary` | `--gray-500` | `--gray-400` | Meta, placeholders, captions |
| `--text-on-accent` | `--gray-0` | `--gray-950` | Text on filled accent button |
| `--accent` | `--indigo-500` | `--indigo-400-dark` | Primary actions, links, focus ring, active nav |
| `--accent-hover` | `--indigo-600` | `--indigo-300` | Hover for accent |
| `--accent-subtle-bg` | `--indigo-50` | `rgba(139,147,255,.14)` | Selected nav bg, accent chips |
| `--focus-ring` | `--indigo-500` | `--indigo-400-dark` | 2px focus outline (see §6) |
| `--success-fg` / `--success-bg` | `--green-600` / `--green-50` | `--green-400-dark` / `rgba(74,222,128,.14)` | Active status, success toast |
| `--warning-fg` / `--warning-bg` | `--amber-600` / `--amber-50` | `--amber-400-dark` / `rgba(251,191,36,.14)` | Expiring-soon status, warnings |
| `--danger-fg` / `--danger-bg` | `--red-600` / `--red-50` | `--red-400-dark` / `rgba(248,113,113,.14)` | Expired/deactivated, destructive, errors |
| `--info-fg` / `--info-bg` | `--sky-600` / `--sky-50` | `--sky-400-dark` / `rgba(56,189,248,.14)` | Info notices, metadata-pending |
| `--lock-fg` / `--lock-bg` | `--gray-700` / `--gray-100` | `--gray-200` / `--gray-800` | Password-protected status (neutral, not alarming) |
| `--overlay-scrim` | `rgba(12,16,22,.45)` | `rgba(0,0,0,.6)` | Modal backdrop |

**Contrast (verified targets, NFR-13/AC-46):** `--text-primary` on `--bg-surface` ≥ 13:1 both themes; `--text-secondary` on `--bg-surface` ≥ 5.6:1; `--text-tertiary` on `--bg-surface` ≥ 4.5:1 (never used for essential text smaller than 16px below that ratio); `--text-on-accent` on `--accent` ≥ 4.6:1 both themes; all status `*-fg` on their `*-bg` ≥ 4.5:1; borders and UI-component boundaries ≥ 3:1 against adjacent fill. Status `*-fg` colors are the **text/icon** color (high-contrast); the soft `*-bg` is the chip fill — the pair is the deliverable.

### 2.3 Chart palette (categorical, color-blind-aware)

Charts must not rely on color alone (NFR-15). This 6-color ramp is distinguishable under deuteranopia/protanopia; series are *also* differentiated by direct labels, legend text, and dash/fill patterns, and every chart ships an accessible table/summary.

```
--chart-1: #5b63f0  (indigo)      --chart-2: #0ea5e9  (sky)
--chart-3: #14b8a6  (teal)        --chart-4: #f59e0b  (amber)
--chart-5: #ec4899  (pink)        --chart-6: #8b5cf6  (violet)
--chart-grid:  var(--border-default)
--chart-axis:  var(--text-tertiary)
```
On dark, each chart hue is lifted ~10–15% in lightness (e.g. indigo→`#7d87fb`) to hold ≥3:1 against `--bg-surface`.

### 2.4 Typography

**Families (system stacks — no font CDN, supports offline/local-run, NFR-10):**
```
--font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--font-mono: ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code", Menlo, Consolas, monospace;
```
Sans for all UI/body; **mono for every short code, destination URL, alias, UTM string, and code-like value** (PRD FR-28 monospaced destination; aids truncation legibility, NFR-17). If the build later vendors a font (e.g. Inter) it must be self-hosted, not CDN.

**Type scale (1.20 modular, rem @ 16px root):**

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `--text-display` | 40px / 1.1 | 700 | Guest hero headline only |
| `--text-h1` | 30px / 1.2 | 700 | Page titles (rare in-app) |
| `--text-h2` | 24px / 1.25 | 600 | Section / dashboard heading |
| `--text-h3` | 20px / 1.3 | 600 | Card titles, modal titles |
| `--text-h4` | 16px / 1.4 | 600 | Sub-section, table group labels |
| `--text-body` | 15px / 1.5 | 400 | Default body |
| `--text-body-sm` | 13px / 1.45 | 400 | Secondary text, table cells, helper text |
| `--text-caption` | 12px / 1.4 | 500 | Meta, timestamps, axis labels |
| `--text-overline` | 11px / 1.3 | 600, +0.04em, uppercase | Small section labels, stat captions |
| `--text-mono` | 13px / 1.5 | 450 | Codes, URLs (uses `--font-mono`, `font-variant-numeric: tabular-nums`) |
| `--text-mono-lg` | 18px / 1.4 | 500 | The big short-code on result cards |

Numeric columns (click counts, analytics) use `font-variant-numeric: tabular-nums` for vertical alignment.

### 2.5 Spacing scale (4px base)

```
--space-0:0  --space-1:4px  --space-2:8px  --space-3:12px  --space-4:16px
--space-5:20px  --space-6:24px  --space-8:32px  --space-10:40px  --space-12:48px
--space-16:64px  --space-20:80px  --space-24:96px
```
Component internal padding standard: inputs/buttons `--space-3` vertical / `--space-4` horizontal; cards `--space-6`; table cells `--space-3` vertical / `--space-4` horizontal. Section rhythm in content area: `--space-8`.

### 2.6 Radii

```
--radius-xs: 4px    (chips, small inputs, sparkline)
--radius-sm: 6px    (buttons, inputs, menu items)
--radius-md: 10px   (cards, table container, modals, popovers)
--radius-lg: 14px   (large feature cards, guest result card, hero panel)
--radius-pill: 9999px (status badges, filter pills, toggle)
--radius-full: 50%  (avatars, icon buttons)
```

### 2.7 Shadows / elevation

Shadows only for layers that truly float; surfaces rely on hairline borders. Dark theme reduces shadow opacity and adds a faint top inner highlight on raised layers.

```
--shadow-xs: 0 1px 2px rgba(16,24,40,.05)
--shadow-sm: 0 1px 3px rgba(16,24,40,.08), 0 1px 2px rgba(16,24,40,.04)
--shadow-md: 0 4px 12px rgba(16,24,40,.10), 0 2px 4px rgba(16,24,40,.06)   /* menus, popovers */
--shadow-lg: 0 12px 32px rgba(16,24,40,.16), 0 4px 8px rgba(16,24,40,.06)  /* modals */
--shadow-focus: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--focus-ring)   /* focus ring offset */
/* dark: same geometry, rgba(0,0,0,.4–.6) */
```

### 2.8 Motion & z-index

```
--ease-standard: cubic-bezier(.2,0,0,1)
--ease-emphasized: cubic-bezier(.2,0,0,1)
--dur-fast: 120ms   --dur-base: 180ms   --dur-slow: 240ms
/* Under prefers-reduced-motion: all durations -> 0ms; shimmer replaced by a static pulse-free skeleton; no slide/scale, only instant state swap. (NFR-16, AC-50) */

--z-base:0  --z-sticky:100 (table header, app header)  --z-nav:200
--z-dropdown:1000  --z-popover:1100  --z-modal:1200  --z-toast:1300  --z-tooltip:1400
```

### 2.9 Layout tokens

```
--app-sidebar-w: 248px        --app-sidebar-w-collapsed: 64px
--app-header-h: 56px
--content-max-w: 1200px       --content-pad-x: clamp(16px, 4vw, 32px)
--guest-hero-max-w: 640px
--bp-sm: 640px  --bp-md: 768px  --bp-lg: 1024px  --bp-xl: 1280px
/* Breakpoint behavior summarized in §5.0 and §6. */
```

---

## 3. Recommended UI stack / component approach

**Recommendation (the architect owns final framework choice per STACK DIRECTIVE; this is the design-side recommendation and rationale):**

- **Component library: shadcn/ui** (Radix UI primitives + Tailwind), as the default if the architect selects a React/Next.js stack (the PRD's NextAuth/Auth.js lean strongly implies React/Next).
- **Styling: Tailwind CSS** with the semantic tokens in §2 wired as CSS custom properties and exposed as Tailwind theme colors (`bg-surface`, `text-secondary`, etc.). Dark mode via `class` strategy on `<html>` (`.dark`), driven by the theme toggle + `prefers-color-scheme`.
- **Primitives: Radix UI** (via shadcn) for the *hard* accessibility: Dialog (focus trap + Escape + scroll lock), DropdownMenu (roving focus, type-ahead), Popover, Tabs, Toast, Tooltip, Switch, Select, Checkbox, RadioGroup. This directly satisfies NFR-14/AC-48 without re-implementing focus management.
- **Charts: Recharts** (or visx if more control is wanted) — small, composable, themeable from tokens. Each chart wrapped in our own `<Chart>` shell that renders the visual *and* a visually-hidden/expandable data table (NFR-15/AC-49).
- **Icons: lucide-react** — consistent 1.5px-stroke line icons; ships the lock/clock/check/alert glyphs we need for icon+label statuses (FR-30).
- **QR generation: a local library** (e.g. `qrcode` for PNG/dataURL, or `qr-code-styling`); generated client- or server-side with no external service (offline, NFR-10/FR-12). Final lib is the architect's call; design only requires PNG export, ≥2 size presets, and a text alternative (FR-13/14).
- **Toasts: Radix Toast or sonner**, configured to announce via `aria-live=polite` (FR-42/AC-47).

**Rationale.** shadcn/ui is copy-in (not a heavyweight dependency), trivially themed by CSS variables (perfect for our dark/light semantic-token requirement), and built on Radix — which is the most reliable path to the PRD's strict keyboard/focus/modal a11y bar. Everything here runs fully locally with no paid keys (NFR-10). If the architect picks a non-React stack, the *tokens, component inventory, states, and layouts in this doc are framework-agnostic* and should be honored; only the library names change. The non-negotiables regardless of stack: Radix-equivalent focus management, token-driven theming, and the chart-with-table pattern.

---

## 4. Component inventory

Each component lists variants and **all interactive/async states**. States are a contract for Frontend and a checklist for QA. Every interactive component has the focus state from §6.

### 4.1 Buttons
- **Variants:** `primary` (filled accent), `secondary` (surface + `--border-strong`), `ghost` (text only, hover bg), `danger` (filled red, for destructive confirm), `link` (inline accent text).
- **Sizes:** `sm` (28px h), `md` (36px h, default), `lg` (44px h, hero/CTA).
- **States:** default, hover, active/pressed, focus-visible (ring), disabled (`--text-tertiary` on `--bg-subtle`, no shadow, cursor not-allowed), **loading** (spinner replaces leading icon, label retained, width preserved, `aria-busy`), **copied** (success transient state for copy buttons — checkmark + "Copied", reverts after 1.6s; see 4.3).
- **Icon buttons:** square, `--radius-sm`, always have `aria-label`; used for row actions trigger, theme toggle, modal close.

### 4.2 Inputs & forms
- **Text input:** label (always present, may be visually-hidden where context is obvious), optional helper text, optional leading/trailing adornment (e.g. domain prefix `tess.link/` as a static adornment before the alias field). States: default, focus (ring + `--accent` border), filled, **error** (`--danger-fg` border + message + `aria-invalid` + `aria-describedby`), success (subtle green border + check, used by alias availability), disabled, readonly.
- **Textarea:** bulk URL entry (monospace, line-numbered gutter optional), auto-grow to a max height then scroll; shows live "N URLs / max 100" counter (A-BULK).
- **Select / dropdown:** Radix Select; same state set; keyboard type-ahead.
- **Checkbox & radio:** Radix; visible focus; checked uses `--accent`; never color-only (check/dot glyph).
- **Switch/toggle:** for password-protection enable, theme toggle, redirect-options; labeled, `role=switch`, on=`--accent`.
- **Datetime picker (expiration):** popover calendar + time fields; **fully keyboard operable** (arrow-key date grid, typeable time), respects locale-neutral display; clear/"no expiration" affordance; min = now; shows resolved "expires in X" helper (NFR-14/AC-48).
- **Inline availability field (custom alias):** debounced (≈350ms) async check with three resolved states — **available** (green check + "available"), **taken** (red + "taken" + up to 3 suggested alternatives as click-to-fill chips), **invalid** (reserved word or bad chars → specific message). Pending shows a small inline spinner. (FR-44/AC-4.)
- **UTM builder:** a labeled field group (source/medium/campaign/term/content) + a **live preview** row showing the fully assembled tagged URL in mono, with each appended param subtly highlighted; a "copy preview" affordance. Required vs optional params indicated; common-value suggestions for medium/source optional. (FR-22/23/AC-30.)

### 4.3 Copy-to-clipboard control
First-class, used pervasively (result card, every table row, bulk results). Behavior (FR-42/AC-47): click → copies → button enters **copied** state (icon swaps to check, label "Copied") for 1.6s → reverts; simultaneously a **toast** "Link copied!" appears, announced via `aria-live=polite`. If `navigator.clipboard` is denied/unavailable, the control **falls back to selecting the text** and shows "Press ⌘/Ctrl-C to copy" — the toast is never the *only* confirmation. Copy is reachable by keyboard and has an `aria-label` including the value being copied.

### 4.4 Status badge (icon + text)
Pill, `--radius-pill`, **icon + text label always** (never color-only; AC-38 must pass in grayscale). Defined states (FR-30):

| Status | Icon (lucide) | Text | Token pair |
|---|---|---|---|
| Active | `check-circle` | Active | `--success-fg/bg` |
| Expiring soon | `clock` | Expiring | `--warning-fg/bg` |
| Expired | `x-circle` | Expired | `--danger-fg/bg` |
| Deactivated | `slash` / `ban` | Off | `--danger-fg/bg` (or neutral) |
| Password-protected | `lock` | Protected | `--lock-fg/bg` (neutral, not alarming) |
| Metadata-pending | `loader` (spin) | Fetching… | `--info-fg/bg` |

Password-protected may co-occur with another status (e.g. Active + Protected) → render the lock as a small leading icon adornment plus the primary status pill.

### 4.5 Table (the link list) + mobile card
- **Desktop table:** sticky header (`--bg-subtle`, `--z-sticky`), hairline row separators, hover row (`--bg-hover`), zebra optional-off (prefer hairlines). Row height ≈56px. Columns (FR-28): **Link** (short code mono + small "open" external-link icon), **Destination** (mono, truncated with ellipsis, full on hover/tooltip + on focus), **Status** (badge), **Clicks** (tabular number + tiny sparkline where feasible), **Created/Expires** (relative + absolute on hover), **Actions** (kebab → menu). Header cells for sortable columns show a sort caret and are buttons (keyboard-sortable). Row is keyboard-focusable; Enter opens analytics.
- **Sparkline:** ~64×20px inline area/line of last-N-days clicks; decorative — the numeric count is the source of truth and the cell has an `aria-label` ("142 clicks, trending up"); omitted gracefully when insufficient data.
- **States:** loading (skeleton rows, §4.10), **empty/zero-links** (guided empty state, §5.3), filtered-empty ("No links match these filters" + clear-filters), error (inline retry banner). 
- **Mobile (<768px):** the table **degrades to stacked cards** (NFR-17/AC-51): each card shows short code (mono, prominent) + status badge on the first line, truncated destination on the second, a footer row with click count + relative date + a kebab. No horizontal scroll, ever.
- **Bulk results table:** a distinct, simpler table — columns **Input URL** (mono, truncated), **Result** (short link + copy, OR a failure chip with per-row reason: "Invalid URL" / "Blocked" / "Alias taken"), **Status** (success/failure icon+label). Header actions: **Copy all**, **Export CSV** (FR-26/AC-33). Failures visually distinct from successes (AC-32) via icon+label+row tint, not color alone.

### 4.6 Cards
- **Stat card** (analytics overview): overline label, large tabular value, a small delta/sub-label, optional tiny sparkline. Min-height consistent across the row.
- **Guest result card** (hero output): `--radius-lg`, elevated; contains big mono short-link, copy button, QR thumbnail (opens QR modal), a **24h expiry notice** with countdown affordance, and a single quiet "Sign up to keep this link & unlock analytics" line (FR-45/AC-40). Shares tokens/components with the dashboard.
- **Link detail / create card:** form container.
- **Empty-state card:** centered icon, title, one-line explanation, single primary CTA.

### 4.7 Navigation (app shell — A-NAV persistent left-nav)
- **Sidebar (≥1024px):** `--app-sidebar-w`, `--bg-surface`, hairline right border. Top: wordmark. Nav items (icon + label, active = `--accent` text + `--accent-subtle-bg` + 2px leading accent bar): **Links** (default), **New link** (or a prominent "+ New" button pinned at top), **Analytics** (aggregate), **Settings**. Bottom: user avatar + name → account menu (theme toggle, sign out). Collapsible to `--app-sidebar-w-collapsed` (icons only, labels in tooltips).
- **Top header (within content, sticky):** page title / breadcrumb on the left; contextual actions on the right (e.g. search box on Links, "+ New link" button, theme toggle on mobile). Height `--app-header-h`.
- **Mobile (<1024px):** sidebar collapses into a **hamburger → slide-in drawer** (focus-trapped, Escape to close, scrim). A persistent bottom-or-top "+ New" remains reachable. The header shows wordmark + hamburger + theme toggle.
- **Skip-to-content** link as the first focusable element (a11y).

### 4.8 Modals / dialogs / sheets (Radix Dialog)
Focus trap, Escape to close, scroll-lock, scrim (`--overlay-scrim`), `--shadow-lg`, `--radius-md`, returns focus to trigger on close (NFR-14/AC-48). Standard header (title + close icon-button), body, footer (right-aligned actions; primary on the right). On mobile, large dialogs become **bottom sheets** (slide up, drag-down/Escape to dismiss). Used for: **Create/Edit link**, **QR modal** (enlarged QR + size presets + download + alt text + copyable link), **Delete confirm** (danger; names the link; requires explicit confirm), **Guest-claim prompt** (lists claimable links + claim/skip), **Bulk shorten** (optionally full-screen on mobile).

### 4.9 Toasts / inline alerts / banners
- **Toast:** transient, top-right (mobile: top-center), `--bg-surface-raised`, `--shadow-md`, icon+message, auto-dismiss ~4s (longer for errors), pause-on-hover, dismissible; `aria-live=polite` (assertive for errors). Used for copy success, save success, transient errors.
- **Inline alert:** within forms/sections; variants info/success/warning/danger; icon + message + optional action; for rate-limit and blocklist explanations that need to *persist* (FR-37/AC-43/44).
- **Banner:** full-width contextual (e.g. "You're browsing as a guest — links expire in 24h. Sign up to keep them."), dismissible, quiet.

### 4.10 Skeletons & loaders
- **Skeleton:** token-driven shimmer (`--bg-subtle` → `--bg-hover` sweep) on table rows, stat cards, charts, and **scraped-metadata fields** (FR-43/AC-26). Shapes mirror final content (lines, blocks, chart placeholder). **Under `prefers-reduced-motion`: no sweep — a static muted block** (AC-50).
- **Spinner:** for button-loading and inline async (alias check). Respects reduced-motion by switching to a non-spinning "…"/progress affordance where motion would otherwise be the only cue.
- **Metadata lifecycle affordance:** pending (skeleton + `Fetching…` info badge) → filled (title + description) → **scrape-failed fallback** (show raw destination + "No preview available", never a broken row) (FR-43/AC-26).

### 4.11 Charts (each = visual + accessible table)
A shared `<Chart>` shell renders the graphic and a toggle "View as table" that expands a real `<table>` of the same data; the table is also exposed to screen readers (visually-hidden by default, made visible by the toggle) and a one-line text summary precedes each chart (NFR-15/AC-49). All charts: token colors from §2.3, grid `--chart-grid`, axis `--chart-axis`, tooltips on hover/focus, keyboard-focusable data points where the lib allows, **first-class zero/insufficient-data empty state** (FR-11/AC-16).
- **Clicks-over-time:** line/area, time on X, clicks on Y. Range selector (24h / 7d / 30d / all).
- **Top referrers (categorized):** horizontal bars grouped by category (social / direct / search / referral / other), each bar labeled with category + value; legend includes category text (FR-7/AC-11).
- **Device / browser:** donut or stacked bar with **direct labels** (not legend-only) + table.
- **Geo:** **country/city ranked list/table** with counts and a share bar per row; an *optional* lightweight choropleth may sit above it but the list is the accessible primary (A-GEOVIZ/AC-10/12).

### 4.12 Misc
- **Tooltip:** Radix; on hover *and* focus; short; never the sole carrier of essential info.
- **Filter pills / segmented control:** for status filters (active / expiring / expired / protected) and analytics range; selected = `--accent-subtle-bg` + `--accent` text; keyboard-navigable; multi-select pills show a count.
- **Pagination / virtualized list:** numbered pager (or "load more"/virtual scroll for very large sets) with current-page indication and disabled prev/next at bounds (FR-29/AC-37).
- **Avatar:** initials fallback when no provider image; `--radius-full`.
- **Theme toggle:** segmented (System / Light / Dark) or a single switch with `aria-label`; persists; reflects current resolution (FR-41/AC-46).
- **Countdown / expiry chip:** for guest 24h TTL and "expiring soon" — relative ("expires in 23h"), with absolute time on hover.

---

## 5. Screen-by-screen layouts (wireframes)

Notation: `[ ]` = control/region; `│` = sidebar divider; regions described top→bottom, primary hierarchy first. Each screen notes responsive behavior and the FRs/ACs it satisfies.

### 5.0 Global frames
- **Guest frames** (no auth): centered single-column, `--guest-hero-max-w`, on `--bg-canvas`; a minimal top bar (wordmark left; "Sign in"/"Sign up" + theme toggle right). (A-LANDING.)
- **App frames** (authenticated): persistent **left sidebar** + **content area** capped at `--content-max-w`, padded `--content-pad-x`. Sticky in-content header. (A-NAV.)
- **Clicker frames** (redirect-side): standalone, centered, minimal — wordmark, a focal icon, message, action; no app chrome, no nav. On-brand via shared tokens.
- **Responsive rule (global):** at <768px the sidebar becomes a drawer and tables become cards; nothing scrolls horizontally; long mono strings truncate with ellipsis and reveal on tap/focus (NFR-17/AC-51).

---

### 5.1 Guest landing / shorten hero  — FR-32, FR-45, FR-5, FR-35, FR-36, FR-44, AC-40, AC-43, AC-44
A focused, single-purpose hero (not a marketing site, A-LANDING).

```
┌──────────────────────────────────────────────────────────────┐
│  Tess                                    [Sign in] [Sign up] [◐]│   ← top bar
├──────────────────────────────────────────────────────────────┤
│                                                                │
│                Shorten any link in seconds.                    │   ← --text-display
│        Free, fast, and private. No account needed.            │   ← --text-secondary subhead
│                                                                │
│   ┌──────────────────────────────────────────────┐ ┌───────┐ │
│   │  Paste a long URL…                            │ │Shorten│ │   ← big input (lg) + primary lg btn
│   └──────────────────────────────────────────────┘ └───────┘ │
│   ⓘ Links you create here expire in 24 hours.                  │   ← quiet helper (sets expectation up front)
│                                                                │
│   [ optional: advanced ▸ (set expiry sooner) ]                 │   ← at-creation expiry affordance (FR-32)
└──────────────────────────────────────────────────────────────┘
```
- **On submit (loading):** button → loading; input disabled. Validation errors (malformed/`javascript:`) render as an **inline error** under the input with a specific message, no card (FR-5/AC-7). Rate-limit → **inline alert** explaining the limit + retry-after, not a 429 (FR-35/AC-43). Blocklist hit → inline alert, non-accusatory, with next step (FR-36/AC-44).
- **On success:** the hero compresses upward and a **guest result card** (§5.2) appears below, with focus moved to it (and the new short link announced via `aria-live`).
- **Responsive:** input + button stack vertically <640px; button becomes full-width.

### 5.2 Guest result card  — FR-45, FR-12, FR-14, FR-42, AC-40, AC-47
```
┌───────────────────────────── result ──────────────────────────┐
│  Your short link                                    [Done ✕]    │
│  ┌──────────────────────────────────────────┐  ┌───────────┐   │
│  │  tess.link/aZ9kQ2          (mono, lg)     │  │  ▣ QR     │   │ ← big link + QR thumb (opens modal)
│  └──────────────────────────────────────────┘  └───────────┘   │
│  [ Copy link ✓ ]   [ Open ↗ ]                                   │ ← copy = toast + copied-state + fallback
│  ⏱ Expires in 24h · only basic click count available           │ ← TTL + guest-tier note (FR-10/45)
│  ─────────────────────────────────────────────────────────     │
│  Want it permanent + full analytics? [Sign up] — keeps this link│ ← single quiet upsell line (non-nagging)
└────────────────────────────────────────────────────────────────┘
```
Shares tokens/components with the dashboard (FR-45). The QR thumbnail opens the **QR modal** (§5.9). Multiple guest links created in a session stack as a short list of these cards (most-recent first).

### 5.3 Auth screens (sign in / sign up)  — FR-27, AC-35
Centered card on `--bg-canvas`. Order: **Continue with Google**, **Continue with GitHub** (provider buttons with brand-correct icons, secondary style), a hairline "or" divider, then **Email + Password** fields with a primary submit. Sign-up adds password-strength helper and shows the **guest-claim prompt** post-auth if claimable links exist (§5.10). Email/password errors are specific and inline (wrong credentials, email taken). Fully keyboard operable; password field has a show/hide toggle (icon-button with `aria-label`).

### 5.4 Dashboard — link list (default authenticated screen)  — FR-28, FR-29, FR-30, FR-31, AC-36/37/38/39/51
```
┌────────────┬───────────────────────────────────────────────────────────┐
│  Tess      │  Links                                  [🔍 Search] [+ New] │ ← sticky header: title, search, primary
│            │  ───────────────────────────────────────────────────────── │
│ ▸ Links ◀  │  [All][Active][Expiring][Expired][Protected]   Sort:[Newest▾]│ ← filter pills + sort (FR-29)
│ ▸ Analytics│  ┌─────────────────────────────────────────────────────────┐│
│ ▸ Settings │  │ LINK         DESTINATION        STATUS   CLICKS   ⋯      ││ ← sticky table header (sortable)
│            │  ├─────────────────────────────────────────────────────────┤│
│            │  │ /aZ9kQ2 ↗   example.com/very-lo…  ●Active  1,204 ▁▂▅  ⋮  ││
│            │  │ /spring  ↗  shop.acme.com/sale…   ⏱Expiring  842 ▁▃▂  ⋮  ││
│            │  │ /docs2   ↗  🔒 notion.so/page…    🔒Protected 33 ▁▁▂  ⋮  ││
│  ┌───────┐ │  │ /q1promo ↗  acme.com/q1 (exp…)    ✕Expired   5,331 ▅▅▁ ⋮ ││
│  │ ◐ AB  │ │  └─────────────────────────────────────────────────────────┘│
│  └───────┘ │            ‹ 1 2 3 … ›   (or virtualized scroll)             │ ← pagination (FR-29)
└────────────┴───────────────────────────────────────────────────────────┘
```
- **Destination** is mono, ellipsis-truncated, full on hover/focus (FR-28/AC-36). **Status** is icon+label (AC-38, grayscale-safe). **Clicks** tabular + sparkline (decorative; numeric is source of truth). **⋮ kebab** → row menu: Edit · QR · Analytics · Copy link · Delete (Delete is danger, opens confirm). Row click / Enter → per-link analytics.
- **Zero-links empty state (FR-31/AC-39):** replace the table with a centered empty-state card — illustration/icon, "Create your first short link," one primary **+ New link** CTA. No secondary clutter.
- **Filtered-empty:** "No links match" + **Clear filters**.
- **Loading:** skeleton rows (5–8). **Mobile (<768px):** table → **stacked cards** (NFR-17/AC-51); search collapses to an icon that expands; filters become a horizontally-scrollable pill row (the *pills* scroll, the page does not); "+ New" becomes a FAB or header button.

### 5.5 Create / edit link  — FR-2, FR-3, FR-15, FR-16, FR-19, FR-22, FR-23, FR-44, AC-3/4/5, AC-30
Modal on desktop, **full-screen/bottom-sheet on mobile**. Single scrollable form, grouped:
1. **Destination URL** (required) — mono input; on blur, kicks off async metadata scrape (shown later in history, FR-19).
2. **Custom alias** (optional) — static `tess.link/` adornment + alias field with **live availability** (available/taken+suggestions/invalid) (FR-2/3/44, AC-4/5).
3. **UTM tags** (collapsible) — source/medium/campaign/term/content + **live assembled-URL preview** in mono (FR-22/23/AC-30).
4. **Expiration** (optional) — datetime picker AND/OR **max-click limit** number field; helper resolves "Expires in 5 days / after 100 clicks" (FR-15).
5. **Password protection** (optional) — switch → reveals password field (hashed server-side; never echoed back on edit — shows "Set" with a "change" affordance) (FR-16).
6. **Redirect status** — default 302 noted; per-link 301/302 select is a nice-to-have toggle (A-REDIR), default 302.

Footer: **Cancel** · **Create link** (primary, loading state). Edit mode pre-fills, titles "Edit link," and warns nothing about cache (handled server-side, FR-21) but a subtle note "Changes apply to new clicks immediately." Validation/errors are inline per-field; submit disabled while alias is `taken`/`invalid`.

### 5.6 Bulk shortening  — FR-24, FR-25, FR-26, AC-31/32/33/34
Dedicated screen or large modal (registered-only, A-BULK).
```
┌──────────────────────── Bulk shorten ────────────────────────┐
│  Paste URLs — one per line                      12 / 100 URLs │ ← live counter (max 100, A-BULK)
│  ┌──────────────────────────────────────────────────────┐    │
│  │ https://a.com/…                                        │    │ ← mono textarea, auto-grow
│  │ https://b.com/…                                        │    │
│  │ not-a-url                                              │    │
│  └──────────────────────────────────────────────────────┘    │
│  [ Shorten all ]                                              │
│  ───────────────── results (after run) ───────────────────   │
│  INPUT                RESULT                   STATUS         │
│  a.com/…              tess.link/aa1  [Copy]    ✓ Success      │
│  b.com/…              tess.link/bb2  [Copy]    ✓ Success      │
│  not-a-url            — Invalid URL            ✕ Failed       │ ← per-row reason, visually distinct (AC-32)
│  [ Copy all ]  [ Export CSV ]                                 │ ← (FR-26/AC-33)
└───────────────────────────────────────────────────────────────┘
```
Over-limit submission → clear inline message, run is blocked/limited (AC-34). Partial success is the norm: valid rows succeed even when others fail (NFR-4/AC-32). Failure rows use icon+label+row tint (not color alone).

### 5.7 Per-link analytics  — FR-7, FR-9, FR-11, AC-9/10/11/14/16/49
```
┌────────────┬───────────────────────────────────────────────────────────┐
│  …sidebar… │  ‹ Links  ›  /spring-sale            [Copy][QR][Edit][⋮]    │ ← header: breadcrumb + link actions
│            │  example.com/spring  ·  ●Active · created Jun 2 · expires…   │ ← context line (mono dest)
│            │  ┌──────┐┌──────┐┌──────┐┌──────┐    Range:[24h][7d][30d][All]│ ← stat cards + range
│            │  │Clicks││Unique││Top   ││Top   │                            │
│            │  │1,204 ││  892 ││ US   ││Social│                            │
│            │  └──────┘└──────┘└──────┘└──────┘                            │
│            │  ┌────────── Clicks over time ──────────┐  [View as table]   │ ← chart + a11y table toggle
│            │  │            ╱╲      ╱╲                 │                    │
│            │  └──────────────────────────────────────┘                    │
│            │  ┌──── Top referrers ────┐ ┌──── Devices ────┐                │
│            │  │ Social ▇▇▇▇  Direct ▇▇│ │ ◐ Mobile/Desktop │                │
│            │  └───────────────────────┘ └──────────────────┘                │
│            │  ┌──── Geo (country / city) ────┐                              │
│            │  │ US ▇▇▇▇ 612  ·  GB ▇▇ 180 …  │ ← ranked list (A-GEOVIZ)     │
│            │  └──────────────────────────────┘                              │
└────────────┴───────────────────────────────────────────────────────────────┘
```
- Every chart has the **"View as table"** toggle + a one-line text summary (NFR-15/AC-49) and a **zero/insufficient-data empty state** with a "Share this link" CTA when clicks are low (FR-11/AC-16).
- Analytics remain viewable for **expired/deactivated** links (banner: "This link is expired — historical analytics shown") (FR-9/AC-14). Deleting removes them (handled in delete confirm).
- **Mobile:** stat cards 2×2 then 1-col; charts full-width stacked; range selector becomes a select.

### 5.8 Aggregate analytics (all links)  — FR-8, AC-13
Same building blocks as §5.7 but summed across the user's links: top-line stat cards (total clicks, total unique, total links, active links), clicks-over-time across all links, top links table (by clicks, each row linking to its per-link analytics), and aggregate referrer/geo/device. Empty state mirrors the dashboard when the user has no data yet.

### 5.9 QR modal  — FR-12, FR-13, FR-14, AC-17/18/19
Centered dialog: enlarged QR (rendered from short link), **size preset segmented control** (e.g. Small 256 / Medium 512 / Large 1024 — ≥2 presets, AC-18), **Download PNG** primary button, the **short link displayed in mono with a copy button beside it** (for users who can't scan, FR-14/AC-19), and a visible/over-the-image **alt-text note** ("QR code linking to tess.link/aZ9kQ2") that is also the image's `alt` (AC-19). On mobile → bottom sheet. Optional SVG/format toggle is a nice-to-have; PNG is required.

### 5.10 Guest-claim prompt  — FR-34, AC-42
Shown right after first successful sign-up/sign-in when the browser/session holds still-live guest links. Modal: title "Keep your recent links?", a short list of claimable links (short code + destination + remaining TTL), and **Claim N links** (primary) / **Not now** (ghost). Explicit opt-in (AC-42). On claim: links move into the account and **lose the 24h expiry**; success toast; user lands on the dashboard showing them. Expired guest links are not listed (not recoverable, A-GUESTCLAIM).

### 5.11 Settings  — FR-41, AC-46 (+ account)
Sectioned page: **Appearance** (theme: System/Light/Dark segmented, persists, AC-46), **Account** (email, connected providers Google/GitHub with connect/disconnect, change password for email accounts), **Privacy/data** (note on analytics retention per A-PII once confirmed), **Danger zone** (delete account — confirm dialog). Quiet, single-column, max-width ~640px.

### 5.12 Clicker surfaces (redirect-side — first-class)  — FR-37, FR-38, FR-39, FR-40, AC-20/21/22/23/24/41/44
Standalone centered frames, on-brand via tokens, no app chrome. **Copy never blames the visitor.**

- **Password gate (FR-17/39, AC-22/23/24):**
```
        🔒  This link is protected
   Enter the password to continue to the destination.
   ┌───────────────────────────┐
   │ Password            [👁]   │
   └───────────────────────────┘
   [ Unlock ]
   ⚠ Incorrect password. (error state)
   ⏳ Too many attempts — try again in 2:00. (lockout state, FR-18/AC-24)
```
Correct password → redirect; a short-lived **unlock session** prevents re-prompt on immediate refresh (AC-23). A click is counted **only on successful unlock** (FR-40/AC-25). Unlock attempts are rate-limited independently (FR-18/AC-24).

- **Dead-link page (expired / deactivated / max-clicks / not-found) (FR-38, AC-20/21/29/41):**
```
        ⛔  This link is no longer active
   It may have expired, reached its limit, or been turned off
   by its owner.
   [ Go to Tess ]   [ Shorten your own link ]
```
One reassuring message covers expired/deactivated/max-clicks; a never-existed code shows a near-identical "We couldn't find that link" variant. On-brand, not a raw 404/410 body (A-DEADLINK; exact HTTP codes are the architect's call). Provides a path forward (create your own).

- **Optional interstitial** (if the architect enables a brief safety/preview interstitial): centered, shows destination host + "Continue," respecting reduced-motion; not required by the PRD, designed only if turned on.

---

## 6. Accessibility specification

Binds the PRD's a11y FRs/NFRs (FR-30/41/42/43, NFR-13–17, AC-38/46/47/48/49/50/51) to concrete rules.

- **Contrast (NFR-13/AC-46):** WCAG 2.1 AA in **both** themes — body text 4.5:1, large text (≥24px or ≥19px bold) and UI/graphic boundaries 3:1. The §2.2 token pairs are chosen to meet this; `--text-tertiary` is never used for essential <16px text below 4.5:1. Status chips use the high-contrast `*-fg` for text/icon.
- **Color independence (FR-30/NFR-15/AC-38/49):** every status = icon + text; every chart series = direct label/legend text + pattern, plus a paired data table. AC-38 must pass with color disabled (grayscale).
- **Focus (NFR-14/AC-48):** every interactive element has a **visible focus-visible ring** = `--shadow-focus` (2px `--focus-ring` with a 2px surface-colored offset), ≥3:1 against adjacent colors, never removed (`outline:none` only when replaced by the ring). Focus order follows DOM/reading order. **Skip-to-content** link first in tab order.
- **Keyboard (NFR-14/AC-48):** Radix-backed menus (roving tabindex, arrows, type-ahead, Esc), dialogs (focus trap, Esc, restore focus, scroll-lock), datetime picker (arrow-grid + typeable time), tabs, filter pills, sortable table headers (Enter/Space to sort), and the full create/UTM form are all operable without a mouse. Row actions reachable via the kebab button; row openable with Enter.
- **Screen-reader semantics:** real `<table>`/`<th scope>` for the link list and chart data tables; `aria-live=polite` for copy/save toasts and async results, `assertive` for errors (FR-42/AC-47); `aria-busy` on loading regions; `aria-invalid`+`aria-describedby` on field errors; icon-only buttons always carry `aria-label`; QR `alt` is descriptive and non-empty (AC-19); decorative sparkline marked `aria-hidden` with the numeric value as the accessible source.
- **Motion (NFR-16/AC-50):** `prefers-reduced-motion: reduce` → all transitions/animations `0ms`, skeleton shimmer becomes a static muted block, no slide/scale/auto-advancing motion; spinners degrade to a non-spinning progress cue where motion is the only signal.
- **Responsive/no-h-scroll (NFR-17/AC-51):** mobile table → stacked cards; long mono strings truncate (ellipsis) and reveal on tap/focus; the page never scrolls horizontally; tap targets ≥44×44px.
- **Forms:** every input has a programmatic label (visible or visually-hidden); error messaging is text (not color-only) and associated to the field; required state announced.
- **Theme (FR-41/AC-46):** semantic-token theming (no hardcoded inversion); first visit = `prefers-color-scheme`, then a persisted explicit choice; the toggle is labeled and reflects the active resolution.

---

## 7. Assumptions & open questions (design-side)

**Design decisions taken (honoring PRD assumptions; flag if any conflict):**
- **D-1 (name):** Placeholder wordmark **"Tess"** and domain `tess.link` used in examples. Final name/logo pending human (PRD A-BRAND/OQ-8). Isolated to a wordmark token + strings.
- **D-2 (accent):** **Indigo** chosen within the PRD's blue/indigo latitude (A-BRAND). Single restrained accent; everything else neutral. Swappable via the `--accent*` tokens if a brand hue is supplied (OQ-8).
- **D-3 (shell):** Persistent **left-nav** app shell + table-first link list with stacked-card mobile fallback (A-NAV).
- **D-4 (geo viz):** Geo ships as a **ranked country/city list/table** (accessible primary); any choropleth is optional/decorative (A-GEOVIZ).
- **D-5 (landing):** **Focused single-purpose hero** for guests, not a marketing site (A-LANDING).
- **D-6 (theme default):** First-visit theme = `prefers-color-scheme`, then persisted toggle (A-THEME-DEFAULT).
- **D-7 (i18n):** **English-only**; tokens/layout don't preclude later localization, but no RTL/locale work this build (A-I18N).
- **D-8 (component stack):** Recommend **shadcn/ui + Tailwind + Radix + Recharts + lucide**, contingent on the architect choosing a React/Next stack; tokens/components/layouts here are framework-agnostic if not.
- **D-9 (fonts):** **System font stacks** (no CDN) to satisfy fully-local/offline runnability (NFR-10); any vendored font must be self-hosted.

**Open questions for the human / architect:**
- **DQ-1 (OQ-8):** Is there a real product name, logo, and brand accent to honor, or is design's Tess/indigo accepted? Any hue preference (blue / indigo / violet)?
- **DQ-2:** Confirm system-font stack is acceptable, or should we vendor a self-hosted display/UI font (e.g. Inter) for stronger brand character? (Affects only the font tokens.)
- **DQ-3:** Per-link redirect-status toggle (301/302) — surface it in the create/edit UI now (default 302), or hide entirely for this build? (Depends on architect's A-REDIR decision/OQ-2.)
- **DQ-4 (architect coordination):** Final framework choice (STACK DIRECTIVE) determines whether the recommended library names in §3 apply; the visual/UX contract (tokens, states, layouts, a11y) stands regardless.
- **DQ-5:** Privacy/retention copy in Settings depends on the A-PII/OQ-3 outcome (hashed/truncated vs raw IP, retention window) — final wording pending that decision.

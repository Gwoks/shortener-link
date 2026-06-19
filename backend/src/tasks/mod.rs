//! In-process background tasks (Phase 6) — ports of `src/worker/*` (TypeScript
//! oracle). Each module replaces a worker loop with a tokio task:
//!   - `click_ingest` ← `src/worker/clickConsumer.ts`
//!   - `scraper`      ← `src/worker/scraper.ts`
//!   - `sweep`        ← `src/worker/sweep.ts`
//!
//! These consume the in-process channels (`crate::queue`) that replaced the
//! Redis stream / list in the Node worker. A bad message must never crash a
//! loop — errors are logged and skipped (at-least-once intent, in-process).

pub mod click_ingest;
pub mod scraper;
pub mod sweep;

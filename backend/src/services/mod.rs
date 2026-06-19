//! Pure-logic backend services ported from `src/lib/*` (TypeScript oracle).
//! Each module mirrors the same-named oracle file. No I/O lives in the pure
//! cores; the route/worker layers (later phases) wire these together.

pub mod alias;
pub mod blocklist;
pub mod cache;
pub mod clicker_pages;
pub mod geo;
pub mod qr;
pub mod ratelimit;
pub mod redirect;
pub mod referrer;
pub mod reserved;
pub mod serialize;
pub mod shortcode;
pub mod ssrf;
pub mod ua;
pub mod unlock;
pub mod utm;
pub mod validation;

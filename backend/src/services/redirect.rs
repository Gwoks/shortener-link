//! Pure redirect resolution rules — ported from `src/lib/redirect.ts`.
//! CRITICAL: exact parity with the oracle. No I/O here — the caller does the
//! cache/DB read and the click enqueue; this module only decides.
//!
//! Decision order (binding):
//!   not found            -> NotFound (404)        (never existed / deleted)
//!   deactivated          -> Dead "deactivated"    (410)
//!   status == EXPIRED    -> Dead "expired"        (410)
//!   expired (datetime)   -> Dead "expired"        (410)
//!   max-clicks reached   -> Dead "max-clicks"     (410)
//!   password & !unlocked -> Gate (200)            (no redirect, no click)
//!   otherwise            -> Redirect (30x), click counted

/// A resolved link record (the fields `resolve` reads). Mirrors `ResolvedLink`.
#[derive(Debug, Clone)]
pub struct LinkView {
    pub destination_url: String,
    /// "ACTIVE" | "EXPIRED" | "DEACTIVATED".
    pub status: String,
    /// ISO-8601 UTC expiry timestamp, or None.
    pub expires_at: Option<String>,
    pub max_clicks: Option<i64>,
    pub click_count: i64,
    pub has_password: bool,
    /// The 30x status to emit on a redirect (301 or 302). Carried so the caller
    /// doesn't need to re-read config; mirrors the route's use of env.redirectStatus.
    pub redirect_status: u16,
}

/// Request context for resolution. Mirrors `RedirectContext`.
#[derive(Debug, Clone)]
pub struct RedirectContext {
    /// Current time (ms since epoch) — injected so the core is deterministic.
    pub now: i64,
    /// Does the request carry a valid unlock cookie/session for this code?
    pub unlocked: bool,
    /// Authoritative live click count for max-click enforcement; falls back to
    /// the link's cached `click_count` when None.
    pub live_click_count: Option<i64>,
}

/// What a clicker receives. Mirrors `RedirectDecision`.
/// `reason` strings are exactly "expired" | "deactivated" | "max-clicks".
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    Redirect { url: String, status: u16 },
    Gate,
    Dead { reason: String },
    NotFound,
}

/// Resolve what a clicker receives. Pure.
pub fn resolve(link: Option<&LinkView>, ctx: &RedirectContext) -> Decision {
    let link = match link {
        Some(l) => l,
        None => return Decision::NotFound,
    };

    if link.status == "DEACTIVATED" {
        return Decision::Dead {
            reason: "deactivated".to_string(),
        };
    }

    if link.status == "EXPIRED" {
        return Decision::Dead {
            reason: "expired".to_string(),
        };
    }

    if let Some(expires_at) = &link.expires_at {
        if let Some(exp_ms) = parse_iso_ms(expires_at) {
            if exp_ms <= ctx.now {
                return Decision::Dead {
                    reason: "expired".to_string(),
                };
            }
        }
    }

    if let Some(max) = link.max_clicks {
        let current = ctx.live_click_count.unwrap_or(link.click_count);
        if current >= max {
            return Decision::Dead {
                reason: "max-clicks".to_string(),
            };
        }
    }

    if link.has_password && !ctx.unlocked {
        return Decision::Gate;
    }

    Decision::Redirect {
        url: link.destination_url.clone(),
        status: link.redirect_status,
    }
}

/// Whether a *counted* hit just occurred (for click enqueue + INCR). Mirrors
/// `isCountedHit`: only the `Redirect` outcome counts.
pub fn is_counted_hit(decision: &Decision) -> bool {
    matches!(decision, Decision::Redirect { .. })
}

/// Parse an ISO-8601 datetime to epoch-ms, mirroring JS `Date.parse`. Returns
/// None when unparseable (so the branch is skipped, matching the oracle's
/// `Number.isFinite(exp)` guard).
fn parse_iso_ms(s: &str) -> Option<i64> {
    use chrono::{DateTime, NaiveDateTime, Utc};
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.timestamp_millis());
    }
    // Fall back to a few common shapes JS Date.parse accepts.
    if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f") {
        return Some(dt.and_utc().timestamp_millis());
    }
    if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return Some(dt.and_utc().timestamp_millis());
    }
    if let Ok(d) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return Some(d.and_hms_opt(0, 0, 0)?.and_utc().timestamp_millis());
    }
    let _ = Utc::now();
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_link() -> LinkView {
        LinkView {
            destination_url: "https://example.com/dest".to_string(),
            status: "ACTIVE".to_string(),
            expires_at: None,
            max_clicks: None,
            click_count: 0,
            has_password: false,
            redirect_status: 302,
        }
    }

    fn ctx(now: i64) -> RedirectContext {
        RedirectContext {
            now,
            unlocked: false,
            live_click_count: None,
        }
    }

    #[test]
    fn not_found_when_link_missing() {
        assert_eq!(resolve(None, &ctx(0)), Decision::NotFound);
    }

    #[test]
    fn active_link_redirects_and_counts() {
        let link = base_link();
        let d = resolve(Some(&link), &ctx(0));
        assert_eq!(
            d,
            Decision::Redirect {
                url: "https://example.com/dest".to_string(),
                status: 302
            }
        );
        assert!(is_counted_hit(&d));
    }

    #[test]
    fn respects_redirect_status_301() {
        let mut link = base_link();
        link.redirect_status = 301;
        match resolve(Some(&link), &ctx(0)) {
            Decision::Redirect { status, .. } => assert_eq!(status, 301),
            other => panic!("expected redirect, got {other:?}"),
        }
    }

    #[test]
    fn deactivated_is_dead() {
        let mut link = base_link();
        link.status = "DEACTIVATED".to_string();
        assert_eq!(
            resolve(Some(&link), &ctx(0)),
            Decision::Dead { reason: "deactivated".into() }
        );
    }

    #[test]
    fn expired_status_is_dead() {
        let mut link = base_link();
        link.status = "EXPIRED".to_string();
        assert_eq!(
            resolve(Some(&link), &ctx(0)),
            Decision::Dead { reason: "expired".into() }
        );
    }

    #[test]
    fn expired_datetime_is_dead() {
        let mut link = base_link();
        link.expires_at = Some("2020-01-01T00:00:00.000Z".to_string());
        // now is well after expiry
        let d = resolve(Some(&link), &ctx(2_000_000_000_000));
        assert_eq!(d, Decision::Dead { reason: "expired".into() });
    }

    #[test]
    fn future_expiry_still_active() {
        let mut link = base_link();
        link.expires_at = Some("2999-01-01T00:00:00.000Z".to_string());
        match resolve(Some(&link), &ctx(0)) {
            Decision::Redirect { .. } => {}
            other => panic!("expected redirect, got {other:?}"),
        }
    }

    #[test]
    fn unparseable_expiry_is_ignored() {
        let mut link = base_link();
        link.expires_at = Some("not-a-date".to_string());
        match resolve(Some(&link), &ctx(0)) {
            Decision::Redirect { .. } => {}
            other => panic!("expected redirect, got {other:?}"),
        }
    }

    #[test]
    fn max_clicks_reached_is_dead_using_cached_count() {
        let mut link = base_link();
        link.max_clicks = Some(5);
        link.click_count = 5;
        assert_eq!(
            resolve(Some(&link), &ctx(0)),
            Decision::Dead { reason: "max-clicks".into() }
        );
    }

    #[test]
    fn max_clicks_uses_live_count_when_present() {
        let mut link = base_link();
        link.max_clicks = Some(5);
        link.click_count = 0; // cached behind
        let mut c = ctx(0);
        c.live_click_count = Some(5);
        assert_eq!(
            resolve(Some(&link), &c),
            Decision::Dead { reason: "max-clicks".into() }
        );
    }

    #[test]
    fn under_max_clicks_redirects() {
        let mut link = base_link();
        link.max_clicks = Some(5);
        link.click_count = 4;
        match resolve(Some(&link), &ctx(0)) {
            Decision::Redirect { .. } => {}
            other => panic!("expected redirect, got {other:?}"),
        }
    }

    #[test]
    fn password_gate_when_locked() {
        let mut link = base_link();
        link.has_password = true;
        let d = resolve(Some(&link), &ctx(0));
        assert_eq!(d, Decision::Gate);
        assert!(!is_counted_hit(&d));
    }

    #[test]
    fn password_redirects_when_unlocked() {
        let mut link = base_link();
        link.has_password = true;
        let mut c = ctx(0);
        c.unlocked = true;
        match resolve(Some(&link), &c) {
            Decision::Redirect { .. } => {}
            other => panic!("expected redirect, got {other:?}"),
        }
    }

    #[test]
    fn decision_order_deactivated_beats_password() {
        let mut link = base_link();
        link.status = "DEACTIVATED".to_string();
        link.has_password = true;
        assert_eq!(
            resolve(Some(&link), &ctx(0)),
            Decision::Dead { reason: "deactivated".into() }
        );
    }
}

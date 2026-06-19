//! Expiry / retention / guest-TTL sweep — ports `src/worker/sweep.ts` and the
//! retention math implied by `click_retention_days` / `guest_ttl_hours` (spec
//! §2.2.E, NFR-12).
//!
//! The oracle's `sweepOnce` flips ACTIVE links whose `expiresAt` has passed to
//! EXPIRED. This port keeps that and adds the two housekeeping jobs the in-process
//! design owns (no separate cron): pruning old `click_event` rows past the
//! retention window, and purging guest links past their TTL. Redirect-time checks
//! remain the authoritative guard; this keeps dashboards/listings honest.
//!
//! `sweep_once` takes an injected clock (`now_ms`) so tests are deterministic.

use std::sync::Arc;
use std::time::Duration;

use chrono::{SecondsFormat, TimeZone, Utc};
use sqlx::SqlitePool;

use crate::config::Config;

/// Match the oracle's `SWEEP_INTERVAL_MS = 60_000`.
pub const SWEEP_INTERVAL_MS: u64 = 60_000;

/// Outcome counts of one sweep pass (handy for logging/tests).
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct SweepResult {
    pub expired: u64,
    pub events_pruned: u64,
    pub guests_purged: u64,
}

/// Run the sweep loop forever on a fixed interval. Never panics — a failed pass
/// is logged and retried next tick.
pub async fn run(pool: SqlitePool, cfg: Arc<Config>) {
    tracing::info!("[tasks] expiry sweep started");
    let mut ticker = tokio::time::interval(Duration::from_millis(SWEEP_INTERVAL_MS));
    loop {
        ticker.tick().await;
        let now_ms = Utc::now().timestamp_millis();
        match sweep_once(&pool, &cfg, now_ms).await {
            Ok(r) => {
                if r.expired > 0 || r.events_pruned > 0 || r.guests_purged > 0 {
                    tracing::info!(
                        "[tasks] sweep: expired={} events_pruned={} guests_purged={}",
                        r.expired,
                        r.events_pruned,
                        r.guests_purged
                    );
                }
            }
            Err(e) => tracing::error!("[tasks] sweep error: {e}"),
        }
    }
}

/// One sweep pass with an injected clock. Returns the counts changed.
///
/// Conditions (ACTIVE links only for expiry, matching the oracle):
///   - expire when `expires_at` is non-null and `<= now`, OR `max_clicks` is
///     non-null and `click_count >= max_clicks` (AC-21 parity with the redirect
///     guard);
///   - prune `click_event` rows with `occurred_at < now - click_retention_days`;
///   - delete guest links (`is_guest = 1`) with `created_at < now - guest_ttl_hours`.
pub async fn sweep_once(pool: &SqlitePool, cfg: &Config, now_ms: i64) -> anyhow::Result<SweepResult> {
    let now = Utc
        .timestamp_millis_opt(now_ms)
        .single()
        .unwrap_or_else(Utc::now);
    let now_iso = now.to_rfc3339_opts(SecondsFormat::Millis, true);

    // 1) Expire due links (timed expiry or max-clicks reached).
    let expired = sqlx::query(
        "UPDATE link
            SET status = 'EXPIRED', updated_at = ?
          WHERE status = 'ACTIVE'
            AND (
                  (expires_at IS NOT NULL AND expires_at <= ?)
               OR (max_clicks IS NOT NULL AND click_count >= max_clicks)
            )",
    )
    .bind(&now_iso)
    .bind(&now_iso)
    .execute(pool)
    .await?
    .rows_affected();

    // 2) Prune old click_event rows past the retention window.
    let retention_cutoff = (now - chrono::Duration::days(cfg.click_retention_days))
        .to_rfc3339_opts(SecondsFormat::Millis, true);
    let events_pruned = sqlx::query("DELETE FROM click_event WHERE occurred_at < ?")
        .bind(&retention_cutoff)
        .execute(pool)
        .await?
        .rows_affected();

    // 3) Purge guest links past their TTL.
    let guest_cutoff = (now - chrono::Duration::hours(cfg.guest_ttl_hours))
        .to_rfc3339_opts(SecondsFormat::Millis, true);
    let guests_purged = sqlx::query("DELETE FROM link WHERE is_guest = 1 AND created_at < ?")
        .bind(&guest_cutoff)
        .execute(pool)
        .await?
        .rows_affected();

    Ok(SweepResult {
        expired,
        events_pruned,
        guests_purged,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::cuid;

    async fn mem_pool() -> SqlitePool {
        let pool = crate::db::pool(":memory:").await.unwrap();
        crate::db::migrate(&pool).await.unwrap();
        pool
    }

    fn cfg() -> Config {
        let mut c = Config::from_env();
        c.click_retention_days = 400;
        c.guest_ttl_hours = 24;
        c
    }

    fn iso(ms: i64) -> String {
        Utc.timestamp_millis_opt(ms)
            .single()
            .unwrap()
            .to_rfc3339_opts(SecondsFormat::Millis, true)
    }

    #[tokio::test]
    async fn sweep_expires_prunes_and_purges() {
        let pool = mem_pool().await;
        let cfg = cfg();
        // now = 2026-06-19T12:00:00Z
        let now_ms: i64 = 1_781_956_800_000;
        let day = 86_400_000i64;
        let hour = 3_600_000i64;

        // (a) ACTIVE link with past expires_at → should become EXPIRED.
        let timed = cuid();
        sqlx::query(
            "INSERT INTO link (id, code, destination_url, status, expires_at, created_at, updated_at)
             VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?)",
        )
        .bind(&timed)
        .bind("timed1")
        .bind("https://e.com")
        .bind(iso(now_ms - hour)) // expired an hour ago
        .bind(iso(now_ms - day))
        .bind(iso(now_ms - day))
        .execute(&pool)
        .await
        .unwrap();

        // (b) ACTIVE link over max_clicks → should become EXPIRED.
        let maxed = cuid();
        sqlx::query(
            "INSERT INTO link (id, code, destination_url, status, max_clicks, click_count, created_at, updated_at)
             VALUES (?, ?, ?, 'ACTIVE', 5, 5, ?, ?)",
        )
        .bind(&maxed)
        .bind("maxed1")
        .bind("https://e.com")
        .bind(iso(now_ms - day))
        .bind(iso(now_ms - day))
        .execute(&pool)
        .await
        .unwrap();

        // (c) ACTIVE link, future expiry, under cap → stays ACTIVE.
        let live = cuid();
        sqlx::query(
            "INSERT INTO link (id, code, destination_url, status, expires_at, max_clicks, click_count, created_at, updated_at)
             VALUES (?, ?, ?, 'ACTIVE', ?, 10, 1, ?, ?)",
        )
        .bind(&live)
        .bind("live01")
        .bind("https://e.com")
        .bind(iso(now_ms + day))
        .bind(iso(now_ms - day))
        .bind(iso(now_ms - day))
        .execute(&pool)
        .await
        .unwrap();

        // (d) Old guest link (created 25h ago) → purged.
        let guest_old = cuid();
        sqlx::query(
            "INSERT INTO link (id, code, destination_url, is_guest, created_at, updated_at)
             VALUES (?, ?, ?, 1, ?, ?)",
        )
        .bind(&guest_old)
        .bind("guold1")
        .bind("https://e.com")
        .bind(iso(now_ms - 25 * hour))
        .bind(iso(now_ms - 25 * hour))
        .execute(&pool)
        .await
        .unwrap();

        // (e) Recent guest link (created 1h ago) → kept.
        let guest_new = cuid();
        sqlx::query(
            "INSERT INTO link (id, code, destination_url, is_guest, created_at, updated_at)
             VALUES (?, ?, ?, 1, ?, ?)",
        )
        .bind(&guest_new)
        .bind("gunew1")
        .bind("https://e.com")
        .bind(iso(now_ms - hour))
        .bind(iso(now_ms - hour))
        .execute(&pool)
        .await
        .unwrap();

        // Old click_event (450 days ago) on the live link → pruned. Plus a fresh one kept.
        sqlx::query(
            "INSERT INTO click_event (id, link_id, occurred_at, visitor_key, is_unique, referrer_category)
             VALUES (?, ?, ?, 'vk', 1, 'DIRECT')",
        )
        .bind(cuid())
        .bind(&live)
        .bind(iso(now_ms - 450 * day))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO click_event (id, link_id, occurred_at, visitor_key, is_unique, referrer_category)
             VALUES (?, ?, ?, 'vk', 1, 'DIRECT')",
        )
        .bind(cuid())
        .bind(&live)
        .bind(iso(now_ms - day))
        .execute(&pool)
        .await
        .unwrap();

        let res = sweep_once(&pool, &cfg, now_ms).await.unwrap();
        assert_eq!(res.expired, 2, "timed + maxed expired");
        assert_eq!(res.events_pruned, 1, "only the 450-day-old event pruned");
        assert_eq!(res.guests_purged, 1, "only the 25h-old guest purged");

        let status_of = |id: &str| {
            let pool = pool.clone();
            let id = id.to_string();
            async move {
                let row: (String,) = sqlx::query_as("SELECT status FROM link WHERE id = ?")
                    .bind(&id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
                row.0
            }
        };
        assert_eq!(status_of(&timed).await, "EXPIRED");
        assert_eq!(status_of(&maxed).await, "EXPIRED");
        assert_eq!(status_of(&live).await, "ACTIVE");

        let guest_old_exists: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM link WHERE id = ?")
                .bind(&guest_old)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(guest_old_exists.0, 0, "old guest purged");
        let guest_new_exists: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM link WHERE id = ?")
                .bind(&guest_new)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(guest_new_exists.0, 1, "recent guest kept");

        let events_left: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM click_event")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(events_left.0, 1, "fresh event kept");
    }

    #[tokio::test]
    async fn sweep_is_idempotent_noop_second_pass() {
        let pool = mem_pool().await;
        let cfg = cfg();
        let now_ms: i64 = 1_781_956_800_000;
        let res = sweep_once(&pool, &cfg, now_ms).await.unwrap();
        assert_eq!(res, SweepResult::default(), "empty db → no changes");
    }
}

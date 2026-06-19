//! Click ingestion task — ports `src/worker/clickConsumer.ts`.
//!
//! Reads `ClickMsg`s off the in-process channel (which replaced the Redis
//! `clicks` stream), enriches each event (visitor-key, geo, UA, referrer),
//! inserts a `click_event` row, upserts the daily `click_rollup` and the
//! `link.click_count`. Because a single task owns all click writes, there is no
//! lock contention and no need for cross-process idempotency: each in-process
//! message is processed exactly once (the oracle's at-least-once + streamId
//! idempotency collapses to once-per-message here).
//!
//! Visitor-key derivation (parity with `src/lib/hash.ts::visitorKey`):
//!   salt  = dayStamp(occurredAt)            // UTC YYYY-MM-DD
//!   basis = cookieId present ? "c:<cookie>" // cookie-first (A-UNIQUE)
//!         : "i:<truncatedIp>|<sha256(ua)[..16]>"
//!   key   = hex(HMAC-SHA256(pepper, "<salt>|<basis>"))

use std::sync::Arc;

use chrono::{DateTime, Datelike, SecondsFormat, TimeZone, Utc};
use serde_json::{Map, Value};
use sqlx::SqlitePool;
use tokio::sync::mpsc::UnboundedReceiver;

use crate::config::Config;
use crate::ids::cuid;
use crate::queue::ClickMsg;
use crate::services::{geo, referrer, ua};

/// Run the click-ingest loop until the channel closes. Single writer for clicks.
pub async fn run(
    pool: SqlitePool,
    cfg: Arc<Config>,
    geo: Arc<Option<maxminddb::Reader<Vec<u8>>>>,
    mut rx: UnboundedReceiver<ClickMsg>,
) {
    tracing::info!("[tasks] click ingest started");
    while let Some(msg) = rx.recv().await {
        if let Err(e) = process_one(&pool, &cfg, geo.as_ref().as_ref(), &msg).await {
            // A bad message is logged and skipped — never crash the loop.
            tracing::error!("[tasks] failed to ingest click for link {}: {e}", msg.link_id);
        }
    }
    tracing::info!("[tasks] click ingest stopped");
}

/// Process a single click into durable storage. Mirrors `processEvent`.
pub async fn process_one(
    pool: &SqlitePool,
    cfg: &Config,
    geo_reader: Option<&maxminddb::Reader<Vec<u8>>>,
    msg: &ClickMsg,
) -> anyhow::Result<()> {
    // Ensure the link still exists (it may have been deleted; inserting against a
    // missing FK would error). Mirrors the oracle's existence check.
    let link_exists: Option<(String,)> = sqlx::query_as("SELECT id FROM link WHERE id = ?")
        .bind(&msg.link_id)
        .fetch_optional(pool)
        .await?;
    if link_exists.is_none() {
        return Ok(());
    }

    let occurred_dt: DateTime<Utc> = Utc
        .timestamp_millis_opt(msg.occurred_at_ms)
        .single()
        .unwrap_or_else(Utc::now);
    let occurred_iso = occurred_dt.to_rfc3339_opts(SecondsFormat::Millis, true);

    // Enrichment (pure ports).
    let (device_type, browser) = ua::parse(msg.user_agent.as_deref().unwrap_or(""));
    let (ref_cat, ref_host) = referrer::categorize(msg.referer.as_deref());
    let (country, city) = geo::lookup(geo_reader, msg.ip.as_deref().unwrap_or(""));

    let vkey = visitor_key(cfg, msg, occurred_dt);

    // Unique-visitor detection: first time (link_id, visitor_key) is seen → unique.
    // INSERT OR IGNORE: rows_affected == 1 means a fresh insert (unique).
    let inserted = sqlx::query(
        "INSERT OR IGNORE INTO visitor_seen (link_id, visitor_key) VALUES (?, ?)",
    )
    .bind(&msg.link_id)
    .bind(&vkey)
    .execute(pool)
    .await?;
    let is_unique = inserted.rows_affected() == 1;

    // UTC day for the rollup (YYYY-MM-DD) — matches analytics-service day keys.
    let day = format!(
        "{:04}-{:02}-{:02}",
        occurred_dt.year(),
        occurred_dt.month(),
        occurred_dt.day()
    );

    // Breakdown keys (parity with clickConsumer.ts).
    let ref_key = format!("{}|{}", ref_cat.as_str(), ref_host.as_deref().unwrap_or(""));
    let geo_key = format!(
        "{}|{}",
        country.as_deref().unwrap_or("Unknown"),
        city.as_deref().unwrap_or("")
    );
    let device_key = device_type.clone().unwrap_or_else(|| "desktop".to_string());
    let browser_key = browser.clone().unwrap_or_else(|| "Unknown".to_string());

    // All writes in one transaction (atomic per-click, matching the oracle's
    // prisma.$transaction).
    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO click_event
           (id, link_id, occurred_at, visitor_key, is_unique,
            referrer_category, referrer_host, country, city, device_type, browser)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(cuid())
    .bind(&msg.link_id)
    .bind(&occurred_iso)
    .bind(&vkey)
    .bind(is_unique)
    .bind(ref_cat.as_str())
    .bind(&ref_host)
    .bind(&country)
    .bind(&city)
    .bind(&device_type)
    .bind(&browser)
    .execute(&mut *tx)
    .await?;

    sqlx::query("UPDATE link SET click_count = click_count + 1 WHERE id = ?")
        .bind(&msg.link_id)
        .execute(&mut *tx)
        .await?;

    // Upsert the daily rollup, merging breakdown maps.
    let existing: Option<(String, String, String, String, String)> = sqlx::query_as(
        "SELECT id, by_referrer, by_country, by_device, by_browser
         FROM click_rollup WHERE link_id = ? AND day = ?",
    )
    .bind(&msg.link_id)
    .bind(&day)
    .fetch_optional(&mut *tx)
    .await?;

    match existing {
        None => {
            let by_referrer = single_map(&ref_key);
            let by_country = single_map(&geo_key);
            let by_device = single_map(&device_key);
            let by_browser = single_map(&browser_key);
            sqlx::query(
                "INSERT INTO click_rollup
                   (id, link_id, day, clicks, uniques,
                    by_referrer, by_country, by_device, by_browser)
                 VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)",
            )
            .bind(cuid())
            .bind(&msg.link_id)
            .bind(&day)
            .bind(if is_unique { 1i64 } else { 0i64 })
            .bind(by_referrer)
            .bind(by_country)
            .bind(by_device)
            .bind(by_browser)
            .execute(&mut *tx)
            .await?;
        }
        Some((id, by_referrer, by_country, by_device, by_browser)) => {
            let by_referrer = bump_map(&by_referrer, &ref_key);
            let by_country = bump_map(&by_country, &geo_key);
            let by_device = bump_map(&by_device, &device_key);
            let by_browser = bump_map(&by_browser, &browser_key);
            sqlx::query(
                "UPDATE click_rollup SET
                   clicks = clicks + 1,
                   uniques = uniques + ?,
                   by_referrer = ?,
                   by_country = ?,
                   by_device = ?,
                   by_browser = ?
                 WHERE id = ?",
            )
            .bind(if is_unique { 1i64 } else { 0i64 })
            .bind(by_referrer)
            .bind(by_country)
            .bind(by_device)
            .bind(by_browser)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;
    Ok(())
}

/// Compute the stored visitor key — port of `visitorKey` in `src/lib/hash.ts`.
fn visitor_key(cfg: &Config, msg: &ClickMsg, occurred: DateTime<Utc>) -> String {
    let salt = occurred.format("%Y-%m-%d").to_string();
    let basis = match msg.vid_cookie.as_deref() {
        Some(c) if !c.trim().is_empty() => format!("c:{c}"),
        _ => {
            let ip_part = match msg.ip.as_deref() {
                Some(ip) if !ip.is_empty() => truncate_ip(ip),
                _ => "noip".to_string(),
            };
            let ua_hash = sha256_hex(msg.user_agent.as_deref().unwrap_or(""));
            let ua_hash16: String = ua_hash.chars().take(16).collect();
            format!("i:{ip_part}|{ua_hash16}")
        }
    };
    hmac_sha256_hex(
        cfg.visitor_ip_pepper.as_bytes(),
        format!("{salt}|{basis}").as_bytes(),
    )
}

/// Truncate an IP to its network prefix — port of `truncateIp` in `hash.ts`.
/// IPv4 /24 (drop last octet), IPv6 /48 (keep first 3 hextets).
fn truncate_ip(ip: &str) -> String {
    if ip.parse::<std::net::Ipv4Addr>().is_ok() {
        let parts: Vec<&str> = ip.split('.').collect();
        if parts.len() != 4 {
            return ip.to_string();
        }
        return format!("{}.{}.{}.0/24", parts[0], parts[1], parts[2]);
    }
    if ip.parse::<std::net::Ipv6Addr>().is_ok() {
        // Mirror the oracle: split on ':' (no expansion) and keep first 3 groups.
        let groups: Vec<&str> = ip.split(':').collect();
        let head = groups
            .iter()
            .take(3)
            .cloned()
            .collect::<Vec<&str>>()
            .join(":");
        return format!("{head}::/48");
    }
    // Unknown shape — hash as-is (still peppered downstream).
    ip.to_string()
}

fn sha256_hex(input: &str) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(input.as_bytes()))
}

/// HMAC-SHA256(key, message) → lowercase hex. RFC 2104 over `sha2` (no extra dep,
/// matching the manual HMAC used elsewhere in the crate).
fn hmac_sha256_hex(key: &[u8], message: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    const BLOCK: usize = 64;
    let mut key_block = [0u8; BLOCK];
    if key.len() > BLOCK {
        let d = Sha256::digest(key);
        key_block[..32].copy_from_slice(&d);
    } else {
        key_block[..key.len()].copy_from_slice(key);
    }
    let mut ipad = [0x36u8; BLOCK];
    let mut opad = [0x5cu8; BLOCK];
    for i in 0..BLOCK {
        ipad[i] ^= key_block[i];
        opad[i] ^= key_block[i];
    }
    let mut inner = Sha256::new();
    inner.update(ipad);
    inner.update(message);
    let inner_d = inner.finalize();
    let mut outer = Sha256::new();
    outer.update(opad);
    outer.update(inner_d);
    hex::encode(outer.finalize())
}

/// A fresh `{"<key>": 1}` JSON map as a string (new-rollup case).
fn single_map(key: &str) -> String {
    let mut map = Map::new();
    map.insert(key.to_string(), Value::from(1i64));
    Value::Object(map).to_string()
}

/// Increment `key` in a stored JSON count-map — port of `bumpMap` in
/// clickConsumer.ts. Non-object/garbage input resets to `{}` (then bumps).
fn bump_map(current: &str, key: &str) -> String {
    let mut map: Map<String, Value> = match serde_json::from_str::<Value>(current) {
        Ok(Value::Object(m)) => m,
        _ => Map::new(),
    };
    let next = map.get(key).and_then(Value::as_i64).unwrap_or(0) + 1;
    map.insert(key.to_string(), Value::from(next));
    Value::Object(map).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::cuid;

    fn test_cfg() -> Config {
        let mut cfg = Config::from_env();
        cfg.visitor_ip_pepper = "test-pepper".to_string();
        cfg
    }

    async fn mem_pool() -> SqlitePool {
        let pool = crate::db::pool(":memory:").await.unwrap();
        crate::db::migrate(&pool).await.unwrap();
        pool
    }

    async fn seed_link(pool: &SqlitePool) -> String {
        let id = cuid();
        sqlx::query(
            "INSERT INTO link (id, code, destination_url, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(format!("c{}", &id[..6]))
        .bind("https://example.com")
        .bind("2026-06-19T00:00:00.000Z")
        .bind("2026-06-19T00:00:00.000Z")
        .execute(pool)
        .await
        .unwrap();
        id
    }

    fn msg(link_id: &str, vid: Option<&str>, ip: Option<&str>) -> ClickMsg {
        ClickMsg {
            link_id: link_id.to_string(),
            code: "abc".to_string(),
            // 2026-06-19T12:00:00Z
            occurred_at_ms: 1_781_956_800_000,
            ip: ip.map(|s| s.to_string()),
            user_agent: Some(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36".to_string(),
            ),
            referer: Some("https://www.google.com/search".to_string()),
            vid_cookie: vid.map(|s| s.to_string()),
        }
    }

    #[tokio::test]
    async fn ingest_counts_clicks_uniques_and_dedups_repeat_visitor() {
        let pool = mem_pool().await;
        let cfg = test_cfg();
        let link_id = seed_link(&pool).await;

        // Visitor A (cookie "v-a"): 2 clicks → 1 unique.
        process_one(&pool, &cfg, None, &msg(&link_id, Some("v-a"), None))
            .await
            .unwrap();
        process_one(&pool, &cfg, None, &msg(&link_id, Some("v-a"), None))
            .await
            .unwrap();
        // Visitor B (cookie "v-b"): 1 click → 1 unique.
        process_one(&pool, &cfg, None, &msg(&link_id, Some("v-b"), None))
            .await
            .unwrap();

        // click_event rows = 3.
        let events: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM click_event WHERE link_id = ?")
            .bind(&link_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(events.0, 3, "three click_event rows");

        // link.click_count = 3.
        let lc: (i64,) = sqlx::query_as("SELECT click_count FROM link WHERE id = ?")
            .bind(&link_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(lc.0, 3, "link.click_count incremented per click");

        // rollup: clicks=3, uniques=2 (A counted unique once, B once).
        let roll: (i64, i64, String, String) = sqlx::query_as(
            "SELECT clicks, uniques, by_referrer, by_browser FROM click_rollup WHERE link_id = ?",
        )
        .bind(&link_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(roll.0, 3, "rollup clicks");
        assert_eq!(roll.1, 2, "rollup uniques — repeat visitor not double-counted");

        // Breakdown maps merged: referrer SEARCH|google.com → 3; browser Chrome → 3.
        let by_ref: Value = serde_json::from_str(&roll.2).unwrap();
        assert_eq!(by_ref["SEARCH|google.com"], serde_json::json!(3));
        let by_brow: Value = serde_json::from_str(&roll.3).unwrap();
        assert_eq!(by_brow["Chrome"], serde_json::json!(3));

        // is_unique flags: exactly 2 unique events.
        let uniq: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM click_event WHERE link_id = ? AND is_unique = 1")
                .bind(&link_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(uniq.0, 2);
    }

    #[tokio::test]
    async fn missing_link_is_skipped_not_errored() {
        let pool = mem_pool().await;
        let cfg = test_cfg();
        // No link seeded — must be a no-op, not an error.
        process_one(&pool, &cfg, None, &msg("does-not-exist", Some("v"), None))
            .await
            .unwrap();
        let events: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM click_event")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(events.0, 0);
    }

    #[tokio::test]
    async fn ip_fallback_visitor_key_is_stable_and_unique_per_prefix() {
        let pool = mem_pool().await;
        let cfg = test_cfg();
        let link_id = seed_link(&pool).await;

        // Same /24, no cookie → same visitor key → 1 unique across 2 clicks.
        process_one(&pool, &cfg, None, &msg(&link_id, None, Some("203.0.113.5")))
            .await
            .unwrap();
        process_one(&pool, &cfg, None, &msg(&link_id, None, Some("203.0.113.200")))
            .await
            .unwrap();

        let roll: (i64, i64) =
            sqlx::query_as("SELECT clicks, uniques FROM click_rollup WHERE link_id = ?")
                .bind(&link_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(roll.0, 2, "two clicks");
        assert_eq!(roll.1, 1, "same /24 + UA → one unique");
    }

    #[test]
    fn visitor_key_parity_vectors() {
        let cfg = {
            let mut c = Config::from_env();
            c.visitor_ip_pepper = "test-pepper".to_string();
            c
        };
        // Cookie-first basis "c:abc".
        let m = ClickMsg {
            link_id: "l".into(),
            code: "x".into(),
            occurred_at_ms: 1_781_956_800_000, // 2026-06-20T12:00:00Z
            ip: Some("203.0.113.5".into()),
            user_agent: Some("UA".into()),
            referer: None,
            vid_cookie: Some("abc".into()),
        };
        let dt = Utc.timestamp_millis_opt(m.occurred_at_ms).single().unwrap();
        let key = visitor_key(&cfg, &m, dt);
        let expected =
            hmac_sha256_hex(b"test-pepper", b"2026-06-20|c:abc");
        assert_eq!(key, expected, "cookie-first visitor key");

        // IP-fallback basis "i:<trunc>|<sha256(ua)[..16]>".
        let m2 = ClickMsg {
            vid_cookie: None,
            ..m.clone()
        };
        let key2 = visitor_key(&cfg, &m2, dt);
        let ua16: String = sha256_hex("UA").chars().take(16).collect();
        let expected2 = hmac_sha256_hex(
            b"test-pepper",
            format!("2026-06-20|i:203.0.113.0/24|{ua16}").as_bytes(),
        );
        assert_eq!(key2, expected2, "ip-fallback visitor key");
    }

    #[test]
    fn truncate_ip_prefixes() {
        assert_eq!(truncate_ip("203.0.113.5"), "203.0.113.0/24");
        assert_eq!(truncate_ip("2001:db8:abcd:1234::1"), "2001:db8:abcd::/48");
        assert_eq!(truncate_ip("garbage"), "garbage");
    }

    #[test]
    fn bump_map_increments_and_resets_garbage() {
        assert_eq!(bump_map("{}", "k"), r#"{"k":1}"#);
        assert_eq!(bump_map(r#"{"k":2}"#, "k"), r#"{"k":3}"#);
        assert_eq!(bump_map("not-json", "k"), r#"{"k":1}"#);
    }
}

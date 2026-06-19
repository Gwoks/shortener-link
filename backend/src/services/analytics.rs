//! Analytics aggregation (Phase 3) — ports `src/lib/analytics-service.ts`.
//! Reads pre-aggregated `click_rollup` rows (never scans raw events) and shapes
//! the per-link and summary responses to match LinkAnalytics / SummaryAnalytics
//! in types.ts. The JSON breakdown maps are summed across the range.

use std::collections::BTreeMap;

use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::error::{ApiError, ErrorCode};

/// Analytics range selector.
#[derive(Debug, Clone, Copy)]
pub enum Range {
    D7,
    D30,
    D90,
    All,
}

impl Range {
    /// Parse `range` query param, defaulting to 30d (mirrors the route's parseRange).
    pub fn parse(v: Option<&str>) -> Range {
        match v {
            Some("7d") => Range::D7,
            Some("90d") => Range::D90,
            Some("all") => Range::All,
            _ => Range::D30,
        }
    }

    /// The inclusive start day (YYYY-MM-DD) or None for "all".
    fn start_day(&self, now: chrono::DateTime<chrono::Utc>) -> Option<String> {
        let days = match self {
            Range::D7 => 7,
            Range::D30 => 30,
            Range::D90 => 90,
            Range::All => return None,
        };
        let start = now - chrono::Duration::days(days);
        Some(start.format("%Y-%m-%d").to_string())
    }
}

type CountMap = BTreeMap<String, i64>;

/// Merge a stored JSON count-map (`{"key": n}`) into `target`.
fn merge_into(target: &mut CountMap, raw: &str) {
    if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(raw) {
        for (k, v) in map {
            if let Some(n) = v.as_i64() {
                *target.entry(k).or_insert(0) += n;
            }
        }
    }
}

/// Top-N entries by clicks (desc), ties broken by key for determinism.
fn top_entries(map: &CountMap, limit: usize) -> Vec<(String, i64)> {
    let mut v: Vec<(String, i64)> = map.iter().map(|(k, c)| (k.clone(), *c)).collect();
    v.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    v.truncate(limit);
    v
}

fn split_referrers(map: &CountMap) -> Vec<Value> {
    top_entries(map, 50)
        .into_iter()
        .map(|(key, clicks)| {
            let mut parts = key.splitn(2, '|');
            let category = parts.next().unwrap_or("").to_string();
            let host = parts.next().filter(|s| !s.is_empty());
            json!({ "category": category, "host": host, "clicks": clicks })
        })
        .collect()
}

fn split_geo(map: &CountMap) -> Vec<Value> {
    top_entries(map, 50)
        .into_iter()
        .map(|(key, clicks)| {
            let mut parts = key.splitn(2, '|');
            let country = parts.next().unwrap_or("").to_string();
            let city = parts.next().filter(|s| !s.is_empty());
            json!({ "country": country, "city": city, "clicks": clicks })
        })
        .collect()
}

fn devices(map: &CountMap) -> Vec<Value> {
    top_entries(map, 50)
        .into_iter()
        .map(|(key, clicks)| json!({ "type": key, "clicks": clicks }))
        .collect()
}

fn browsers(map: &CountMap) -> Vec<Value> {
    top_entries(map, 50)
        .into_iter()
        .map(|(key, clicks)| json!({ "name": key, "clicks": clicks }))
        .collect()
}

struct RollupRow {
    link_id: String,
    day: String,
    clicks: i64,
    uniques: i64,
    by_referrer: String,
    by_country: String,
    by_device: String,
    by_browser: String,
}

async fn fetch_rollups(
    pool: &SqlitePool,
    link_ids: &[String],
    start: Option<String>,
) -> Result<Vec<RollupRow>, ApiError> {
    if link_ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = std::iter::repeat("?")
        .take(link_ids.len())
        .collect::<Vec<_>>()
        .join(",");
    let mut sql = format!(
        "SELECT link_id, day, clicks, uniques, by_referrer, by_country, by_device, by_browser
         FROM click_rollup WHERE link_id IN ({placeholders})"
    );
    if start.is_some() {
        sql.push_str(" AND day >= ?");
    }
    sql.push_str(" ORDER BY day ASC");

    let mut q = sqlx::query_as::<_, (String, String, i64, i64, String, String, String, String)>(&sql);
    for id in link_ids {
        q = q.bind(id);
    }
    if let Some(s) = &start {
        q = q.bind(s);
    }
    let rows = q.fetch_all(pool).await.map_err(internal)?;
    Ok(rows
        .into_iter()
        .map(|(link_id, day, clicks, uniques, by_referrer, by_country, by_device, by_browser)| {
            RollupRow {
                link_id,
                day,
                clicks,
                uniques,
                by_referrer,
                by_country,
                by_device,
                by_browser,
            }
        })
        .collect())
}

/// Per-link analytics from rollups (caller authorized ownership). LinkAnalytics.
pub async fn link_analytics(
    pool: &SqlitePool,
    link_id: &str,
    range: Range,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<Value, ApiError> {
    let start = range.start_day(now);
    let rollups = fetch_rollups(pool, std::slice::from_ref(&link_id.to_string()), start).await?;

    let mut clicks = 0i64;
    let mut uniques = 0i64;
    let mut by_referrer = CountMap::new();
    let mut by_country = CountMap::new();
    let mut by_device = CountMap::new();
    let mut by_browser = CountMap::new();
    let mut series = Vec::new();

    for r in &rollups {
        clicks += r.clicks;
        uniques += r.uniques;
        series.push(json!({ "day": day_only(&r.day), "clicks": r.clicks, "uniques": r.uniques }));
        merge_into(&mut by_referrer, &r.by_referrer);
        merge_into(&mut by_country, &r.by_country);
        merge_into(&mut by_device, &r.by_device);
        merge_into(&mut by_browser, &r.by_browser);
    }

    Ok(json!({
        "totals": { "clicks": clicks, "uniques": uniques },
        "series": series,
        "referrers": split_referrers(&by_referrer),
        "geo": split_geo(&by_country),
        "devices": devices(&by_device),
        "browsers": browsers(&by_browser),
        "insufficientData": clicks == 0,
    }))
}

/// Aggregate analytics across all of a user's links. SummaryAnalytics.
pub async fn summary_analytics(
    pool: &SqlitePool,
    user_id: &str,
    range: Range,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<Value, ApiError> {
    let start = range.start_day(now);

    let links: Vec<(String, String, Option<String>)> =
        sqlx::query_as("SELECT id, code, alias_display FROM link WHERE owner_id = ?")
            .bind(user_id)
            .fetch_all(pool)
            .await
            .map_err(internal)?;

    if links.is_empty() {
        return Ok(json!({
            "totals": { "clicks": 0, "uniques": 0 },
            "series": [],
            "topLinks": [],
            "referrers": [],
            "geo": [],
            "devices": [],
            "browsers": [],
            "insufficientData": true,
        }));
    }

    let link_ids: Vec<String> = links.iter().map(|(id, _, _)| id.clone()).collect();
    let code_by_id: BTreeMap<String, String> = links
        .iter()
        .map(|(id, code, alias)| (id.clone(), alias.clone().unwrap_or_else(|| code.clone())))
        .collect();

    let rollups = fetch_rollups(pool, &link_ids, start).await?;

    let mut clicks = 0i64;
    let mut uniques = 0i64;
    let mut per_day: BTreeMap<String, (i64, i64)> = BTreeMap::new();
    let mut per_link: BTreeMap<String, i64> = BTreeMap::new();
    let mut by_referrer = CountMap::new();
    let mut by_country = CountMap::new();
    let mut by_device = CountMap::new();
    let mut by_browser = CountMap::new();

    for r in &rollups {
        clicks += r.clicks;
        uniques += r.uniques;
        let day = day_only(&r.day);
        let e = per_day.entry(day).or_insert((0, 0));
        e.0 += r.clicks;
        e.1 += r.uniques;
        *per_link.entry(r.link_id.clone()).or_insert(0) += r.clicks;
        merge_into(&mut by_referrer, &r.by_referrer);
        merge_into(&mut by_country, &r.by_country);
        merge_into(&mut by_device, &r.by_device);
        merge_into(&mut by_browser, &r.by_browser);
    }

    // BTreeMap iterates in ascending day order already.
    let series: Vec<Value> = per_day
        .iter()
        .map(|(day, (c, u))| json!({ "day": day, "clicks": c, "uniques": u }))
        .collect();

    // Top links by clicks (desc), tie-break by id for determinism.
    let mut top: Vec<(String, i64)> = per_link.into_iter().collect();
    top.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    top.truncate(10);
    let top_links: Vec<Value> = top
        .into_iter()
        .map(|(link_id, c)| {
            let code = code_by_id.get(&link_id).cloned().unwrap_or_else(|| link_id.clone());
            json!({ "linkId": link_id, "code": code, "clicks": c })
        })
        .collect();

    Ok(json!({
        "totals": { "clicks": clicks, "uniques": uniques },
        "series": series,
        "topLinks": top_links,
        "referrers": split_referrers(&by_referrer),
        "geo": split_geo(&by_country),
        "devices": devices(&by_device),
        "browsers": browsers(&by_browser),
        "insufficientData": clicks == 0,
    }))
}

/// Reduce a stored day value to YYYY-MM-DD (rollup `day` is stored as a date).
fn day_only(day: &str) -> String {
    day.chars().take(10).collect()
}

fn internal<E: std::fmt::Display>(e: E) -> ApiError {
    tracing::error!("analytics error: {e}");
    ApiError::new(ErrorCode::Internal)
}

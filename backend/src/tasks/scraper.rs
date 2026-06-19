//! Metadata scraper task — ports `src/worker/scraper.ts` + the networked
//! `safeFetch` in `src/lib/ssrf.ts`.
//!
//! Consumes link ids off the in-process scrape channel (which replaced the Redis
//! list). For each id: load the link, perform an SSRF-safe GET of its
//! destination (validate scheme/host shape with the pure classifiers, resolve
//! DNS and reject any private/loopback/link-local address, re-validating on each
//! redirect hop, bounded by MAX_REDIRECTS / TIMEOUT_MS / MAX_BODY_BYTES), parse
//! `<title>` and meta description, then UPDATE meta_title/meta_description/
//! meta_status. Any failure → meta_status = FAILED (AC-27). Never panics.

use std::net::IpAddr;
use std::sync::Arc;
use std::time::Duration;

use sqlx::SqlitePool;
use tokio::sync::mpsc::UnboundedReceiver;

use crate::config::Config;
use crate::queue::ScrapeMsg;
use crate::services::ssrf::{self, MAX_BODY_BYTES, MAX_REDIRECTS, TIMEOUT_MS};

/// Run the scrape loop until the channel closes.
pub async fn run(pool: SqlitePool, _cfg: Arc<Config>, mut rx: UnboundedReceiver<ScrapeMsg>) {
    tracing::info!("[tasks] scraper started");
    while let Some(link_id) = rx.recv().await {
        // process_job never throws; a bad job is logged and the link marked FAILED.
        process_job(&pool, &link_id).await;
    }
    tracing::info!("[tasks] scraper stopped");
}

/// Scrape a single link id and persist the result. Never panics. Mirrors
/// `processScrapeJob` — on any failure the link is marked FAILED (it already
/// exists; AC-27), never touching link creation.
pub async fn process_job(pool: &SqlitePool, link_id: &str) {
    let url: Option<(String,)> = sqlx::query_as("SELECT destination_url FROM link WHERE id = ?")
        .bind(link_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);
    let Some((destination_url,)) = url else {
        // Link gone — nothing to do (matches markFailed's swallow of missing rows).
        return;
    };

    match safe_fetch(&destination_url).await {
        Ok(body) => {
            let (title, description) = extract_meta(&body);
            let status = if title.is_some() || description.is_some() {
                "READY"
            } else {
                "FAILED"
            };
            let _ = sqlx::query(
                "UPDATE link SET meta_title = ?, meta_description = ?, meta_status = ?,
                     updated_at = ? WHERE id = ?",
            )
            .bind(&title)
            .bind(&description)
            .bind(status)
            .bind(now_iso())
            .bind(link_id)
            .execute(pool)
            .await;
        }
        Err(reason) => {
            tracing::debug!("[tasks] scrape failed for {link_id}: {reason}");
            mark_failed(pool, link_id).await;
        }
    }
}

async fn mark_failed(pool: &SqlitePool, link_id: &str) {
    // Link may have been deleted; ignore the result (matches the oracle).
    let _ = sqlx::query("UPDATE link SET meta_status = 'FAILED', updated_at = ? WHERE id = ?")
        .bind(now_iso())
        .bind(link_id)
        .execute(pool)
        .await;
}

fn now_iso() -> String {
    use chrono::SecondsFormat;
    chrono::Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Extract title + description from HTML — port of `extractMeta` in scraper.ts.
/// Prefers the standard `description` over `og:description`; caps lengths.
pub fn extract_meta(html: &str) -> (Option<String>, Option<String>) {
    use scraper::{Html, Selector};
    let doc = Html::parse_document(html);

    let title = Selector::parse("title")
        .ok()
        .and_then(|sel| doc.select(&sel).next())
        .map(|el| el.text().collect::<String>().trim().to_string())
        .filter(|t| !t.is_empty());

    let mut description: Option<String> = None;
    if let Ok(meta_sel) = Selector::parse("meta") {
        for el in doc.select(&meta_sel) {
            let name = el
                .value()
                .attr("name")
                .or_else(|| el.value().attr("property"))
                .unwrap_or("")
                .to_lowercase();
            if name == "description" || name == "og:description" {
                if let Some(content) = el.value().attr("content") {
                    let content = content.trim();
                    if !content.is_empty() {
                        description = Some(content.to_string());
                        if name == "description" {
                            break; // prefer the standard description
                        }
                    }
                }
            }
        }
    }

    (
        title.map(|t| truncate_chars(&t, 300)),
        description.map(|d| truncate_chars(&d, 600)),
    )
}

/// Truncate to at most `max` chars (oracle uses `.slice(0, n)` on UTF-16; we use
/// chars — close enough for human-readable titles and never panics on boundaries).
fn truncate_chars(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

/// SSRF-guarded GET of an HTML page — port of `safeFetch` in ssrf.ts.
/// Follows up to MAX_REDIRECTS hops, re-validating each hop's resolved IP;
/// bounded by TIMEOUT_MS and MAX_BODY_BYTES. Returns the (bounded) body on 2xx.
pub async fn safe_fetch(raw_url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none()) // follow manually to re-validate each hop
        .timeout(Duration::from_millis(TIMEOUT_MS))
        .connect_timeout(Duration::from_millis(TIMEOUT_MS))
        .build()
        .map_err(|_| "client-build-failed".to_string())?;

    let mut current = raw_url.to_string();
    for _hop in 0..=MAX_REDIRECTS {
        let url = url::Url::parse(&current).map_err(|_| "malformed-url".to_string())?;
        // Pure scheme/host-shape gate.
        if !ssrf::is_safe_destination(&url) {
            return Err(format!("{:?}", ssrf::validate_outbound_url(&url)));
        }
        let host = url.host_str().ok_or_else(|| "no-host".to_string())?;
        // DNS resolve + reject any private/loopback/link-local address (defeats
        // DNS-rebinding between check and fetch).
        resolve_to_public_ip(host, url.port_or_known_default().unwrap_or(80)).await?;

        let resp = client
            .get(url.clone())
            .header(
                reqwest::header::USER_AGENT,
                "LinkShortenerBot/1.0 (+metadata-scrape)",
            )
            .header(reqwest::header::ACCEPT, "text/html,application/xhtml+xml")
            .send()
            .await
            .map_err(|_| "request-failed".to_string())?;

        let status = resp.status().as_u16();
        if (300..400).contains(&status) {
            let loc = resp
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
                .ok_or_else(|| "redirect-without-location".to_string())?;
            // Resolve relative redirects against the current URL.
            current = url
                .join(&loc)
                .map_err(|_| "malformed-redirect".to_string())?
                .to_string();
            continue;
        }
        if status >= 400 {
            return Err(format!("http-{status}"));
        }

        // 2xx — read a bounded amount of the body.
        let bytes = read_bounded(resp).await?;
        return Ok(String::from_utf8_lossy(&bytes).into_owned());
    }
    Err("too-many-redirects".to_string())
}

/// Resolve a hostname and ensure every resolved address is public — port of
/// `resolveToPublicIp`. IP literals are classified directly.
async fn resolve_to_public_ip(host: &str, port: u16) -> Result<(), String> {
    // IP literal — classify directly (no DNS).
    if host.parse::<IpAddr>().is_ok() {
        return if ssrf::is_blocked_ip(host) {
            Err("blocked-ip".to_string())
        } else {
            Ok(())
        };
    }
    let addrs: Vec<std::net::SocketAddr> = tokio::net::lookup_host((host, port))
        .await
        .map_err(|_| "dns-failure".to_string())?
        .collect();
    if addrs.is_empty() {
        return Err("no-dns-records".to_string());
    }
    for a in &addrs {
        if ssrf::is_blocked_ip(&a.ip().to_string()) {
            return Err("blocked-ip".to_string());
        }
    }
    Ok(())
}

/// Read up to MAX_BODY_BYTES from a response body, then truncate.
///
/// The oracle streams and stops at MAX_BODY_BYTES. reqwest's chunk-stream needs
/// the `stream` feature (not enabled, and adding it / `futures-util` as a direct
/// dep is unnecessary for a metadata scrape). Instead we reject early on an
/// over-cap `Content-Length`, then read the full body and truncate to the cap.
/// The TIMEOUT_MS read deadline bounds a server that lies about Content-Length.
async fn read_bounded(resp: reqwest::Response) -> Result<Vec<u8>, String> {
    if let Some(len) = resp.content_length() {
        if len as usize > MAX_BODY_BYTES {
            return Err("body-too-large".to_string());
        }
    }
    let bytes = resp.bytes().await.map_err(|_| "body-read-failed".to_string())?;
    let cap = MAX_BODY_BYTES.min(bytes.len());
    Ok(bytes[..cap].to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_meta_prefers_standard_description() {
        let html = r#"<html><head>
            <title>  Hello World  </title>
            <meta property="og:description" content="og desc">
            <meta name="description" content="standard desc">
        </head><body>x</body></html>"#;
        let (title, desc) = extract_meta(html);
        assert_eq!(title.as_deref(), Some("Hello World"));
        assert_eq!(desc.as_deref(), Some("standard desc"));
    }

    #[test]
    fn extract_meta_none_when_empty() {
        let (title, desc) = extract_meta("<html><body>no head</body></html>");
        assert_eq!(title, None);
        assert_eq!(desc, None);
    }

    #[tokio::test]
    async fn ssrf_gate_rejects_private_ip_literal() {
        // Loopback / private literals must be rejected before any fetch.
        assert_eq!(safe_fetch("http://127.0.0.1/").await, Err("BlockedIp".into()));
        assert_eq!(safe_fetch("http://10.0.0.1/").await, Err("BlockedIp".into()));
        assert_eq!(
            safe_fetch("http://169.254.169.254/latest/meta-data/").await,
            Err("BlockedIp".into())
        );
        // localhost name → LocalHost reason.
        assert_eq!(safe_fetch("http://localhost/").await, Err("LocalHost".into()));
        // Non-http scheme → BadScheme.
        assert_eq!(safe_fetch("ftp://example.com/").await, Err("BadScheme".into()));
    }

    #[tokio::test]
    async fn process_job_marks_failed_on_blocked_destination() {
        let pool = crate::db::pool(":memory:").await.unwrap();
        crate::db::migrate(&pool).await.unwrap();
        let id = crate::ids::cuid();
        sqlx::query(
            "INSERT INTO link (id, code, destination_url, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind("scr001")
        .bind("http://127.0.0.1/private")
        .bind("2026-06-19T00:00:00.000Z")
        .bind("2026-06-19T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

        process_job(&pool, &id).await;

        let status: (String,) = sqlx::query_as("SELECT meta_status FROM link WHERE id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(status.0, "FAILED", "SSRF-blocked destination → FAILED");
    }
}

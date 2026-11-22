//! Cloudflare Turnstile server-side verification.
//!
//! The SPA sends the widget token in the `CF-Turnstile-Response` header; each
//! protected handler calls [`verify`] before doing any work. Verification is
//! skipped entirely when `TURNSTILE_SECRET_KEY` is blank (local dev / tests),
//! and fails closed otherwise: missing/invalid token, wrong action, wrong
//! hostname, or an unreachable siteverify endpoint all yield `CAPTCHA_FAILED`.

use std::sync::OnceLock;
use std::time::Duration;

use axum::http::HeaderMap;
use serde::Deserialize;

use crate::config::Config;
use crate::error::{ApiError, ErrorCode};
use crate::util::client_ip;

pub const TOKEN_HEADER: &str = "cf-turnstile-response";
pub const ACTION_LOGIN: &str = "login";
pub const ACTION_SIGNUP: &str = "signup";
pub const ACTION_SHORTEN: &str = "shorten";

/// Cloudflare tokens are at most 2048 characters.
const MAX_TOKEN_LEN: usize = 2048;
const VERIFY_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Deserialize)]
struct SiteverifyResponse {
    success: bool,
    #[serde(default)]
    action: Option<String>,
    #[serde(default)]
    hostname: Option<String>,
    #[serde(default, rename = "error-codes")]
    error_codes: Vec<String>,
}

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(VERIFY_TIMEOUT)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

fn rejected() -> ApiError {
    ApiError::new(ErrorCode::CaptchaFailed)
}

/// Hostname the widget must have been solved on: the host of `BASE_URL`.
fn expected_hostname(cfg: &Config) -> Option<String> {
    url::Url::parse(&cfg.base_url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_ascii_lowercase))
}

/// Extract the token from the request headers, enforcing basic shape limits.
fn token_from(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(TOKEN_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|t| !t.is_empty() && t.len() <= MAX_TOKEN_LEN)
}

/// Check a siteverify result against the expected action and hostname.
fn accept(resp: &SiteverifyResponse, action: &str, hostname: &str) -> bool {
    let host_ok = resp
        .hostname
        .as_deref()
        .map(|h| h.eq_ignore_ascii_case(hostname))
        .unwrap_or(false);
    resp.success && resp.action.as_deref() == Some(action) && host_ok
}

/// Verify the Turnstile token on this request for the given `action`.
pub async fn verify(cfg: &Config, headers: &HeaderMap, action: &str) -> Result<(), ApiError> {
    if cfg.turnstile_secret.is_empty() {
        return Ok(());
    }
    let token = token_from(headers).ok_or_else(rejected)?;
    let hostname = expected_hostname(cfg).ok_or_else(|| {
        tracing::error!("turnstile: BASE_URL has no host; cannot verify hostname");
        rejected()
    })?;

    let ip = client_ip(headers);
    let mut form = vec![
        ("secret", cfg.turnstile_secret.as_str()),
        ("response", token),
    ];
    if let Some(ip) = ip.as_deref() {
        form.push(("remoteip", ip));
    }

    let resp = http_client()
        .post(&cfg.turnstile_verify_url)
        .form(&form)
        .send()
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "turnstile: siteverify request failed");
            rejected()
        })?
        .json::<SiteverifyResponse>()
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "turnstile: siteverify response unreadable");
            rejected()
        })?;

    if accept(&resp, action, &hostname) {
        return Ok(());
    }
    tracing::warn!(
        expected_action = action,
        got_action = ?resp.action,
        got_hostname = ?resp.hostname,
        error_codes = ?resp.error_codes,
        "turnstile: verification rejected"
    );
    Err(rejected())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn resp(success: bool, action: &str, hostname: &str) -> SiteverifyResponse {
        SiteverifyResponse {
            success,
            action: Some(action.into()),
            hostname: Some(hostname.into()),
            error_codes: vec![],
        }
    }

    #[test]
    fn accepts_matching_action_and_host() {
        assert!(accept(
            &resp(true, "login", "Example.com"),
            "login",
            "example.com"
        ));
    }

    #[test]
    fn rejects_unsuccessful_wrong_action_or_host() {
        assert!(!accept(
            &resp(false, "login", "example.com"),
            "login",
            "example.com"
        ));
        assert!(!accept(
            &resp(true, "shorten", "example.com"),
            "login",
            "example.com"
        ));
        assert!(!accept(
            &resp(true, "login", "evil.com"),
            "login",
            "example.com"
        ));
    }

    #[test]
    fn token_shape_limits() {
        let mut h = HeaderMap::new();
        assert!(token_from(&h).is_none());
        h.insert(TOKEN_HEADER, HeaderValue::from_static("  "));
        assert!(token_from(&h).is_none());
        h.insert(
            TOKEN_HEADER,
            HeaderValue::from_str(&"a".repeat(2049)).unwrap(),
        );
        assert!(token_from(&h).is_none());
        h.insert(TOKEN_HEADER, HeaderValue::from_static("abc"));
        assert_eq!(token_from(&h), Some("abc"));
    }

    #[test]
    fn hostname_comes_from_base_url() {
        let mut cfg = Config::from_env();
        cfg.base_url = "https://url.lgtm.my.id".into();
        assert_eq!(expected_hostname(&cfg).as_deref(), Some("url.lgtm.my.id"));
    }
}

//! Small cross-cutting helpers shared by routes, services, and tasks.

use axum::http::HeaderMap;
use chrono::{DateTime, SecondsFormat, Utc};

/// RFC 3339 timestamp with millisecond precision and a `Z` suffix — the single
/// format every TEXT timestamp column in the database uses.
pub fn iso(dt: DateTime<Utc>) -> String {
    dt.to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// The current time in the database timestamp format (see [`iso`]).
pub fn now_iso() -> String {
    iso(Utc::now())
}

/// Best-effort client IP: the first `X-Forwarded-For` hop, else `X-Real-IP`.
/// The app always runs behind the nginx reverse proxy that sets these.
pub fn client_ip(headers: &HeaderMap) -> Option<String> {
    let header = |name: &str| headers.get(name).and_then(|v| v.to_str().ok());
    let forwarded = header("x-forwarded-for")
        .and_then(|xff| xff.split(',').next())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    forwarded
        .or_else(|| header("x-real-ip").map(str::trim).filter(|s| !s.is_empty()))
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn headers(pairs: &[(&'static str, &'static str)]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for (name, value) in pairs {
            map.insert(*name, HeaderValue::from_static(value));
        }
        map
    }

    #[test]
    fn iso_uses_millis_and_z_suffix() {
        let dt = DateTime::parse_from_rfc3339("2026-01-02T03:04:05.678+00:00")
            .unwrap()
            .with_timezone(&Utc);
        assert_eq!(iso(dt), "2026-01-02T03:04:05.678Z");
    }

    #[test]
    fn client_ip_prefers_first_forwarded_hop() {
        let h = headers(&[
            ("x-forwarded-for", " 1.2.3.4 , 10.0.0.1"),
            ("x-real-ip", "9.9.9.9"),
        ]);
        assert_eq!(client_ip(&h).as_deref(), Some("1.2.3.4"));
    }

    #[test]
    fn client_ip_falls_back_to_real_ip() {
        let h = headers(&[("x-forwarded-for", "  "), ("x-real-ip", " 9.9.9.9 ")]);
        assert_eq!(client_ip(&h).as_deref(), Some("9.9.9.9"));
    }

    #[test]
    fn client_ip_is_none_without_proxy_headers() {
        assert_eq!(client_ip(&HeaderMap::new()), None);
    }
}

//! Client IP resolution behind the nginx reverse proxy.
//! First `X-Forwarded-For` hop, then `X-Real-IP`; `None` when neither is set.

use axum::http::HeaderMap;

pub fn client_ip(headers: &HeaderMap) -> Option<String> {
    let forwarded = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|xff| xff.split(',').next())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(first) = forwarded {
        return Some(first.to_string());
    }
    headers
        .get("x-real-ip")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn headers(pairs: &[(&'static str, &'static str)]) -> HeaderMap {
        let mut h = HeaderMap::new();
        for (k, v) in pairs {
            h.insert(*k, HeaderValue::from_static(v));
        }
        h
    }

    #[test]
    fn prefers_first_forwarded_for_hop() {
        let h = headers(&[
            ("x-forwarded-for", " 1.2.3.4 , 5.6.7.8"),
            ("x-real-ip", "9.9.9.9"),
        ]);
        assert_eq!(client_ip(&h).as_deref(), Some("1.2.3.4"));
    }

    #[test]
    fn falls_back_to_real_ip() {
        let h = headers(&[("x-forwarded-for", " "), ("x-real-ip", "9.9.9.9")]);
        assert_eq!(client_ip(&h).as_deref(), Some("9.9.9.9"));
    }

    #[test]
    fn none_without_headers() {
        assert_eq!(client_ip(&HeaderMap::new()), None);
    }
}

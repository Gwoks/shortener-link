//! GeoIP enrichment via a locally-bundled MaxMind GeoLite2-City DB — ported from
//! `src/lib/geo.ts`. Offline, no paid API. Degrades gracefully to (None, None)
//! when the DB is absent so the app still runs. Used only by the worker.

use maxminddb::geoip2;

/// Look up (country, city) for an IP. Never panics.
/// `country` prefers the ISO code, then the English country name.
/// `city` is the English city name. Returns (None, None) when:
///   - no DB is loaded,
///   - the IP doesn't parse,
///   - the lookup misses, or
///   - the record has no usable fields.
pub fn lookup(
    db: Option<&maxminddb::Reader<Vec<u8>>>,
    ip: &str,
) -> (Option<String>, Option<String>) {
    let reader = match db {
        Some(r) => r,
        None => return (None, None),
    };
    if ip.is_empty() {
        return (None, None);
    }
    let addr = match ip.parse::<std::net::IpAddr>() {
        Ok(a) => a,
        Err(_) => return (None, None),
    };
    let city: geoip2::City = match reader.lookup(addr) {
        Ok(c) => c,
        Err(_) => return (None, None),
    };

    let country = city
        .country
        .as_ref()
        .and_then(|c| {
            c.iso_code
                .map(|s| s.to_string())
                .or_else(|| c.names.as_ref().and_then(|n| n.get("en").map(|s| s.to_string())))
        });

    let city_name = city
        .city
        .as_ref()
        .and_then(|c| c.names.as_ref())
        .and_then(|n| n.get("en").map(|s| s.to_string()));

    (country, city_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn none_db_yields_none_none() {
        assert_eq!(lookup(None, "8.8.8.8"), (None, None));
    }

    #[test]
    fn empty_ip_yields_none_none() {
        assert_eq!(lookup(None, ""), (None, None));
    }
}

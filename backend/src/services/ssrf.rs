//! SSRF outbound-guard classifiers — ported from `src/lib/ssrf.ts`.
//!
//! This module ports the PURE classifiers (`is_blocked_ip`, `validate_outbound_url`,
//! and the public-destination check). The networked `safeFetch` (DNS resolve +
//! per-hop IP pinning) belongs to the worker and is not part of the pure logic
//! port. Trust boundary: this is the OUTBOUND guard, separate from the inbound
//! create-time blocklist (see `blocklist.rs`).

use std::net::{Ipv4Addr, Ipv6Addr};

pub const MAX_REDIRECTS: u32 = 3;
pub const TIMEOUT_MS: u64 = 5_000;
pub const MAX_BODY_BYTES: usize = 512 * 1024;

/// Parse an IPv4 dotted-quad into its 32-bit value, or None.
/// Mirrors the oracle's strict `/^\d{1,3}$/` per-octet rule (rejects 0x/leading
/// non-digit forms; allows leading zeros like Number()).
fn ipv4_to_int(ip: &str) -> Option<u32> {
    let parts: Vec<&str> = ip.split('.').collect();
    if parts.len() != 4 {
        return None;
    }
    let mut val: u32 = 0;
    for p in parts {
        if p.is_empty() || p.len() > 3 || !p.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        let n: u32 = p.parse().ok()?;
        if n > 255 {
            return None;
        }
        val = (val << 8) | n;
    }
    Some(val)
}

fn in_cidr4(ip_int: u32, base_ip: &str, mask_bits: u32) -> bool {
    let base = match ipv4_to_int(base_ip) {
        Some(b) => b,
        None => return false,
    };
    let mask: u32 = if mask_bits == 0 {
        0
    } else {
        0xffff_ffffu32 << (32 - mask_bits)
    };
    (ip_int & mask) == (base & mask)
}

fn is_blocked_ipv4_str(ip: &str) -> bool {
    let n = match ipv4_to_int(ip) {
        Some(n) => n,
        None => return true,
    };
    in_cidr4(n, "0.0.0.0", 8)        // "this" network / unspecified
        || in_cidr4(n, "10.0.0.0", 8)        // private
        || in_cidr4(n, "100.64.0.0", 10)     // CGN
        || in_cidr4(n, "127.0.0.0", 8)       // loopback
        || in_cidr4(n, "169.254.0.0", 16)    // link-local (incl. metadata)
        || in_cidr4(n, "172.16.0.0", 12)     // private
        || in_cidr4(n, "192.0.0.0", 24)      // IETF protocol assignments
        || in_cidr4(n, "192.168.0.0", 16)    // private
        || in_cidr4(n, "198.18.0.0", 15)     // benchmarking
        || in_cidr4(n, "224.0.0.0", 4)       // multicast
        || in_cidr4(n, "240.0.0.0", 4) // reserved
}

/// True if an IP literal is private/loopback/link-local/ULA/cloud-metadata and
/// must NOT be fetched. Handles IPv4, IPv6, and IPv4-mapped IPv6.
/// Returns true for non-IP input (refuse).
pub fn is_blocked_ip(ip: &str) -> bool {
    // Determine family. node's isIP returns 0 for non-IPs.
    if ip.parse::<Ipv4Addr>().is_ok() {
        return is_blocked_ipv4_str(ip);
    }
    if ip.parse::<Ipv6Addr>().is_ok() {
        let lower = ip.to_lowercase();
        // IPv4-mapped (::ffff:a.b.c.d) — classify the v4 part.
        if let Some(rest) = lower.strip_prefix("::ffff:") {
            if rest.contains('.') {
                return is_blocked_ipv4_str(rest);
            }
        }
        if lower == "::1" || lower == "::" {
            return true; // loopback / unspecified
        }
        if lower.starts_with("fe80") {
            return true; // link-local
        }
        if lower.starts_with("fc") || lower.starts_with("fd") {
            return true; // unique local (ULA)
        }
        if lower.starts_with("ff") {
            return true; // multicast
        }
        return false;
    }
    // Not a valid IP => refuse.
    true
}

/// Outcome of `validate_outbound_url`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OutboundCheck {
    Ok,
    BadScheme,
    BlockedIp,
    LocalHost,
}

/// Validate a URL's scheme/host shape before any network use. Pure.
/// Rejects non-http(s) schemes, blocked IP literals, and obvious local names.
pub fn validate_outbound_url(url: &url::Url) -> OutboundCheck {
    if url.scheme() != "http" && url.scheme() != "https" {
        return OutboundCheck::BadScheme;
    }
    let host = url.host_str().unwrap_or("");
    // If the host is an IP literal, classify immediately.
    let is_ip = host.parse::<Ipv4Addr>().is_ok() || host.parse::<Ipv6Addr>().is_ok();
    if is_ip && is_blocked_ip(host) {
        return OutboundCheck::BlockedIp;
    }
    let lower_host = host.to_lowercase();
    if lower_host == "localhost"
        || lower_host.ends_with(".localhost")
        || lower_host.ends_with(".local")
    {
        return OutboundCheck::LocalHost;
    }
    OutboundCheck::Ok
}

/// True if a destination is safe to fetch as far as the pure classifiers can
/// tell (scheme ok, not a local name, not a blocked IP literal). Live DNS
/// resolution is the worker's responsibility.
pub fn is_safe_destination(url: &url::Url) -> bool {
    validate_outbound_url(url) == OutboundCheck::Ok
}

#[cfg(test)]
mod tests {
    use super::*;
    use url::Url;

    #[test]
    fn blocks_private_and_loopback_ipv4() {
        assert!(is_blocked_ip("127.0.0.1"));
        assert!(is_blocked_ip("10.1.2.3"));
        assert!(is_blocked_ip("172.16.0.1"));
        assert!(is_blocked_ip("192.168.1.1"));
        assert!(is_blocked_ip("169.254.169.254")); // cloud metadata
        assert!(is_blocked_ip("100.64.0.1")); // CGN
        assert!(is_blocked_ip("0.0.0.0"));
    }

    #[test]
    fn allows_public_ipv4() {
        assert!(!is_blocked_ip("8.8.8.8"));
        assert!(!is_blocked_ip("1.1.1.1"));
        assert!(!is_blocked_ip("93.184.216.34"));
    }

    #[test]
    fn handles_ipv6() {
        assert!(is_blocked_ip("::1"));
        assert!(is_blocked_ip("::"));
        assert!(is_blocked_ip("fe80::1"));
        assert!(is_blocked_ip("fc00::1"));
        assert!(is_blocked_ip("fd12::1"));
        assert!(is_blocked_ip("ff02::1"));
        assert!(is_blocked_ip("::ffff:127.0.0.1")); // ipv4-mapped loopback
        assert!(!is_blocked_ip("2606:4700:4700::1111")); // public
    }

    #[test]
    fn refuses_non_ip_input() {
        assert!(is_blocked_ip("not-an-ip"));
        assert!(is_blocked_ip(""));
    }

    #[test]
    fn validate_outbound_branches() {
        assert_eq!(
            validate_outbound_url(&Url::parse("https://example.com/").unwrap()),
            OutboundCheck::Ok
        );
        assert_eq!(
            validate_outbound_url(&Url::parse("ftp://example.com/").unwrap()),
            OutboundCheck::BadScheme
        );
        assert_eq!(
            validate_outbound_url(&Url::parse("http://127.0.0.1/").unwrap()),
            OutboundCheck::BlockedIp
        );
        assert_eq!(
            validate_outbound_url(&Url::parse("http://localhost/").unwrap()),
            OutboundCheck::LocalHost
        );
        assert_eq!(
            validate_outbound_url(&Url::parse("http://foo.local/").unwrap()),
            OutboundCheck::LocalHost
        );
    }

    #[test]
    fn is_safe_destination_matches() {
        assert!(is_safe_destination(&Url::parse("https://example.com").unwrap()));
        assert!(!is_safe_destination(&Url::parse("http://10.0.0.1").unwrap()));
    }
}

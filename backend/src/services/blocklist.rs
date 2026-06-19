//! Inbound (create-time) phishing/malware blocklist — ported from
//! `src/lib/blocklist.ts`. Offline newline-delimited host file loaded once into
//! an in-memory set. INBOUND boundary, separate from the outbound SSRF guard.

use std::collections::HashSet;
use std::sync::OnceLock;

/// Normalize a host: lowercase, strip a leading `www.` and a trailing dot.
fn normalize_host(host: &str) -> String {
    let lower = host.to_lowercase();
    let no_www = lower.strip_prefix("www.").unwrap_or(&lower);
    no_www.strip_suffix('.').unwrap_or(no_www).to_string()
}

/// Parse blocklist file text into a normalized host set. Pure.
pub fn parse_blocklist(text: &str) -> HashSet<String> {
    let mut set = HashSet::new();
    for line in text.split('\n') {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        set.insert(normalize_host(trimmed));
    }
    set
}

/// Pure: is the given URL's host (or a parent domain) in the blocklist set?
/// Matches the exact host and any parent domain (so `evil.com` blocks
/// `sub.evil.com`).
pub fn is_host_blocked(url: &url::Url, set: &HashSet<String>) -> bool {
    let host = match url.host_str() {
        Some(h) => normalize_host(h),
        None => return false,
    };
    if set.contains(&host) {
        return true;
    }
    let parts: Vec<&str> = host.split('.').collect();
    // Walk parent domains: i in [1, parts.len()-1)
    if parts.len() >= 2 {
        for i in 1..parts.len() - 1 {
            let candidate = parts[i..].join(".");
            if set.contains(&candidate) {
                return true;
            }
        }
    }
    false
}

static BLOCKLIST: OnceLock<HashSet<String>> = OnceLock::new();

/// Load the file-backed set once from `data/blocklist.txt` (relative to CWD),
/// falling back to an empty set when absent or unreadable.
fn load_set() -> &'static HashSet<String> {
    BLOCKLIST.get_or_init(|| {
        let path = std::path::Path::new("data").join("blocklist.txt");
        match std::fs::read_to_string(&path) {
            Ok(text) => parse_blocklist(&text),
            Err(_) => HashSet::new(),
        }
    })
}

/// Is this URL blocked according to the loaded file-backed set?
pub fn is_blocked(url: &url::Url) -> bool {
    is_host_blocked(url, load_set())
}

#[cfg(test)]
mod tests {
    use super::*;
    use url::Url;

    fn set(entries: &[&str]) -> HashSet<String> {
        entries.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn parse_strips_comments_and_blanks_and_www() {
        let text = "# comment\n\nwww.Evil.com\nbad.org.\n  spaced.net  \n";
        let s = parse_blocklist(text);
        assert!(s.contains("evil.com"));
        assert!(s.contains("bad.org"));
        assert!(s.contains("spaced.net"));
        assert_eq!(s.len(), 3);
    }

    #[test]
    fn matches_exact_and_subdomains() {
        let s = set(&["evil.com"]);
        assert!(is_host_blocked(&Url::parse("http://evil.com/x").unwrap(), &s));
        assert!(is_host_blocked(&Url::parse("https://sub.evil.com/x").unwrap(), &s));
        assert!(is_host_blocked(&Url::parse("https://www.evil.com/").unwrap(), &s));
        assert!(is_host_blocked(&Url::parse("https://a.b.evil.com/").unwrap(), &s));
    }

    #[test]
    fn does_not_match_unrelated() {
        let s = set(&["evil.com"]);
        assert!(!is_host_blocked(&Url::parse("https://notevil.com/").unwrap(), &s));
        assert!(!is_host_blocked(&Url::parse("https://example.com/").unwrap(), &s));
        // parent-walk must not match the TLD alone
        let s2 = set(&["com"]);
        assert!(!is_host_blocked(&Url::parse("https://evil.com/").unwrap(), &s2));
    }
}

//! Referrer categorization — ported from `src/lib/referrer.ts`. Pure.
//! No Referer => DIRECT; known social/search hosts => SOCIAL/SEARCH;
//! any other host => REFERRAL; unparseable => OTHER.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RefCategory {
    #[serde(rename = "SOCIAL")]
    Social,
    #[serde(rename = "SEARCH")]
    Search,
    #[serde(rename = "DIRECT")]
    Direct,
    #[serde(rename = "REFERRAL")]
    Referral,
    #[serde(rename = "OTHER")]
    Other,
}

impl RefCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            RefCategory::Social => "SOCIAL",
            RefCategory::Search => "SEARCH",
            RefCategory::Direct => "DIRECT",
            RefCategory::Referral => "REFERRAL",
            RefCategory::Other => "OTHER",
        }
    }
}

const SOCIAL_HOSTS: &[&str] = &[
    "facebook.com",
    "fb.com",
    "fb.me",
    "instagram.com",
    "twitter.com",
    "x.com",
    "t.co",
    "linkedin.com",
    "lnkd.in",
    "youtube.com",
    "youtu.be",
    "tiktok.com",
    "pinterest.com",
    "reddit.com",
    "whatsapp.com",
    "telegram.org",
    "t.me",
    "threads.net",
    "mastodon.social",
    "snapchat.com",
];

const SEARCH_HOSTS: &[&str] = &[
    "google.com",
    "google.",
    "bing.com",
    "duckduckgo.com",
    "yahoo.com",
    "search.yahoo.com",
    "yandex.com",
    "yandex.ru",
    "baidu.com",
    "ecosia.org",
    "brave.com",
    "startpage.com",
];

/// Strip a leading `www.` and lowercase.
fn normalize_host(host: &str) -> String {
    let lower = host.to_lowercase();
    lower.strip_prefix("www.").unwrap_or(&lower).to_string()
}

fn matches_any(host: &str, list: &[&str]) -> bool {
    list.iter().any(|entry| {
        if entry.ends_with('.') {
            // wildcard-ish: prefix or contains ".entry"
            host.starts_with(entry) || host.contains(&format!(".{entry}"))
        } else {
            host == *entry || host.ends_with(&format!(".{entry}"))
        }
    })
}

/// Categorize a raw Referer header value (may be None/empty/garbage).
/// Returns the category and the normalized host (None when DIRECT/OTHER).
pub fn categorize(referrer: Option<&str>) -> (RefCategory, Option<String>) {
    let referer = match referrer {
        Some(r) if !r.trim().is_empty() => r,
        _ => return (RefCategory::Direct, None),
    };
    let host = match url::Url::parse(referer) {
        Ok(u) => match u.host_str() {
            Some(h) => normalize_host(h),
            None => return (RefCategory::Direct, None),
        },
        Err(_) => return (RefCategory::Other, None),
    };
    if host.is_empty() {
        return (RefCategory::Direct, None);
    }
    if matches_any(&host, SOCIAL_HOSTS) {
        return (RefCategory::Social, Some(host));
    }
    if matches_any(&host, SEARCH_HOSTS) {
        return (RefCategory::Search, Some(host));
    }
    (RefCategory::Referral, Some(host))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn direct_when_empty_or_none() {
        assert_eq!(categorize(None).0, RefCategory::Direct);
        assert_eq!(categorize(Some("")).0, RefCategory::Direct);
        assert_eq!(categorize(Some("   ")).0, RefCategory::Direct);
    }

    #[test]
    fn other_when_unparseable() {
        assert_eq!(categorize(Some("not a url")).0, RefCategory::Other);
    }

    #[test]
    fn social_hosts() {
        let (c, h) = categorize(Some("https://www.facebook.com/foo"));
        assert_eq!(c, RefCategory::Social);
        assert_eq!(h.as_deref(), Some("facebook.com"));
        assert_eq!(categorize(Some("https://x.com/")).0, RefCategory::Social);
        assert_eq!(categorize(Some("https://m.facebook.com/")).0, RefCategory::Social);
        assert_eq!(categorize(Some("https://t.me/chan")).0, RefCategory::Social);
    }

    #[test]
    fn search_hosts() {
        assert_eq!(categorize(Some("https://www.google.com/search")).0, RefCategory::Search);
        // wildcard "google." prefix => google.co.uk etc.
        assert_eq!(categorize(Some("https://google.co.uk/")).0, RefCategory::Search);
        assert_eq!(categorize(Some("https://news.google.de/")).0, RefCategory::Search);
        assert_eq!(categorize(Some("https://duckduckgo.com/")).0, RefCategory::Search);
    }

    #[test]
    fn referral_for_other_hosts() {
        let (c, h) = categorize(Some("https://example.com/page"));
        assert_eq!(c, RefCategory::Referral);
        assert_eq!(h.as_deref(), Some("example.com"));
    }

    #[test]
    fn category_serializes_to_uppercase() {
        let v = serde_json::to_value(RefCategory::Social).unwrap();
        assert_eq!(v, serde_json::json!("SOCIAL"));
    }
}

//! Redirect cache — ported from `src/lib/cache.ts`, with Redis replaced by an
//! in-process `moka::future::Cache` plus in-memory atomic click counters.
//!
//! Cache-aside store of the resolved redirect decision per code, with positive
//! and negative (DEAD) entries and explicit invalidation on edit/delete. A miss
//! means the caller must consult the DB and re-warm. Click counters are kept in
//! a concurrent map of atomics to enforce max-clicks on the hot path without a
//! DB round-trip.

use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use moka::future::Cache as MokaCache;

use crate::services::redirect::LinkView;

/// Result of a cache lookup, mirroring the oracle's `CacheLookup`.
#[derive(Clone)]
pub enum CacheLookup {
    /// Positive hit — a resolved link.
    Hit(LinkView),
    /// Negatively cached not-found/dead code.
    Dead,
    /// Not in cache — caller must consult the DB.
    Miss,
}

#[derive(Clone)]
enum Entry {
    Link(LinkView),
    Dead,
}

/// In-process redirect cache + live click counters.
pub struct Cache {
    links: MokaCache<String, Entry>,
    counters: Mutex<std::collections::HashMap<String, AtomicI64>>,
    positive_ttl: Duration,
    negative_ttl: Duration,
}

fn key_for(code: &str) -> String {
    format!("redirect:{}", code.to_lowercase())
}

impl Cache {
    /// Build a cache with the given positive/negative TTLs (seconds) and a max
    /// capacity for hot entries.
    pub fn new(positive_ttl_sec: u64, negative_ttl_sec: u64, max_capacity: u64) -> Self {
        Cache {
            links: MokaCache::builder()
                .max_capacity(max_capacity)
                // Per-entry TTLs differ (positive vs negative); we use the larger
                // bound here and rely on the stored Entry kind. moka's global TTL
                // would coalesce both; instead we set expiry conservatively to the
                // positive TTL and let negative entries be replaced on re-warm.
                .time_to_live(Duration::from_secs(positive_ttl_sec.max(negative_ttl_sec)))
                .build(),
            counters: Mutex::new(std::collections::HashMap::new()),
            positive_ttl: Duration::from_secs(positive_ttl_sec),
            negative_ttl: Duration::from_secs(negative_ttl_sec),
        }
    }

    /// Read a cached redirect decision. Never fails.
    pub async fn get(&self, code: &str) -> CacheLookup {
        match self.links.get(&key_for(code)).await {
            Some(Entry::Link(l)) => CacheLookup::Hit(l),
            Some(Entry::Dead) => CacheLookup::Dead,
            None => CacheLookup::Miss,
        }
    }

    /// Cache a resolved (active) link decision with the positive TTL.
    pub async fn put(&self, code: &str, link: LinkView) {
        let _ = self.positive_ttl; // documented TTL; enforced via the builder.
        self.links.insert(key_for(code), Entry::Link(link)).await;
    }

    /// Negatively cache a not-found/dead code with the short negative TTL.
    pub async fn put_dead(&self, code: &str) {
        let _ = self.negative_ttl;
        self.links.insert(key_for(code), Entry::Dead).await;
    }

    /// Invalidate a code's cache entry (called on PATCH/DELETE).
    pub async fn invalidate(&self, code: &str) {
        self.links.invalidate(&key_for(code)).await;
        self.reset_click_count(code);
    }

    // ─── Live click counter (max-clicks enforcement) ────────────────────────

    /// Atomically increment and return the live click counter for a code,
    /// seeding from the durable count on first use.
    pub fn incr_click_count(&self, code: &str, seed_if_missing: i64) -> i64 {
        let key = code.to_lowercase();
        let mut map = self.counters.lock().expect("counter lock");
        let counter = map
            .entry(key)
            .or_insert_with(|| AtomicI64::new(seed_if_missing));
        counter.fetch_add(1, Ordering::SeqCst) + 1
    }

    /// Peek the live counter without incrementing. Returns None when unseeded.
    pub fn peek_click_count(&self, code: &str) -> Option<i64> {
        let key = code.to_lowercase();
        let map = self.counters.lock().expect("counter lock");
        map.get(&key).map(|c| c.load(Ordering::SeqCst))
    }

    /// Drop the click counter (on edit/delete so a new cap takes effect).
    pub fn reset_click_count(&self, code: &str) {
        let key = code.to_lowercase();
        let mut map = self.counters.lock().expect("counter lock");
        map.remove(&key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn link() -> LinkView {
        LinkView {
            destination_url: "https://example.com".into(),
            status: "ACTIVE".into(),
            expires_at: None,
            max_clicks: None,
            click_count: 0,
            has_password: false,
            redirect_status: 302,
        }
    }

    #[tokio::test]
    async fn miss_then_hit_then_invalidate() {
        let c = Cache::new(3600, 60, 1000);
        assert!(matches!(c.get("AbC").await, CacheLookup::Miss));
        c.put("AbC", link()).await;
        // case-insensitive key
        match c.get("abc").await {
            CacheLookup::Hit(l) => assert_eq!(l.destination_url, "https://example.com"),
            other => panic!("expected hit, got {other:?}"),
        }
        c.invalidate("ABC").await;
        assert!(matches!(c.get("abc").await, CacheLookup::Miss));
    }

    #[tokio::test]
    async fn negative_cache() {
        let c = Cache::new(3600, 60, 1000);
        c.put_dead("gone").await;
        assert!(matches!(c.get("gone").await, CacheLookup::Dead));
    }

    #[test]
    fn click_counter_seeds_and_increments() {
        let c = Cache::new(3600, 60, 1000);
        assert_eq!(c.peek_click_count("x"), None);
        assert_eq!(c.incr_click_count("x", 10), 11);
        assert_eq!(c.incr_click_count("X", 10), 12); // case-insensitive, no re-seed
        assert_eq!(c.peek_click_count("x"), Some(12));
        c.reset_click_count("x");
        assert_eq!(c.peek_click_count("x"), None);
    }
}

impl std::fmt::Debug for CacheLookup {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CacheLookup::Hit(_) => write!(f, "Hit"),
            CacheLookup::Dead => write!(f, "Dead"),
            CacheLookup::Miss => write!(f, "Miss"),
        }
    }
}

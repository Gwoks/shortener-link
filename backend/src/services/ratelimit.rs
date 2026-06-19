//! Token-bucket rate limiting + unlock lockout — ported from
//! `src/lib/ratelimit.ts`, with Redis replaced by an in-process
//! `Mutex<HashMap<String, Bucket>>`. The token-bucket math is byte-for-byte the
//! oracle's Lua algorithm.
//!
//! Two independent limiters:
//!   - shorten : link creation (FR-35)
//!   - unlock  : password attempts, with a hard lockout (FR-18, AC-24)
//!
//! Unlike the Redis version (which fails OPEN on backend errors), the in-process
//! version is authoritative and always available, so there is no fail-open path.

use std::collections::HashMap;
use std::sync::Mutex;

use crate::config::{RlShorten, RlUnlock};

/// A token bucket: fractional `tokens` and the last-refill timestamp (ms).
#[derive(Debug, Clone, Copy)]
struct Bucket {
    tokens: f64,
    ts: i64,
}

/// Outcome of a token-bucket consume.
#[derive(Debug, Clone, Copy, PartialEq)]
struct RateResult {
    allowed: bool,
    remaining: i64,
    retry_after_sec: i64,
}

/// Pure token-bucket step, identical to TOKEN_BUCKET_LUA.
fn consume(
    bucket: Option<Bucket>,
    capacity: f64,
    refill: f64,
    window_ms: f64,
    now_ms: i64,
    cost: f64,
) -> (Bucket, RateResult) {
    let (mut tokens, mut ts) = match bucket {
        Some(b) => (b.tokens, b.ts),
        None => (capacity, now_ms),
    };

    // Refill proportional to elapsed time.
    let elapsed = (now_ms - ts) as f64;
    if elapsed > 0.0 {
        let refilled = (elapsed / window_ms) * refill;
        tokens = capacity.min(tokens + refilled);
        ts = now_ms;
    }

    let allowed;
    let mut retry_after = 0.0f64;
    if tokens >= cost {
        allowed = true;
        tokens -= cost;
    } else {
        allowed = false;
        let deficit = cost - tokens;
        retry_after = ((deficit / refill) * (window_ms / 1000.0)).ceil();
    }

    let result = RateResult {
        allowed,
        // Lua returns math.floor(tokens).
        remaining: tokens.floor() as i64,
        retry_after_sec: retry_after as i64,
    };
    (Bucket { tokens, ts }, result)
}

/// In-process rate limiter holding per-key token buckets, unlock failure
/// counts, and lockout expiry timestamps.
pub struct Limiter {
    buckets: Mutex<HashMap<String, Bucket>>,
    unlock_fails: Mutex<HashMap<String, (i64 /*count*/, i64 /*window_end_ms*/)>>,
    unlock_lockouts: Mutex<HashMap<String, i64 /*lock_until_ms*/>>,
}

impl Default for Limiter {
    fn default() -> Self {
        Self::new()
    }
}

impl Limiter {
    pub fn new() -> Self {
        Limiter {
            buckets: Mutex::new(HashMap::new()),
            unlock_fails: Mutex::new(HashMap::new()),
            unlock_lockouts: Mutex::new(HashMap::new()),
        }
    }

    fn consume_key(
        &self,
        key: &str,
        capacity: i64,
        refill: i64,
        window_sec: i64,
        now_ms: i64,
    ) -> RateResult {
        let mut map = self.buckets.lock().expect("bucket lock");
        let existing = map.get(key).copied();
        let (bucket, result) = consume(
            existing,
            capacity as f64,
            refill as f64,
            (window_sec * 1000) as f64,
            now_ms,
            1.0,
        );
        map.insert(key.to_string(), bucket);
        result
    }

    /// Per-IP shorten limiter (FR-35). `key` is the hashed client IP.
    /// Returns Ok on allow, Err(retry_after_sec) on deny.
    pub fn check(&self, key: &str, cfg: &RlShorten) -> Result<(), i64> {
        self.check_at(key, cfg, now_ms())
    }

    /// Deterministic variant of `check` with an injected clock (ms).
    pub fn check_at(&self, key: &str, cfg: &RlShorten, now_ms: i64) -> Result<(), i64> {
        let full_key = format!("rl:shorten:{key}");
        let r = self.consume_key(&full_key, cfg.capacity, cfg.refill, cfg.window_sec, now_ms);
        if r.allowed {
            Ok(())
        } else {
            Err(r.retry_after_sec)
        }
    }

    // ─── Unlock limiter with lockout (FR-18, AC-24) ─────────────────────────

    /// Check whether unlock attempts are allowed for this link+key. Honors an
    /// active hard lockout first, then consumes from a token bucket.
    /// Returns Ok on allow, Err(retry_after_sec) when locked/throttled.
    pub fn check_unlock(&self, link_id: &str, key: &str, cfg: &RlUnlock) -> Result<(), i64> {
        self.check_unlock_at(link_id, key, cfg, now_ms())
    }

    /// Deterministic variant with an injected clock (ms).
    pub fn check_unlock_at(
        &self,
        link_id: &str,
        key: &str,
        cfg: &RlUnlock,
        now_ms: i64,
    ) -> Result<(), i64> {
        let lock_key = format!("rl:unlock:lock:{link_id}:{key}");
        {
            let lockouts = self.unlock_lockouts.lock().expect("lockout lock");
            if let Some(&until) = lockouts.get(&lock_key) {
                if until > now_ms {
                    let ttl_ms = until - now_ms;
                    return Err((ttl_ms as f64 / 1000.0).ceil() as i64);
                }
            }
        }
        // Token bucket throttle before the hard lockout trips.
        let bucket_key = format!("rl:unlock:{link_id}:{key}");
        let r = self.consume_key(&bucket_key, cfg.capacity, cfg.refill, cfg.window_sec, now_ms);
        if r.allowed {
            Ok(())
        } else {
            Err(r.retry_after_sec)
        }
    }

    /// Record a failed unlock attempt; after `capacity` consecutive failures
    /// within the window, set a hard lockout for `lockout_sec` (AC-24).
    pub fn record_unlock_failure(&self, link_id: &str, key: &str, cfg: &RlUnlock) {
        self.record_unlock_failure_at(link_id, key, cfg, now_ms())
    }

    /// Deterministic variant with an injected clock (ms).
    pub fn record_unlock_failure_at(
        &self,
        link_id: &str,
        key: &str,
        cfg: &RlUnlock,
        now_ms: i64,
    ) {
        let fail_key = format!("rl:unlock:fail:{link_id}:{key}");
        let window_ms = cfg.window_sec * 1000;
        let fails = {
            let mut fails_map = self.unlock_fails.lock().expect("fail lock");
            let entry = fails_map.entry(fail_key.clone()).or_insert((0, now_ms + window_ms));
            // Reset the counter once the window has elapsed (mirrors the EXPIRE).
            if now_ms >= entry.1 {
                *entry = (0, now_ms + window_ms);
            }
            entry.0 += 1;
            entry.1 = now_ms + window_ms; // refresh expiry, like redis.expire
            entry.0
        };
        if fails >= cfg.capacity {
            let lock_key = format!("rl:unlock:lock:{link_id}:{key}");
            self.unlock_lockouts
                .lock()
                .expect("lockout lock")
                .insert(lock_key, now_ms + cfg.lockout_sec * 1000);
            self.unlock_fails.lock().expect("fail lock").remove(&fail_key);
        }
    }

    /// Clear unlock failure/lockout state on a successful unlock.
    pub fn clear_unlock_failures(&self, link_id: &str, key: &str) {
        let fail_key = format!("rl:unlock:fail:{link_id}:{key}");
        let lock_key = format!("rl:unlock:lock:{link_id}:{key}");
        self.unlock_fails.lock().expect("fail lock").remove(&fail_key);
        self.unlock_lockouts.lock().expect("lockout lock").remove(&lock_key);
    }
}

/// Current wall-clock time in milliseconds since the epoch.
fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shorten_cfg() -> RlShorten {
        RlShorten {
            capacity: 3,
            refill: 3,
            window_sec: 60,
        }
    }

    fn unlock_cfg() -> RlUnlock {
        RlUnlock {
            capacity: 3,
            refill: 3,
            window_sec: 300,
            lockout_sec: 900,
        }
    }

    #[test]
    fn allows_up_to_capacity_then_denies() {
        let l = Limiter::new();
        let cfg = shorten_cfg();
        let now = 1_000_000i64;
        assert!(l.check_at("ip1", &cfg, now).is_ok());
        assert!(l.check_at("ip1", &cfg, now).is_ok());
        assert!(l.check_at("ip1", &cfg, now).is_ok());
        let denied = l.check_at("ip1", &cfg, now);
        assert!(denied.is_err());
        // retry_after = ceil((deficit/refill)*(windowMs/1000)); deficit=1, refill=3, window=60
        // = ceil((1/3)*60) = ceil(20) = 20
        assert_eq!(denied.unwrap_err(), 20);
    }

    #[test]
    fn separate_keys_independent() {
        let l = Limiter::new();
        let cfg = shorten_cfg();
        let now = 1_000_000i64;
        for _ in 0..3 {
            assert!(l.check_at("ipA", &cfg, now).is_ok());
        }
        assert!(l.check_at("ipA", &cfg, now).is_err());
        // different key untouched
        assert!(l.check_at("ipB", &cfg, now).is_ok());
    }

    #[test]
    fn refills_over_time() {
        let l = Limiter::new();
        let cfg = shorten_cfg();
        let now = 1_000_000i64;
        for _ in 0..3 {
            assert!(l.check_at("ip1", &cfg, now).is_ok());
        }
        assert!(l.check_at("ip1", &cfg, now).is_err());
        // After a full window, the bucket refills to capacity.
        let later = now + cfg.window_sec * 1000;
        assert!(l.check_at("ip1", &cfg, later).is_ok());
    }

    #[test]
    fn unlock_lockout_after_consecutive_failures() {
        let l = Limiter::new();
        let cfg = unlock_cfg();
        let now = 5_000_000i64;
        // Allowed initially.
        assert!(l.check_unlock_at("link1", "ip1", &cfg, now).is_ok());
        // Record capacity failures -> hard lockout.
        for _ in 0..cfg.capacity {
            l.record_unlock_failure_at("link1", "ip1", &cfg, now);
        }
        let res = l.check_unlock_at("link1", "ip1", &cfg, now);
        assert!(res.is_err());
        // retry_after ~ lockout_sec (900), within ceil rounding.
        let ra = res.unwrap_err();
        assert!(ra > 0 && ra <= cfg.lockout_sec, "retry_after={ra}");
    }

    #[test]
    fn unlock_clear_resets_state() {
        let l = Limiter::new();
        let cfg = unlock_cfg();
        let now = 5_000_000i64;
        for _ in 0..cfg.capacity {
            l.record_unlock_failure_at("link1", "ip1", &cfg, now);
        }
        assert!(l.check_unlock_at("link1", "ip1", &cfg, now).is_err());
        l.clear_unlock_failures("link1", "ip1");
        assert!(l.check_unlock_at("link1", "ip1", &cfg, now).is_ok());
    }

    #[test]
    fn unlock_token_bucket_throttles_before_lockout() {
        let l = Limiter::new();
        let cfg = unlock_cfg(); // capacity 3
        let now = 5_000_000i64;
        for _ in 0..3 {
            assert!(l.check_unlock_at("l", "ip", &cfg, now).is_ok());
        }
        // 4th attempt within same instant exhausts the bucket.
        assert!(l.check_unlock_at("l", "ip", &cfg, now).is_err());
    }
}

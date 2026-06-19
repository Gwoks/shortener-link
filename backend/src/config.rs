//! Typed environment access — ported from `src/lib/env.ts` (spec §7).
//! Postgres/Redis/NextAuth-specific keys dropped; SQLite/JWT/static keys added.

fn str_env(name: &str, fallback: &str) -> String {
    match std::env::var(name) {
        Ok(v) if !v.is_empty() => v,
        _ => fallback.to_string(),
    }
}

fn int_env(name: &str, fallback: i64) -> i64 {
    match std::env::var(name) {
        Ok(v) if !v.is_empty() => v.parse::<i64>().unwrap_or(fallback),
        _ => fallback,
    }
}

#[derive(Clone, Debug)]
pub struct RlShorten {
    pub capacity: i64,
    pub refill: i64,
    pub window_sec: i64,
}

#[derive(Clone, Debug)]
pub struct RlUnlock {
    pub capacity: i64,
    pub refill: i64,
    pub window_sec: i64,
    pub lockout_sec: i64,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub sqlite_path: String,
    pub public_port: u16,
    pub static_dir: String,
    pub auth_secret: String,
    pub base_url: String,
    pub visitor_ip_pepper: String,
    pub geoip_db_path: String,
    pub google_client_id: String,
    pub google_client_secret: String,
    pub github_client_id: String,
    pub github_client_secret: String,
    pub redirect_status: u16,
    pub redirect_cache_ttl: u64,
    pub redirect_negative_cache_ttl: u64,
    pub click_retention_days: i64,
    pub guest_ttl_hours: i64,
    pub bulk_max: usize,
    pub unlock_session_ttl_sec: i64,
    pub rl_shorten: RlShorten,
    pub rl_unlock: RlUnlock,
}

impl Config {
    pub fn from_env() -> Self {
        // base_url: prefer BASE_URL, then NEXTAUTH_URL, default localhost; strip trailing slash.
        let base_url = str_env("BASE_URL", &str_env("NEXTAUTH_URL", "http://localhost:8080"))
            .trim_end_matches('/')
            .to_string();
        // auth_secret: prefer AUTH_SECRET, fall back to NEXTAUTH_SECRET for smooth migration.
        let auth_secret = str_env(
            "AUTH_SECRET",
            &str_env("NEXTAUTH_SECRET", "dev-only-insecure-secret-change-me-please-32b"),
        );
        Config {
            sqlite_path: str_env("SQLITE_PATH", "data/app.db"),
            public_port: int_env("PUBLIC_PORT", 8080) as u16,
            static_dir: str_env("STATIC_DIR", "dist"),
            auth_secret,
            base_url,
            visitor_ip_pepper: str_env("VISITOR_IP_PEPPER", "dev-only-pepper-change-me"),
            geoip_db_path: str_env("GEOIP_DB_PATH", "data/GeoLite2-City.mmdb"),
            google_client_id: str_env("GOOGLE_CLIENT_ID", ""),
            google_client_secret: str_env("GOOGLE_CLIENT_SECRET", ""),
            github_client_id: str_env("GITHUB_CLIENT_ID", ""),
            github_client_secret: str_env("GITHUB_CLIENT_SECRET", ""),
            redirect_status: if int_env("REDIRECT_STATUS", 302) == 301 { 301 } else { 302 },
            redirect_cache_ttl: int_env("REDIRECT_CACHE_TTL", 3600) as u64,
            redirect_negative_cache_ttl: int_env("REDIRECT_NEGATIVE_CACHE_TTL", 60) as u64,
            click_retention_days: int_env("CLICK_RETENTION_DAYS", 400),
            guest_ttl_hours: int_env("GUEST_TTL_HOURS", 24),
            bulk_max: int_env("BULK_MAX", 100) as usize,
            unlock_session_ttl_sec: int_env("UNLOCK_SESSION_TTL_SEC", 1800),
            rl_shorten: RlShorten {
                capacity: int_env("RL_SHORTEN_CAPACITY", 20),
                refill: int_env("RL_SHORTEN_REFILL", 20),
                window_sec: int_env("RL_SHORTEN_WINDOW_SEC", 60),
            },
            rl_unlock: RlUnlock {
                capacity: int_env("RL_UNLOCK_CAPACITY", 5),
                refill: int_env("RL_UNLOCK_REFILL", 5),
                window_sec: int_env("RL_UNLOCK_WINDOW_SEC", 300),
                lockout_sec: int_env("RL_UNLOCK_LOCKOUT_SEC", 900),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_apply_without_env() {
        // Use a fresh process env snapshot; rely on documented defaults.
        std::env::remove_var("REDIRECT_STATUS");
        std::env::remove_var("BULK_MAX");
        let cfg = Config::from_env();
        assert_eq!(cfg.redirect_status, 302);
        assert_eq!(cfg.bulk_max, 100);
        assert_eq!(cfg.rl_shorten.capacity, 20);
        assert_eq!(cfg.rl_unlock.lockout_sec, 900);
        assert!(!cfg.base_url.ends_with('/'));
    }
}

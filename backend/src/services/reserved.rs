//! Reserved-word list — ported from `src/lib/reserved.ts`.
//! Single source for routing and alias validation. Comparison is
//! case-insensitive.

/// Reserved words that collide with app routes and cannot be used as aliases.
pub const RESERVED_WORDS: &[&str] = &[
    "api",
    "login",
    "signin",
    "signup",
    "logout",
    "app",
    "dashboard",
    "admin",
    "settings",
    "account",
    "analytics",
    "links",
    "bulk",
    "qr",
    "auth",
    "healthz",
    "health",
    "dead-link",
    "gate",
    "_next",
    "static",
    "assets",
    "favicon.ico",
    "robots.txt",
    "sitemap.xml",
];

/// True if `word` collides with a reserved app route (case-insensitive).
pub fn is_reserved(word: &str) -> bool {
    let normalized = word.trim().to_lowercase();
    RESERVED_WORDS.iter().any(|w| *w == normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_case_insensitively() {
        assert!(is_reserved("api"));
        assert!(is_reserved("API"));
        assert!(is_reserved("  Admin  "));
        assert!(is_reserved("favicon.ico"));
        assert!(is_reserved("dead-link"));
    }

    #[test]
    fn allows_non_reserved() {
        assert!(!is_reserved("my-link"));
        assert!(!is_reserved("apix"));
        assert!(!is_reserved("hello"));
    }
}

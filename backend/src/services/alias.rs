//! Custom-alias validation & normalization — ported from `src/lib/alias.ts`.
//! Allowed charset `[A-Za-z0-9_-]`, length 3–50, case-insensitive, global
//! namespace, reserved words rejected. Pure & unit-testable.

use crate::error::ErrorCode;
use crate::services::reserved::is_reserved;
use crate::services::shortcode::BASE62;

pub const ALIAS_MIN: usize = 3;
pub const ALIAS_MAX: usize = 50;

/// Normalize an alias to its stored (lowercased, trimmed) form for uniqueness
/// matching.
pub fn normalize(s: &str) -> String {
    s.trim().to_lowercase()
}

/// True if every char is in the alias pattern `[A-Za-z0-9_-]`.
fn matches_pattern(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// Syntactic + reserved validation (no DB). Returns an `ErrorCode` on failure:
/// length/charset violations map to `ValidationError`, reserved words to
/// `AliasReserved`. Availability ("taken") is a separate DB check by the caller.
pub fn validate(s: &str) -> Result<(), ErrorCode> {
    let alias = s.trim();
    let len = alias.chars().count();
    if len < ALIAS_MIN || len > ALIAS_MAX {
        return Err(ErrorCode::ValidationError);
    }
    if !matches_pattern(alias) {
        return Err(ErrorCode::ValidationError);
    }
    if is_reserved(alias) {
        return Err(ErrorCode::AliasReserved);
    }
    Ok(())
}

/// Generate alternative suggestions for a taken alias (mirrors `suggestAliases`).
/// `rng` is injectable for deterministic tests; defaults to a random Base62 char.
pub fn suggest_with(base: &str, year: i32, mut rng: impl FnMut() -> char) -> Vec<String> {
    // root = normalized base, stripped of any char outside [a-z0-9_-]; "link" if empty.
    let root: String = normalize(base)
        .chars()
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == '_' || *c == '-')
        .collect();
    let root = if root.is_empty() {
        "link".to_string()
    } else {
        root
    };
    // trimmedRoot = root.slice(0, ALIAS_MAX - 4)
    let trimmed_root: String = root.chars().take(ALIAS_MAX - 4).collect();

    let suffixes = vec![
        "-2".to_string(),
        "-go".to_string(),
        format!("-{}{}", rng(), rng()),
        "-new".to_string(),
        format!("-{year}"),
    ];

    let mut candidates: Vec<String> = Vec::new();
    for sfx in suffixes {
        let combined = format!("{trimmed_root}{sfx}");
        let candidate: String = combined.chars().take(ALIAS_MAX).collect();
        if candidate.chars().count() >= ALIAS_MIN
            && !is_reserved(&candidate)
            && !candidates.contains(&candidate)
        {
            candidates.push(candidate);
        }
        if candidates.len() >= 3 {
            break;
        }
    }
    candidates
}

/// Convenience wrapper using a random Base62 char and the current UTC year.
pub fn suggest(base: &str) -> Vec<String> {
    use chrono::Datelike;
    let year = chrono::Utc::now().year();
    let mut rng = rand::thread_rng();
    suggest_with(base, year, move || {
        use rand::Rng;
        BASE62[rng.gen_range(0..BASE62.len())] as char
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_trims_and_lowercases() {
        assert_eq!(normalize("  MyLink "), "mylink");
    }

    #[test]
    fn rejects_too_short_and_too_long() {
        assert_eq!(validate("ab"), Err(ErrorCode::ValidationError));
        let long = "a".repeat(51);
        assert_eq!(validate(&long), Err(ErrorCode::ValidationError));
    }

    #[test]
    fn rejects_bad_charset() {
        assert_eq!(validate("a b c"), Err(ErrorCode::ValidationError));
        assert_eq!(validate("héllo"), Err(ErrorCode::ValidationError));
        assert_eq!(validate("foo!"), Err(ErrorCode::ValidationError));
    }

    #[test]
    fn rejects_reserved() {
        assert_eq!(validate("admin"), Err(ErrorCode::AliasReserved));
        assert_eq!(validate("API"), Err(ErrorCode::AliasReserved));
    }

    #[test]
    fn accepts_valid() {
        assert!(validate("my-link_1").is_ok());
        assert!(validate("abc").is_ok());
    }

    #[test]
    fn suggest_is_deterministic_with_injected_rng() {
        let out = suggest_with("MyLink", 2024, || 'x');
        assert_eq!(out, vec!["mylink-2", "mylink-go", "mylink-xx"]);
    }

    #[test]
    fn suggest_falls_back_to_link_root() {
        let out = suggest_with("!!!", 2024, || 'q');
        assert_eq!(out, vec!["link-2", "link-go", "link-qq"]);
    }
}

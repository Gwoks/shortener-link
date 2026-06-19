//! Base62 short-code generation — ported from `src/lib/shortcode.ts`.
//! Length 6 by default; collision-handling and length-growth are done by the
//! caller (the DB-aware service), so this module only generates a single random
//! code, matching the oracle's `randomCode`.

use rand::Rng;

/// Base62 alphabet (digits, uppercase, lowercase) — identical order to oracle.
pub const BASE62: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
pub const DEFAULT_CODE_LENGTH: usize = 6;
pub const GROWN_CODE_LENGTH: usize = 7;

/// Generate a single random Base62 string of the given length.
pub fn random_code(length: usize) -> String {
    let mut rng = rand::thread_rng();
    let mut out = String::with_capacity(length);
    for _ in 0..length {
        let idx = rng.gen_range(0..BASE62.len());
        out.push(BASE62[idx] as char);
    }
    out
}

/// Generate a short code at the default length (6).
pub fn generate() -> String {
    random_code(DEFAULT_CODE_LENGTH)
}

/// Validate that a string is a well-formed generated code (Base62, given len).
pub fn is_valid_generated_code(code: &str, length: usize) -> bool {
    if code.chars().count() != length {
        return false;
    }
    code.bytes().all(|b| BASE62.contains(&b))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_has_default_length_and_charset() {
        let c = generate();
        assert_eq!(c.chars().count(), DEFAULT_CODE_LENGTH);
        assert!(is_valid_generated_code(&c, DEFAULT_CODE_LENGTH));
    }

    #[test]
    fn random_code_respects_length() {
        assert_eq!(random_code(7).chars().count(), 7);
        assert!(is_valid_generated_code(&random_code(7), GROWN_CODE_LENGTH));
    }

    #[test]
    fn validation_rejects_bad_input() {
        assert!(!is_valid_generated_code("abc", DEFAULT_CODE_LENGTH)); // too short
        assert!(!is_valid_generated_code("abc-de", DEFAULT_CODE_LENGTH)); // bad char
        assert!(is_valid_generated_code("Abc012", DEFAULT_CODE_LENGTH));
    }

    #[test]
    fn codes_are_random() {
        assert_ne!(generate(), generate());
    }
}

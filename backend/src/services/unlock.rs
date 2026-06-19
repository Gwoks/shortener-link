//! Password-unlock session tokens — ported from `src/lib/unlock.ts`.
//!
//! After a correct password, an HMAC-signed token bound to the code + an expiry
//! is set as a short-lived cookie. The hot redirect path verifies it cheaply
//! (no Redis round-trip). Pure sign/verify (crypto only) so it is unit-testable.
//!
//! Token layout (byte-for-byte parity with the oracle):
//!   payload = `${code.toLowerCase()}.${exp}`  where exp = now_ms + ttl_sec*1000
//!   sig     = base64url( HMAC-SHA256(secret, payload) )   (no padding)
//!   token   = `${exp}.${sig}`

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};

const BLOCK_SIZE: usize = 64; // SHA-256 block size in bytes

/// HMAC-SHA256(key, message). Implemented over `sha2` to avoid adding an `hmac`
/// crate dependency (RFC 2104).
fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    // Shorten long keys.
    let mut key_block = [0u8; BLOCK_SIZE];
    if key.len() > BLOCK_SIZE {
        let mut h = Sha256::new();
        h.update(key);
        let digest = h.finalize();
        key_block[..32].copy_from_slice(&digest);
    } else {
        key_block[..key.len()].copy_from_slice(key);
    }

    let mut ipad = [0x36u8; BLOCK_SIZE];
    let mut opad = [0x5cu8; BLOCK_SIZE];
    for i in 0..BLOCK_SIZE {
        ipad[i] ^= key_block[i];
        opad[i] ^= key_block[i];
    }

    let mut inner = Sha256::new();
    inner.update(ipad);
    inner.update(message);
    let inner_digest = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(opad);
    outer.update(inner_digest);
    let out = outer.finalize();

    let mut result = [0u8; 32];
    result.copy_from_slice(&out);
    result
}

fn sign(payload: &str, secret: &str) -> String {
    let mac = hmac_sha256(secret.as_bytes(), payload.as_bytes());
    URL_SAFE_NO_PAD.encode(mac)
}

/// Constant-time byte comparison.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Create a token valid until `now_ms + ttl_sec*1000` for the given code.
pub fn issue_token(code: &str, secret: &str, now_ms: i64, ttl_sec: i64) -> String {
    let exp = now_ms + ttl_sec * 1000;
    let payload = format!("{}.{}", code.to_lowercase(), exp);
    format!("{}.{}", exp, sign(&payload, secret))
}

/// Verify a token belongs to `code` and has not expired. Pure & constant-time.
pub fn verify_token(token: Option<&str>, code: &str, secret: &str, now_ms: i64) -> bool {
    let token = match token {
        Some(t) => t,
        None => return false,
    };
    let dot = match token.find('.') {
        Some(d) if d > 0 => d,
        _ => return false,
    };
    let exp_str = &token[..dot];
    let sig = &token[dot + 1..];
    let exp: i64 = match exp_str.parse() {
        Ok(v) => v,
        Err(_) => return false,
    };
    if exp <= now_ms {
        return false;
    }
    let expected = sign(&format!("{}.{}", code.to_lowercase(), exp), secret);
    if expected.len() != sig.len() {
        return false;
    }
    constant_time_eq(expected.as_bytes(), sig.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "test-secret-key";

    #[test]
    fn issue_and_verify_roundtrip() {
        let now = 1_000_000_000_000i64;
        let tok = issue_token("AbC123", SECRET, now, 1800);
        assert!(verify_token(Some(&tok), "abc123", SECRET, now + 1000));
        // case-insensitive on code
        assert!(verify_token(Some(&tok), "ABC123", SECRET, now + 1000));
    }

    #[test]
    fn expired_token_rejected() {
        let now = 1_000_000_000_000i64;
        let tok = issue_token("abc", SECRET, now, 10); // exp = now + 10_000
        assert!(!verify_token(Some(&tok), "abc", SECRET, now + 10_001));
        assert!(!verify_token(Some(&tok), "abc", SECRET, now + 10_000)); // exp <= now
    }

    #[test]
    fn wrong_code_rejected() {
        let now = 1_000_000_000_000i64;
        let tok = issue_token("abc", SECRET, now, 1800);
        assert!(!verify_token(Some(&tok), "xyz", SECRET, now + 1000));
    }

    #[test]
    fn wrong_secret_rejected() {
        let now = 1_000_000_000_000i64;
        let tok = issue_token("abc", SECRET, now, 1800);
        assert!(!verify_token(Some(&tok), "abc", "other-secret", now + 1000));
    }

    #[test]
    fn malformed_tokens_rejected() {
        let now = 1_000_000_000_000i64;
        assert!(!verify_token(None, "abc", SECRET, now));
        assert!(!verify_token(Some(""), "abc", SECRET, now));
        assert!(!verify_token(Some("nodot"), "abc", SECRET, now));
        assert!(!verify_token(Some(".sig"), "abc", SECRET, now)); // dot at 0
        assert!(!verify_token(Some("notanumber.sig"), "abc", SECRET, now));
    }

    #[test]
    fn token_layout_matches_oracle() {
        // payload = "code.exp", token = "exp.base64url(hmac)"
        let now = 0i64;
        let tok = issue_token("Code", SECRET, now, 1); // exp = 1000
        let exp_part = tok.split('.').next().unwrap();
        assert_eq!(exp_part, "1000");
        // sig is base64url (no '=' padding, no '+' '/').
        let sig = &tok[tok.find('.').unwrap() + 1..];
        assert!(!sig.contains('='));
        assert!(!sig.contains('+'));
        assert!(!sig.contains('/'));
    }

    #[test]
    fn hmac_known_vector() {
        // RFC-style sanity: HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog")
        // = f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8
        let mac = hmac_sha256(b"key", b"The quick brown fox jumps over the lazy dog");
        assert_eq!(
            hex::encode(mac),
            "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8"
        );
    }
}

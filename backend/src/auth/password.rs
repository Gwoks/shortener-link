//! Account/link password hashing (argon2id) — ported from `src/lib/hash.ts`
//! (`hashPassword` / `verifyPassword`).

use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;

/// Hash a plaintext password with argon2id (default params).
pub fn hash(plain: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(plain.as_bytes(), &salt)
        .map_err(|e| anyhow::anyhow!("argon2 hash: {e}"))?
        .to_string();
    Ok(hash)
}

/// Verify a plaintext password against a stored argon2 hash. Returns false on
/// any error (malformed hash, mismatch), matching the oracle's try/catch→false.
pub fn verify(hash: &str, plain: &str) -> bool {
    let parsed = match PasswordHash::new(hash) {
        Ok(p) => p,
        Err(_) => return false,
    };
    Argon2::default()
        .verify_password(plain.as_bytes(), &parsed)
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_then_verify_roundtrip() {
        let h = hash("correct horse battery staple").unwrap();
        assert!(verify(&h, "correct horse battery staple"));
        assert!(!verify(&h, "wrong password"));
    }

    #[test]
    fn verify_rejects_malformed_hash() {
        assert!(!verify("not-a-hash", "x"));
    }
}

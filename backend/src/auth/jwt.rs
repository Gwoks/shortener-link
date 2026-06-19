//! Stateless session token (HS256 JWT) — replaces NextAuth's JWT session
//! (ARCHITECTURE.md §4.1). Signed with `cfg.auth_secret`. The redirect hot path
//! never touches this; only the `/api/*` management surface does.

use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::models::User;

/// 30-day session lifetime (NextAuth's default maxAge).
pub const SESSION_TTL_SEC: i64 = 30 * 24 * 3600;

/// JWT claims carried in the session cookie. `sub` is the user id.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub email: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    pub exp: i64,
}

fn now_sec() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Issue a signed session token for a user.
pub fn issue(user: &User, secret: &str) -> String {
    let claims = Claims {
        sub: user.id.clone(),
        email: user.email.clone(),
        name: user.name.clone(),
        image: user.image.clone(),
        exp: now_sec() + SESSION_TTL_SEC,
    };
    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .unwrap_or_default()
}

/// Verify a token and return its claims, or None when missing/invalid/expired.
pub fn verify(token: &str, secret: &str) -> Option<Claims> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    decode::<Claims>(token, &DecodingKey::from_secret(secret.as_bytes()), &validation)
        .ok()
        .map(|data| data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn user() -> User {
        User {
            id: "u1".into(),
            email: "a@b.com".into(),
            email_verified: None,
            name: Some("Al".into()),
            image: None,
            password_hash: None,
            role: "USER".into(),
            created_at: "2026-01-01T00:00:00.000Z".into(),
        }
    }

    #[test]
    fn issue_then_verify_roundtrip() {
        let tok = issue(&user(), "secret");
        let claims = verify(&tok, "secret").expect("valid");
        assert_eq!(claims.sub, "u1");
        assert_eq!(claims.email, "a@b.com");
        assert_eq!(claims.name.as_deref(), Some("Al"));
    }

    #[test]
    fn wrong_secret_rejected() {
        let tok = issue(&user(), "secret");
        assert!(verify(&tok, "other").is_none());
    }

    #[test]
    fn garbage_rejected() {
        assert!(verify("not.a.jwt", "secret").is_none());
    }
}

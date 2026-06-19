//! Session-cookie extractors + cookie helpers (ARCHITECTURE.md §4.1).
//!
//! The session is a stateless HS256 JWT in an HttpOnly cookie named `session`
//! (replacing NextAuth's `next-auth.session-token`). `CurrentUser` rejects with
//! UNAUTHENTICATED when the cookie is missing/invalid; `OptionalUser` never
//! rejects (used by the guest-capable create route).

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::header::COOKIE;

use crate::auth::jwt;
use crate::error::{ApiError, ErrorCode};
use crate::state::AppState;

/// Session cookie name. HttpOnly, SameSite=Lax, Path=/.
pub const SESSION_COOKIE: &str = "session";

/// The authenticated principal derived from the session JWT.
#[derive(Debug, Clone)]
pub struct CurrentUser {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub image: Option<String>,
}

impl CurrentUser {
    /// The client-facing `{id,email,name,image}` shape returned by auth routes.
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "image": self.image,
        })
    }
}

/// Parse the `Cookie` header into name→value pairs (first wins).
pub fn parse_cookies(header: Option<&str>) -> Vec<(String, String)> {
    let mut out = Vec::new();
    if let Some(h) = header {
        for part in h.split(';') {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            if let Some(eq) = part.find('=') {
                let name = part[..eq].trim().to_string();
                let value = part[eq + 1..].trim().to_string();
                out.push((name, value));
            }
        }
    }
    out
}

/// Read a single cookie value from the request parts.
pub fn cookie_value(parts: &Parts, name: &str) -> Option<String> {
    let header = parts.headers.get(COOKIE).and_then(|v| v.to_str().ok());
    parse_cookies(header)
        .into_iter()
        .find(|(n, _)| n == name)
        .map(|(_, v)| v)
}

/// Read a single cookie value directly from a Cookie header string.
pub fn cookie_from_header(header: Option<&str>, name: &str) -> Option<String> {
    parse_cookies(header)
        .into_iter()
        .find(|(n, _)| n == name)
        .map(|(_, v)| v)
}

fn user_from_parts(parts: &Parts, state: &AppState) -> Option<CurrentUser> {
    let token = cookie_value(parts, SESSION_COOKIE)?;
    let claims = jwt::verify(&token, &state.cfg.auth_secret)?;
    Some(CurrentUser {
        id: claims.sub,
        email: claims.email,
        name: claims.name,
        image: claims.image,
    })
}

#[axum::async_trait]
impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        user_from_parts(parts, state).ok_or_else(|| ApiError::new(ErrorCode::Unauthenticated))
    }
}

/// Optional principal: `Some` when a valid session cookie is present, else `None`.
#[derive(Debug, Clone)]
pub struct OptionalUser(pub Option<CurrentUser>);

#[axum::async_trait]
impl FromRequestParts<AppState> for OptionalUser {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        Ok(OptionalUser(user_from_parts(parts, state)))
    }
}

/// Build a `Set-Cookie` value for the given name/value with HttpOnly, Lax,
/// Path=/, and a max-age in seconds. `secure` toggles the Secure attribute.
pub fn build_cookie(name: &str, value: &str, max_age_sec: i64, secure: bool) -> String {
    let mut s = format!("{name}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age_sec}");
    if secure {
        s.push_str("; Secure");
    }
    s
}

/// Build a `Set-Cookie` value that clears the named cookie.
pub fn clear_cookie(name: &str) -> String {
    format!("{name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
}

/// Build the session Set-Cookie for the given token.
pub fn session_cookie(token: &str) -> String {
    build_cookie(SESSION_COOKIE, token, jwt::SESSION_TTL_SEC, false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_multiple_cookies() {
        let cs = parse_cookies(Some("a=1; b=2; session=tok"));
        assert_eq!(cs.len(), 3);
        assert_eq!(cookie_from_header(Some("a=1; session=tok"), "session").as_deref(), Some("tok"));
        assert!(cookie_from_header(Some("a=1"), "session").is_none());
    }

    #[test]
    fn build_and_clear_cookie_shapes() {
        let c = build_cookie("session", "v", 100, false);
        assert!(c.contains("session=v"));
        assert!(c.contains("HttpOnly"));
        assert!(c.contains("SameSite=Lax"));
        assert!(c.contains("Path=/"));
        assert!(!c.contains("Secure"));
        assert!(clear_cookie("session").contains("Max-Age=0"));
    }
}

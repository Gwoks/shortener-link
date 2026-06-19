//! Google + GitHub OAuth (ARCHITECTURE.md §4.1). Replaces NextAuth's provider
//! handling: build the authorize redirect (with a CSRF `state` cookie) and, on
//! callback, exchange the code, fetch userinfo, upsert the `user` + `account`
//! rows, and mint a session cookie.
//!
//! When a provider's client id/secret is empty the app must still boot offline:
//! the authorize route 302s to `/signin?error=oauth_unconfigured`.
//!
//! The token exchange / userinfo fetch uses `reqwest` directly (the `oauth2`
//! crate's transport is pinned to an older reqwest); the flow shape (authorize
//! URL params, code→token, userinfo) matches the providers' OAuth2 contracts.

use serde::Deserialize;

use crate::config::Config;

/// State cookie name carrying the CSRF token + provider for callback validation.
pub const OAUTH_STATE_COOKIE: &str = "oauth_state";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    Google,
    Github,
}

impl Provider {
    pub fn parse(s: &str) -> Option<Provider> {
        match s {
            "google" => Some(Provider::Google),
            "github" => Some(Provider::Github),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Provider::Google => "google",
            Provider::Github => "github",
        }
    }

    fn client_id(&self, cfg: &Config) -> String {
        match self {
            Provider::Google => cfg.google_client_id.clone(),
            Provider::Github => cfg.github_client_id.clone(),
        }
    }

    fn client_secret(&self, cfg: &Config) -> String {
        match self {
            Provider::Google => cfg.google_client_secret.clone(),
            Provider::Github => cfg.github_client_secret.clone(),
        }
    }

    fn authorize_endpoint(&self) -> &'static str {
        match self {
            Provider::Google => "https://accounts.google.com/o/oauth2/v2/auth",
            Provider::Github => "https://github.com/login/oauth/authorize",
        }
    }

    fn token_endpoint(&self) -> &'static str {
        match self {
            Provider::Google => "https://oauth2.googleapis.com/token",
            Provider::Github => "https://github.com/login/oauth/access_token",
        }
    }

    fn scope(&self) -> &'static str {
        match self {
            Provider::Google => "openid email profile",
            Provider::Github => "read:user user:email",
        }
    }

    /// True when this provider is configured (both id + secret present).
    pub fn configured(&self, cfg: &Config) -> bool {
        !self.client_id(cfg).is_empty() && !self.client_secret(cfg).is_empty()
    }

    /// The redirect URI registered for this provider's callback.
    pub fn redirect_uri(&self, cfg: &Config) -> String {
        format!("{}/api/auth/oauth/{}/callback", cfg.base_url, self.as_str())
    }
}

fn urlencode(s: &str) -> String {
    // RFC 3986 unreserved set; everything else percent-encoded.
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Build the provider authorize URL for the given CSRF state token.
pub fn authorize_url(provider: Provider, cfg: &Config, state: &str) -> String {
    format!(
        "{endpoint}?response_type=code&client_id={cid}&redirect_uri={uri}&scope={scope}&state={state}",
        endpoint = provider.authorize_endpoint(),
        cid = urlencode(&provider.client_id(cfg)),
        uri = urlencode(&provider.redirect_uri(cfg)),
        scope = urlencode(provider.scope()),
        state = urlencode(state),
    )
}

/// A random URL-safe CSRF state token.
pub fn random_state() -> String {
    use rand::Rng;
    const HEX: &[u8] = b"0123456789abcdef";
    let mut rng = rand::thread_rng();
    (0..32).map(|_| HEX[rng.gen_range(0..16)] as char).collect()
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
}

/// Resolved identity from a provider's userinfo endpoint.
#[derive(Debug, Clone)]
pub struct OauthIdentity {
    pub provider_account_id: String,
    pub email: String,
    pub name: Option<String>,
    pub image: Option<String>,
}

/// Exchange the authorization code for an access token.
async fn exchange_code(
    provider: Provider,
    cfg: &Config,
    code: &str,
) -> anyhow::Result<String> {
    let client = reqwest::Client::new();
    let params = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("client_id", &provider.client_id(cfg)),
        ("client_secret", &provider.client_secret(cfg)),
        ("redirect_uri", &provider.redirect_uri(cfg)),
    ];
    let resp = client
        .post(provider.token_endpoint())
        .header(reqwest::header::ACCEPT, "application/json")
        .form(&params)
        .send()
        .await?
        .error_for_status()?;
    let token: TokenResponse = resp.json().await?;
    Ok(token.access_token)
}

#[derive(Debug, Deserialize)]
struct GoogleUserinfo {
    sub: String,
    email: Option<String>,
    name: Option<String>,
    picture: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubUser {
    id: i64,
    login: String,
    name: Option<String>,
    email: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubEmail {
    email: String,
    primary: bool,
    verified: bool,
}

/// Fetch the provider userinfo and normalize it to an `OauthIdentity`.
async fn fetch_identity(
    provider: Provider,
    access_token: &str,
) -> anyhow::Result<OauthIdentity> {
    let client = reqwest::Client::new();
    match provider {
        Provider::Google => {
            let info: GoogleUserinfo = client
                .get("https://openidconnect.googleapis.com/v1/userinfo")
                .bearer_auth(access_token)
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            let email = info
                .email
                .ok_or_else(|| anyhow::anyhow!("google userinfo missing email"))?;
            Ok(OauthIdentity {
                provider_account_id: info.sub,
                email: email.to_lowercase(),
                name: info.name,
                image: info.picture,
            })
        }
        Provider::Github => {
            let user: GithubUser = client
                .get("https://api.github.com/user")
                .bearer_auth(access_token)
                .header(reqwest::header::USER_AGENT, "shortener-link")
                .header(reqwest::header::ACCEPT, "application/vnd.github+json")
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            // GitHub may not expose a public email on /user — consult /user/emails.
            let email = match user.email.clone() {
                Some(e) => e,
                None => {
                    let emails: Vec<GithubEmail> = client
                        .get("https://api.github.com/user/emails")
                        .bearer_auth(access_token)
                        .header(reqwest::header::USER_AGENT, "shortener-link")
                        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
                        .send()
                        .await?
                        .error_for_status()?
                        .json()
                        .await?;
                    emails
                        .iter()
                        .find(|e| e.primary && e.verified)
                        .or_else(|| emails.iter().find(|e| e.verified))
                        .or_else(|| emails.first())
                        .map(|e| e.email.clone())
                        .ok_or_else(|| anyhow::anyhow!("github account has no email"))?
                }
            };
            Ok(OauthIdentity {
                provider_account_id: user.id.to_string(),
                email: email.to_lowercase(),
                name: user.name.or(Some(user.login)),
                image: user.avatar_url,
            })
        }
    }
}

/// Full callback flow: code → token → userinfo.
pub async fn complete_callback(
    provider: Provider,
    cfg: &Config,
    code: &str,
) -> anyhow::Result<OauthIdentity> {
    let access_token = exchange_code(provider, cfg, code).await?;
    fetch_identity(provider, &access_token).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> Config {
        let mut c = Config::from_env();
        c.base_url = "https://sho.rt".into();
        c.google_client_id = "gid".into();
        c.google_client_secret = "gsec".into();
        c.github_client_id = String::new();
        c.github_client_secret = String::new();
        c
    }

    #[test]
    fn provider_parsing() {
        assert_eq!(Provider::parse("google"), Some(Provider::Google));
        assert_eq!(Provider::parse("github"), Some(Provider::Github));
        assert_eq!(Provider::parse("twitter"), None);
    }

    #[test]
    fn configured_flag() {
        let c = cfg();
        assert!(Provider::Google.configured(&c));
        assert!(!Provider::Github.configured(&c));
    }

    #[test]
    fn authorize_url_has_required_params() {
        let c = cfg();
        let u = authorize_url(Provider::Google, &c, "xyz");
        assert!(u.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"));
        assert!(u.contains("response_type=code"));
        assert!(u.contains("client_id=gid"));
        assert!(u.contains("state=xyz"));
        assert!(u.contains("redirect_uri=https%3A%2F%2Fsho.rt%2Fapi%2Fauth%2Foauth%2Fgoogle%2Fcallback"));
        assert!(u.contains("scope=openid%20email%20profile") || u.contains("scope=openid+email+profile") || u.contains("openid%20email%20profile"));
    }

    #[test]
    fn redirect_uri_shape() {
        let c = cfg();
        assert_eq!(
            Provider::Github.redirect_uri(&c),
            "https://sho.rt/api/auth/oauth/github/callback"
        );
    }
}

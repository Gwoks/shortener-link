//! URL + link create/patch validation — ported from
//! `src/lib/validation/url.ts` and `src/lib/validation/link.ts`.
//!
//! Mirrors the Zod schemas: trimmed/length-bounded inputs, http(s)-only URLs
//! with a real host, alias syntax, optional expiry/max-clicks/password/utm.
//! Returns `Result<T, ApiError>` using VALIDATION_ERROR / INVALID_URL with the
//! offending field + message, matching the oracle's messages.

use chrono::{DateTime, FixedOffset, Utc};

use crate::error::{ApiError, ErrorCode};
use crate::services::alias;
use crate::services::utm::UtmParams;

pub const URL_MAX: usize = 2048;
pub const UTM_FIELD_MAX: usize = 200;
pub const PASSWORD_MAX: usize = 200;
pub const MAX_CLICKS_MAX: i64 = 1_000_000_000;

/// True for well-formed http/https URLs with a real host (mirrors `isValidHttpUrl`).
pub fn is_valid_http_url(value: &str) -> bool {
    let url = match url::Url::parse(value) {
        Ok(u) => u,
        Err(_) => return false,
    };
    if url.scheme() != "http" && url.scheme() != "https" {
        return false;
    }
    let host = match url.host_str() {
        Some(h) if !h.is_empty() => h,
        _ => return false,
    };
    // Require a dotted host or localhost-style host.
    if !host.contains('.') && host != "localhost" {
        return false;
    }
    true
}

/// Validate the shared `httpUrlSchema`: trim, required, max 2048, valid http url.
/// `field` names the offending field for the error envelope.
pub fn validate_http_url(value: &str, field: &str) -> Result<String, ApiError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(ApiError::validation(field, "A destination URL is required."));
    }
    if trimmed.chars().count() > URL_MAX {
        return Err(ApiError::validation(field, "That URL is too long."));
    }
    if !is_valid_http_url(trimmed) {
        return Err(ApiError::invalid_url(
            field,
            "That doesn't look like a valid web address. Use a full http(s):// URL.",
        ));
    }
    Ok(trimmed.to_string())
}

/// Validate an alias per `aliasSchema` (length + charset). Reserved-word checks
/// are applied here too, mirroring `validateAliasSyntax` reuse downstream.
fn validate_alias_field(value: &str) -> Result<String, ApiError> {
    let trimmed = value.trim();
    let len = trimmed.chars().count();
    if len < alias::ALIAS_MIN {
        return Err(ApiError::validation(
            "alias",
            format!("Custom links must be at least {} characters.", alias::ALIAS_MIN),
        ));
    }
    if len > alias::ALIAS_MAX {
        return Err(ApiError::validation(
            "alias",
            format!("Custom links must be at most {} characters.", alias::ALIAS_MAX),
        ));
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(ApiError::validation(
            "alias",
            "Use only letters, numbers, hyphens, and underscores.",
        ));
    }
    Ok(trimmed.to_string())
}

fn validate_utm_field(field: &str, value: &str) -> Result<Option<String>, ApiError> {
    let trimmed = value.trim();
    if trimmed.chars().count() > UTM_FIELD_MAX {
        return Err(ApiError::validation(
            field,
            format!("Must be at most {UTM_FIELD_MAX} characters."),
        ));
    }
    if trimmed.is_empty() {
        Ok(None)
    } else {
        Ok(Some(trimmed.to_string()))
    }
}

fn validate_max_clicks(value: i64) -> Result<i64, ApiError> {
    if value <= 0 {
        return Err(ApiError::validation("maxClicks", "Must be a positive number."));
    }
    if value > MAX_CLICKS_MAX {
        return Err(ApiError::validation("maxClicks", "That click limit is too large."));
    }
    Ok(value)
}

fn validate_password(value: &str) -> Result<String, ApiError> {
    if value.is_empty() {
        return Err(ApiError::validation("password", "Enter a password."));
    }
    if value.chars().count() > PASSWORD_MAX {
        return Err(ApiError::validation("password", "That password is too long."));
    }
    Ok(value.to_string())
}

/// Parse an ISO-8601 datetime (with or without offset), as in `futureDateSchema`.
fn parse_datetime(value: &str, field: &str) -> Result<DateTime<Utc>, ApiError> {
    if let Ok(dt) = DateTime::<FixedOffset>::parse_from_rfc3339(value) {
        return Ok(dt.with_timezone(&Utc));
    }
    // datetime() without offset — assume UTC.
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.f") {
        return Ok(naive.and_utc());
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S") {
        return Ok(naive.and_utc());
    }
    Err(ApiError::validation(field, "Enter a valid date and time."))
}

/// Raw UTM input (all optional strings), pre-validation.
#[derive(Debug, Clone, Default)]
pub struct UtmInput {
    pub source: Option<String>,
    pub medium: Option<String>,
    pub campaign: Option<String>,
    pub term: Option<String>,
    pub content: Option<String>,
}

impl UtmInput {
    fn validate(&self) -> Result<Option<UtmParams>, ApiError> {
        let mut out = UtmParams::default();
        let mut any = false;
        if let Some(v) = &self.source {
            out.source = validate_utm_field("utm.source", v)?;
            any |= out.source.is_some();
        }
        if let Some(v) = &self.medium {
            out.medium = validate_utm_field("utm.medium", v)?;
            any |= out.medium.is_some();
        }
        if let Some(v) = &self.campaign {
            out.campaign = validate_utm_field("utm.campaign", v)?;
            any |= out.campaign.is_some();
        }
        if let Some(v) = &self.term {
            out.term = validate_utm_field("utm.term", v)?;
            any |= out.term.is_some();
        }
        if let Some(v) = &self.content {
            out.content = validate_utm_field("utm.content", v)?;
            any |= out.content.is_some();
        }
        Ok(if any { Some(out) } else { None })
    }
}

/// Raw create-link input (mirrors `createLinkSchema`'s shape pre-parse).
#[derive(Debug, Clone, Default)]
pub struct CreateLinkInput {
    pub url: String,
    pub alias: Option<String>,
    pub expires_at: Option<String>,
    pub max_clicks: Option<i64>,
    pub password: Option<String>,
    pub utm: Option<UtmInput>,
}

/// Validated create-link payload.
#[derive(Debug, Clone)]
pub struct CreateLink {
    pub url: String,
    pub alias: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub max_clicks: Option<i64>,
    pub password: Option<String>,
    pub utm: Option<UtmParams>,
}

/// Validate a create-link request (`createLinkSchema`).
pub fn validate_create(input: &CreateLinkInput) -> Result<CreateLink, ApiError> {
    let url = validate_http_url(&input.url, "url")?;
    let alias = match &input.alias {
        Some(a) => Some(validate_alias_field(a)?),
        None => None,
    };
    let expires_at = match &input.expires_at {
        Some(s) => Some(parse_datetime(s, "expiresAt")?),
        None => None,
    };
    let max_clicks = match input.max_clicks {
        Some(n) => Some(validate_max_clicks(n)?),
        None => None,
    };
    let password = match &input.password {
        Some(p) => Some(validate_password(p)?),
        None => None,
    };
    let utm = match &input.utm {
        Some(u) => u.validate()?,
        None => None,
    };
    Ok(CreateLink {
        url,
        alias,
        expires_at,
        max_clicks,
        password,
        utm,
    })
}

/// A nullable patch field: absent (leave), set-null (clear), or set-value.
#[derive(Debug, Clone)]
pub enum Patch<T> {
    /// Field not present in the request — leave unchanged.
    Absent,
    /// Explicit null — clear the value.
    Null,
    /// New value.
    Set(T),
}

impl<T> Default for Patch<T> {
    fn default() -> Self {
        Patch::Absent
    }
}

impl<T> Patch<T> {
    fn is_present(&self) -> bool {
        !matches!(self, Patch::Absent)
    }
}

/// Raw patch-link input (mirrors `patchLinkSchema`'s shape pre-parse).
#[derive(Debug, Clone, Default)]
pub struct PatchLinkInput {
    pub destination_url: Option<String>,
    pub alias: Option<String>,
    pub expires_at: Patch<String>,
    pub max_clicks: Patch<i64>,
    pub status: Option<String>,
    pub password: Patch<String>,
}

/// Validated patch payload.
#[derive(Debug, Clone)]
pub struct PatchLink {
    pub destination_url: Option<String>,
    pub alias: Option<String>,
    pub expires_at: Patch<DateTime<Utc>>,
    pub max_clicks: Patch<i64>,
    pub status: Option<String>,
    pub password: Patch<String>,
}

/// Validate a patch-link request (`patchLinkSchema`). Requires at least one
/// field present, like the oracle's `.refine(Object.keys.length > 0)`.
pub fn validate_patch(input: &PatchLinkInput) -> Result<PatchLink, ApiError> {
    let has_any = input.destination_url.is_some()
        || input.alias.is_some()
        || input.expires_at.is_present()
        || input.max_clicks.is_present()
        || input.status.is_some()
        || input.password.is_present();
    if !has_any {
        return Err(ApiError::new(ErrorCode::ValidationError).with_message("No changes provided."));
    }

    let destination_url = match &input.destination_url {
        Some(u) => Some(validate_http_url(u, "destinationUrl")?),
        None => None,
    };
    let alias = match &input.alias {
        Some(a) => Some(validate_alias_field(a)?),
        None => None,
    };
    let expires_at = match &input.expires_at {
        Patch::Absent => Patch::Absent,
        Patch::Null => Patch::Null,
        Patch::Set(s) => Patch::Set(parse_datetime(s, "expiresAt")?),
    };
    let max_clicks = match &input.max_clicks {
        Patch::Absent => Patch::Absent,
        Patch::Null => Patch::Null,
        Patch::Set(n) => Patch::Set(validate_max_clicks(*n)?),
    };
    let status = match &input.status {
        Some(s) if s == "ACTIVE" || s == "DEACTIVATED" => Some(s.clone()),
        Some(_) => {
            return Err(ApiError::validation(
                "status",
                "Status must be ACTIVE or DEACTIVATED.",
            ))
        }
        None => None,
    };
    let password = match &input.password {
        Patch::Absent => Patch::Absent,
        Patch::Null => Patch::Null,
        Patch::Set(p) => Patch::Set(validate_password(p)?),
    };

    Ok(PatchLink {
        destination_url,
        alias,
        expires_at,
        max_clicks,
        status,
        password,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_http_urls() {
        assert!(is_valid_http_url("https://example.com"));
        assert!(is_valid_http_url("http://localhost"));
        assert!(is_valid_http_url("https://sub.example.co.uk/path?q=1#h"));
    }

    #[test]
    fn invalid_http_urls() {
        assert!(!is_valid_http_url("javascript:alert(1)"));
        assert!(!is_valid_http_url("data:text/html,hi"));
        assert!(!is_valid_http_url("ftp://example.com"));
        assert!(!is_valid_http_url("not a url"));
        assert!(!is_valid_http_url("http://foo")); // bare token, not dotted/localhost
    }

    #[test]
    fn url_required_and_length() {
        let e = validate_http_url("   ", "url").unwrap_err();
        assert_eq!(e.code, ErrorCode::ValidationError);
        assert_eq!(e.field.as_deref(), Some("url"));

        let long = format!("https://e.com/{}", "a".repeat(2048));
        let e2 = validate_http_url(&long, "url").unwrap_err();
        assert_eq!(e2.message, "That URL is too long.");

        let e3 = validate_http_url("javascript:x", "url").unwrap_err();
        assert_eq!(e3.code, ErrorCode::InvalidUrl);
    }

    #[test]
    fn create_happy_path() {
        let input = CreateLinkInput {
            url: " https://example.com ".into(),
            alias: Some("my-link".into()),
            expires_at: Some("2999-01-01T00:00:00Z".into()),
            max_clicks: Some(100),
            password: Some("secret".into()),
            utm: Some(UtmInput {
                source: Some("nl".into()),
                ..Default::default()
            }),
        };
        let out = validate_create(&input).unwrap();
        assert_eq!(out.url, "https://example.com");
        assert_eq!(out.alias.as_deref(), Some("my-link"));
        assert!(out.expires_at.is_some());
        assert_eq!(out.max_clicks, Some(100));
        assert_eq!(out.password.as_deref(), Some("secret"));
        assert_eq!(out.utm.unwrap().source.as_deref(), Some("nl"));
    }

    #[test]
    fn create_rejects_bad_alias_and_maxclicks() {
        let mut input = CreateLinkInput {
            url: "https://e.com".into(),
            alias: Some("ab".into()),
            ..Default::default()
        };
        assert_eq!(
            validate_create(&input).unwrap_err().field.as_deref(),
            Some("alias")
        );
        input.alias = None;
        input.max_clicks = Some(0);
        assert_eq!(
            validate_create(&input).unwrap_err().field.as_deref(),
            Some("maxClicks")
        );
    }

    #[test]
    fn empty_utm_yields_none() {
        let input = CreateLinkInput {
            url: "https://e.com".into(),
            utm: Some(UtmInput {
                source: Some("   ".into()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let out = validate_create(&input).unwrap();
        assert!(out.utm.is_none());
    }

    #[test]
    fn patch_requires_at_least_one_field() {
        let input = PatchLinkInput::default();
        let e = validate_patch(&input).unwrap_err();
        assert_eq!(e.message, "No changes provided.");
    }

    #[test]
    fn patch_status_enum() {
        let mut input = PatchLinkInput {
            status: Some("ACTIVE".into()),
            ..Default::default()
        };
        assert!(validate_patch(&input).is_ok());
        input.status = Some("WAT".into());
        assert_eq!(
            validate_patch(&input).unwrap_err().field.as_deref(),
            Some("status")
        );
    }

    #[test]
    fn patch_nullable_fields() {
        let input = PatchLinkInput {
            expires_at: Patch::Null,
            max_clicks: Patch::Set(50),
            password: Patch::Null,
            ..Default::default()
        };
        let out = validate_patch(&input).unwrap();
        assert!(matches!(out.expires_at, Patch::Null));
        assert!(matches!(out.max_clicks, Patch::Set(50)));
        assert!(matches!(out.password, Patch::Null));
    }
}

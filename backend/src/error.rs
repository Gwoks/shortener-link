//! Uniform API error envelope — ported from `src/lib/errors.ts`.
//!
//! Every non-2xx `/api/*` response returns
//! `{ "error": { "code", "message", "field"?, "suggestions"?, "retryAfter"? } }`
//! with a stable machine `code` and a human, recovery-oriented `message`.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use serde_json::json;

/// Stable machine-readable error codes. Serializes as SCREAMING_SNAKE strings.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    ValidationError,
    InvalidUrl,
    AliasTaken,
    AliasReserved,
    UrlBlocked,
    RateLimited,
    UnlockLocked,
    WrongPassword,
    Unauthenticated,
    Forbidden,
    NotFound,
    BulkLimitExceeded,
    EmailTaken,
    Internal,
}

impl ErrorCode {
    /// The SCREAMING_SNAKE wire string (matches errors.ts `ErrorCode`).
    pub fn as_str(&self) -> &'static str {
        match self {
            ErrorCode::ValidationError => "VALIDATION_ERROR",
            ErrorCode::InvalidUrl => "INVALID_URL",
            ErrorCode::AliasTaken => "ALIAS_TAKEN",
            ErrorCode::AliasReserved => "ALIAS_RESERVED",
            ErrorCode::UrlBlocked => "URL_BLOCKED",
            ErrorCode::RateLimited => "RATE_LIMITED",
            ErrorCode::UnlockLocked => "UNLOCK_LOCKED",
            ErrorCode::WrongPassword => "WRONG_PASSWORD",
            ErrorCode::Unauthenticated => "UNAUTHENTICATED",
            ErrorCode::Forbidden => "FORBIDDEN",
            ErrorCode::NotFound => "NOT_FOUND",
            ErrorCode::BulkLimitExceeded => "BULK_LIMIT_EXCEEDED",
            ErrorCode::EmailTaken => "EMAIL_TAKEN",
            ErrorCode::Internal => "INTERNAL",
        }
    }

    /// HTTP status mapped to this code (ERROR_STATUS in errors.ts).
    pub fn status(&self) -> StatusCode {
        match self {
            ErrorCode::ValidationError => StatusCode::UNPROCESSABLE_ENTITY, // 422
            ErrorCode::InvalidUrl => StatusCode::UNPROCESSABLE_ENTITY,      // 422
            ErrorCode::AliasTaken => StatusCode::CONFLICT,                  // 409
            ErrorCode::AliasReserved => StatusCode::UNPROCESSABLE_ENTITY,   // 422
            ErrorCode::UrlBlocked => StatusCode::BAD_REQUEST,               // 400
            ErrorCode::RateLimited => StatusCode::TOO_MANY_REQUESTS,        // 429
            ErrorCode::UnlockLocked => StatusCode::TOO_MANY_REQUESTS,       // 429
            ErrorCode::WrongPassword => StatusCode::UNAUTHORIZED,           // 401
            ErrorCode::Unauthenticated => StatusCode::UNAUTHORIZED,         // 401
            ErrorCode::Forbidden => StatusCode::FORBIDDEN,                  // 403
            ErrorCode::NotFound => StatusCode::NOT_FOUND,                   // 404
            ErrorCode::BulkLimitExceeded => StatusCode::PAYLOAD_TOO_LARGE,  // 413
            ErrorCode::EmailTaken => StatusCode::CONFLICT,                  // 409
            ErrorCode::Internal => StatusCode::INTERNAL_SERVER_ERROR,       // 500
        }
    }

    /// Default friendly copy with a recovery path (ERROR_DEFAULT_MESSAGE).
    pub fn default_message(&self) -> &'static str {
        match self {
            ErrorCode::ValidationError => {
                "Some of the details need fixing. Check the highlighted fields and try again."
            }
            ErrorCode::InvalidUrl => {
                "That doesn't look like a valid web address. Use a full http(s):// URL."
            }
            ErrorCode::AliasTaken => {
                "That custom link is already in use. Try another or pick a suggestion."
            }
            ErrorCode::AliasReserved => {
                "That word is reserved by the app. Pick a different custom link."
            }
            ErrorCode::UrlBlocked => {
                "We couldn't shorten that link because the destination is on a safety blocklist. Double-check the address or try a different one."
            }
            ErrorCode::RateLimited => "You're going a bit fast. Wait a moment and try again.",
            ErrorCode::UnlockLocked => {
                "Too many incorrect attempts. Please wait a bit before trying again."
            }
            ErrorCode::WrongPassword => "That password isn't right. Try again.",
            ErrorCode::Unauthenticated => "Please sign in to continue.",
            ErrorCode::Forbidden => "You don't have access to this resource.",
            ErrorCode::NotFound => "We couldn't find what you were looking for.",
            ErrorCode::BulkLimitExceeded => {
                "That batch is too large. Reduce the number of URLs and try again."
            }
            ErrorCode::EmailTaken => {
                "An account with that email already exists. Try signing in instead."
            }
            ErrorCode::Internal => "Something went wrong on our end. Please try again.",
        }
    }
}

impl Serialize for ErrorCode {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

/// Internal error type, converted to the standard JSON envelope on response.
#[derive(Debug, Clone)]
pub struct ApiError {
    pub code: ErrorCode,
    pub message: String,
    pub field: Option<String>,
    pub suggestions: Option<Vec<String>>,
    pub retry_after: Option<i64>,
}

impl ApiError {
    /// Build with the code's default message.
    pub fn new(code: ErrorCode) -> Self {
        ApiError {
            code,
            message: code.default_message().to_string(),
            field: None,
            suggestions: None,
            retry_after: None,
        }
    }

    /// Override the human message.
    pub fn with_message(mut self, message: impl Into<String>) -> Self {
        self.message = message.into();
        self
    }

    /// Attach the offending field name.
    pub fn with_field(mut self, field: impl Into<String>) -> Self {
        self.field = Some(field.into());
        self
    }

    /// Attach alias suggestions.
    pub fn with_suggestions(mut self, suggestions: Vec<String>) -> Self {
        self.suggestions = Some(suggestions);
        self
    }

    /// Attach a Retry-After value (seconds) for 429 responses.
    pub fn with_retry_after(mut self, retry_after: i64) -> Self {
        self.retry_after = Some(retry_after);
        self
    }

    /// Convenience: a VALIDATION_ERROR for a specific field with a message.
    pub fn validation(field: impl Into<String>, message: impl Into<String>) -> Self {
        ApiError::new(ErrorCode::ValidationError)
            .with_field(field)
            .with_message(message)
    }

    /// Convenience: an INVALID_URL for a specific field with a message.
    pub fn invalid_url(field: impl Into<String>, message: impl Into<String>) -> Self {
        ApiError::new(ErrorCode::InvalidUrl)
            .with_field(field)
            .with_message(message)
    }

    /// The JSON body value (omitting null optionals).
    pub fn body(&self) -> serde_json::Value {
        let mut err = json!({
            "code": self.code,
            "message": self.message,
        });
        let obj = err.as_object_mut().expect("error object");
        if let Some(field) = &self.field {
            obj.insert("field".into(), json!(field));
        }
        if let Some(suggestions) = &self.suggestions {
            obj.insert("suggestions".into(), json!(suggestions));
        }
        if let Some(retry_after) = self.retry_after {
            obj.insert("retryAfter".into(), json!(retry_after));
        }
        json!({ "error": err })
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code.as_str(), self.message)
    }
}

impl std::error::Error for ApiError {}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.code.status();
        let mut response = (status, axum::Json(self.body())).into_response();
        if let Some(retry_after) = self.retry_after {
            if let Ok(val) = axum::http::HeaderValue::from_str(&retry_after.to_string()) {
                response.headers_mut().insert("retry-after", val);
            }
        }
        response
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_map_matches_oracle() {
        assert_eq!(ErrorCode::ValidationError.status(), StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(ErrorCode::InvalidUrl.status(), StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(ErrorCode::AliasTaken.status(), StatusCode::CONFLICT);
        assert_eq!(ErrorCode::AliasReserved.status(), StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(ErrorCode::UrlBlocked.status(), StatusCode::BAD_REQUEST);
        assert_eq!(ErrorCode::RateLimited.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(ErrorCode::UnlockLocked.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(ErrorCode::WrongPassword.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(ErrorCode::Unauthenticated.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(ErrorCode::Forbidden.status(), StatusCode::FORBIDDEN);
        assert_eq!(ErrorCode::NotFound.status(), StatusCode::NOT_FOUND);
        assert_eq!(ErrorCode::BulkLimitExceeded.status(), StatusCode::PAYLOAD_TOO_LARGE);
        assert_eq!(ErrorCode::EmailTaken.status(), StatusCode::CONFLICT);
        assert_eq!(ErrorCode::Internal.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    fn code_serializes_as_screaming_snake() {
        assert_eq!(ErrorCode::AliasTaken.as_str(), "ALIAS_TAKEN");
        assert_eq!(ErrorCode::BulkLimitExceeded.as_str(), "BULK_LIMIT_EXCEEDED");
        let v = serde_json::to_value(ErrorCode::UnlockLocked).unwrap();
        assert_eq!(v, json!("UNLOCK_LOCKED"));
    }

    #[test]
    fn body_omits_null_optionals() {
        let body = ApiError::new(ErrorCode::NotFound).body();
        let err = &body["error"];
        assert_eq!(err["code"], json!("NOT_FOUND"));
        assert!(err.get("field").is_none());
        assert!(err.get("suggestions").is_none());
        assert!(err.get("retryAfter").is_none());
    }

    #[test]
    fn body_includes_present_optionals() {
        let body = ApiError::new(ErrorCode::AliasTaken)
            .with_field("alias")
            .with_suggestions(vec!["foo-2".into()])
            .body();
        let err = &body["error"];
        assert_eq!(err["field"], json!("alias"));
        assert_eq!(err["suggestions"], json!(["foo-2"]));
    }

    #[test]
    fn default_message_used_when_not_overridden() {
        let e = ApiError::new(ErrorCode::WrongPassword);
        assert_eq!(e.message, "That password isn't right. Try again.");
    }
}

//! Auth surface (ARCHITECTURE.md §4.1, §6.2). Replaces NextAuth with a small,
//! explicit set of routes over a stateless HS256 session cookie:
//!   POST /api/auth/register          — email/password sign-up
//!   POST /api/auth/login             — email/password sign-in
//!   POST /api/auth/logout            — clear session
//!   GET  /api/session                — current session principal (or null)
//!   GET  /api/auth/oauth/:provider          — start OAuth (302 to provider)
//!   GET  /api/auth/oauth/:provider/callback — finish OAuth, set session, 302

pub mod extractor;
pub mod jwt;
pub mod oauth;
pub mod password;

use axum::extract::{Path, State};
use axum::http::{header::LOCATION, header::SET_COOKIE, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use crate::error::{ApiError, ErrorCode};
use crate::ids::cuid;
use crate::models::User;
use crate::state::AppState;

use extractor::{
    clear_cookie, cookie_from_header, session_cookie, OptionalUser, SESSION_COOKIE,
};
use oauth::{Provider, OAUTH_STATE_COOKIE};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/session", get(session))
        .route("/api/auth/oauth/:provider", get(oauth_start))
        .route("/api/auth/oauth/:provider/callback", get(oauth_callback))
}

fn now_iso() -> String {
    use chrono::SecondsFormat;
    chrono::Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

// ─── register ────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct RegisterBody {
    email: Option<String>,
    password: Option<String>,
    name: Option<String>,
}

async fn register(
    State(state): State<AppState>,
    body: Result<Json<RegisterBody>, axum::extract::rejection::JsonRejection>,
) -> Result<Response, ApiError> {
    let Json(body) = body.map_err(|_| {
        ApiError::new(ErrorCode::ValidationError).with_message("Request body must be valid JSON.")
    })?;

    let email_raw = body.email.unwrap_or_default();
    let email = email_raw.trim().to_lowercase();
    let password = body.password.unwrap_or_default();
    let name = body.name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());

    // registerSchema: valid email, password min 8 / max 200, name max 200.
    if email.is_empty() || !email.contains('@') || email.chars().count() > 320 {
        return Err(ApiError::validation("email", "Enter a valid email address."));
    }
    if password.chars().count() < 8 {
        return Err(ApiError::validation("password", "Use at least 8 characters."));
    }
    if password.chars().count() > 200 {
        return Err(ApiError::validation("password", "That password is too long."));
    }
    if name.as_ref().map(|n| n.chars().count() > 200).unwrap_or(false) {
        return Err(ApiError::validation("name", "That name is too long."));
    }

    let existing: Option<String> = sqlx::query_scalar("SELECT id FROM \"user\" WHERE email = ?")
        .bind(&email)
        .fetch_optional(&state.pool)
        .await
        .map_err(internal)?;
    if existing.is_some() {
        return Err(ApiError::new(ErrorCode::EmailTaken));
    }

    let password_hash = password::hash(&password).map_err(internal)?;
    let id = cuid();
    let created_at = now_iso();
    sqlx::query(
        "INSERT INTO \"user\" (id, email, name, role, password_hash, created_at)
         VALUES (?, ?, ?, 'USER', ?, ?)",
    )
    .bind(&id)
    .bind(&email)
    .bind(&name)
    .bind(&password_hash)
    .bind(&created_at)
    .execute(&state.pool)
    .await
    .map_err(internal)?;

    let user = User {
        id: id.clone(),
        email: email.clone(),
        email_verified: None,
        name: name.clone(),
        image: None,
        password_hash: Some(password_hash),
        role: "USER".into(),
        created_at,
    };
    let token = jwt::issue(&user, &state.cfg.auth_secret);

    let body = json!({ "user": { "id": id, "email": email, "name": name } });
    Ok(with_cookie(
        (StatusCode::CREATED, Json(body)).into_response(),
        &session_cookie(&token),
    ))
}

// ─── login ───────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct LoginBody {
    email: Option<String>,
    password: Option<String>,
}

async fn login(
    State(state): State<AppState>,
    body: Result<Json<LoginBody>, axum::extract::rejection::JsonRejection>,
) -> Result<Response, ApiError> {
    let Json(body) = body.map_err(|_| {
        ApiError::new(ErrorCode::ValidationError).with_message("Request body must be valid JSON.")
    })?;
    let email = body.email.unwrap_or_default().trim().to_lowercase();
    let password = body.password.unwrap_or_default();
    if email.is_empty() || password.is_empty() {
        return Err(ApiError::new(ErrorCode::Unauthenticated));
    }

    let user: Option<User> = sqlx::query_as("SELECT * FROM \"user\" WHERE email = ?")
        .bind(&email)
        .fetch_optional(&state.pool)
        .await
        .map_err(internal)?;

    let user = match user {
        Some(u) => u,
        None => return Err(ApiError::new(ErrorCode::Unauthenticated)),
    };
    let hash = match &user.password_hash {
        Some(h) => h,
        None => return Err(ApiError::new(ErrorCode::Unauthenticated)),
    };
    if !password::verify(hash, &password) {
        return Err(ApiError::new(ErrorCode::Unauthenticated));
    }

    let token = jwt::issue(&user, &state.cfg.auth_secret);
    let body = json!({ "user": {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "image": user.image,
    }});
    Ok(with_cookie(
        (StatusCode::OK, Json(body)).into_response(),
        &session_cookie(&token),
    ))
}

// ─── logout ──────────────────────────────────────────────────────────────────

async fn logout() -> Response {
    with_cookie(
        (StatusCode::OK, Json(json!({}))).into_response(),
        &clear_cookie(SESSION_COOKIE),
    )
}

// ─── session ─────────────────────────────────────────────────────────────────

async fn session(OptionalUser(user): OptionalUser) -> Json<serde_json::Value> {
    match user {
        Some(u) => Json(json!({ "user": u.to_json() })),
        None => Json(json!({ "user": serde_json::Value::Null })),
    }
}

// ─── oauth start ─────────────────────────────────────────────────────────────

async fn oauth_start(
    State(state): State<AppState>,
    Path(provider): Path<String>,
) -> Response {
    let provider = match Provider::parse(&provider) {
        Some(p) => p,
        None => return redirect_to("/signin?error=oauth_unconfigured", None),
    };
    if !provider.configured(&state.cfg) {
        return redirect_to("/signin?error=oauth_unconfigured", None);
    }
    let csrf = oauth::random_state();
    let state_value = format!("{}:{}", provider.as_str(), csrf);
    let url = oauth::authorize_url(provider, &state.cfg, &state_value);
    let cookie = extractor::build_cookie(OAUTH_STATE_COOKIE, &state_value, 600, false);
    redirect_to(&url, Some(&cookie))
}

// ─── oauth callback ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct OauthCallbackQuery {
    code: Option<String>,
    state: Option<String>,
}

async fn oauth_callback(
    State(state): State<AppState>,
    Path(provider): Path<String>,
    axum::extract::Query(query): axum::extract::Query<OauthCallbackQuery>,
    headers: axum::http::HeaderMap,
) -> Response {
    let provider = match Provider::parse(&provider) {
        Some(p) => p,
        None => return redirect_to("/signin?error=oauth_unconfigured", None),
    };
    if !provider.configured(&state.cfg) {
        return redirect_to("/signin?error=oauth_unconfigured", None);
    }

    // CSRF: state from the query must match the state cookie.
    let cookie_header = headers
        .get(axum::http::header::COOKIE)
        .and_then(|v| v.to_str().ok());
    let cookie_state = cookie_from_header(cookie_header, OAUTH_STATE_COOKIE);
    match (&query.state, &cookie_state) {
        (Some(q), Some(c)) if q == c => {}
        _ => return redirect_to("/signin?error=oauth_failed", None),
    }

    let code = match query.code {
        Some(c) if !c.is_empty() => c,
        _ => return redirect_to("/signin?error=oauth_failed", None),
    };

    let identity = match oauth::complete_callback(provider, &state.cfg, &code).await {
        Ok(i) => i,
        Err(_) => return redirect_to("/signin?error=oauth_failed", None),
    };

    let user = match upsert_oauth_user(&state, provider, &identity).await {
        Ok(u) => u,
        Err(_) => return redirect_to("/signin?error=oauth_failed", None),
    };

    let token = jwt::issue(&user, &state.cfg.auth_secret);
    // Set the session cookie, clear the transient state cookie.
    let mut resp = redirect_to("/dashboard", Some(&session_cookie(&token)));
    append_cookie(&mut resp, &clear_cookie(OAUTH_STATE_COOKIE));
    resp
}

/// Upsert the `user` (by email) + `account` (by provider/provider_account_id).
async fn upsert_oauth_user(
    state: &AppState,
    provider: Provider,
    identity: &oauth::OauthIdentity,
) -> anyhow::Result<User> {
    let existing: Option<User> = sqlx::query_as("SELECT * FROM \"user\" WHERE email = ?")
        .bind(&identity.email)
        .fetch_optional(&state.pool)
        .await?;

    let user = match existing {
        Some(mut u) => {
            // Backfill name/image if newly provided.
            if u.name.is_none() && identity.name.is_some() {
                u.name = identity.name.clone();
            }
            if u.image.is_none() && identity.image.is_some() {
                u.image = identity.image.clone();
            }
            sqlx::query("UPDATE \"user\" SET name = ?, image = ? WHERE id = ?")
                .bind(&u.name)
                .bind(&u.image)
                .bind(&u.id)
                .execute(&state.pool)
                .await?;
            u
        }
        None => {
            let id = cuid();
            let created_at = now_iso();
            sqlx::query(
                "INSERT INTO \"user\" (id, email, name, image, role, created_at)
                 VALUES (?, ?, ?, ?, 'USER', ?)",
            )
            .bind(&id)
            .bind(&identity.email)
            .bind(&identity.name)
            .bind(&identity.image)
            .bind(&created_at)
            .execute(&state.pool)
            .await?;
            User {
                id,
                email: identity.email.clone(),
                email_verified: None,
                name: identity.name.clone(),
                image: identity.image.clone(),
                password_hash: None,
                role: "USER".into(),
                created_at,
            }
        }
    };

    // Upsert the account link.
    sqlx::query(
        "INSERT INTO account (id, user_id, type, provider, provider_account_id)
         VALUES (?, ?, 'oauth', ?, ?)
         ON CONFLICT(provider, provider_account_id) DO UPDATE SET user_id = excluded.user_id",
    )
    .bind(cuid())
    .bind(&user.id)
    .bind(provider.as_str())
    .bind(&identity.provider_account_id)
    .execute(&state.pool)
    .await?;

    Ok(user)
}

// ─── helpers ─────────────────────────────────────────────────────────────────

fn internal<E: std::fmt::Display>(e: E) -> ApiError {
    tracing::error!("auth internal error: {e}");
    ApiError::new(ErrorCode::Internal)
}

/// Attach a Set-Cookie header to a response.
fn with_cookie(mut resp: Response, cookie: &str) -> Response {
    append_cookie(&mut resp, cookie);
    resp
}

fn append_cookie(resp: &mut Response, cookie: &str) {
    if let Ok(val) = HeaderValue::from_str(cookie) {
        resp.headers_mut().append(SET_COOKIE, val);
    }
}

/// 302 redirect to `location`, optionally setting a cookie.
fn redirect_to(location: &str, cookie: Option<&str>) -> Response {
    let mut resp = StatusCode::FOUND.into_response();
    if let Ok(val) = HeaderValue::from_str(location) {
        resp.headers_mut().insert(LOCATION, val);
    }
    if let Some(c) = cookie {
        append_cookie(&mut resp, c);
    }
    resp
}

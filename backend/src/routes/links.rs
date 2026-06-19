//! Link management + creation routes (Phase 3) — ports `src/app/api/links/**`.

use axum::extract::{Path, Query, State};
use axum::http::{header::SET_COOKIE, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::{Json, Router};
use axum::routing::{get, post};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::extractor::{CurrentUser, OptionalUser};
use crate::error::{ApiError, ErrorCode};
use crate::ids::cuid;
use crate::models::Link;
use crate::services::alias;
use crate::services::links::{self, CreateLinkArgs};
use crate::services::serialize::serialize_link;
use crate::services::utm::UtmParams;
use crate::services::validation::{
    self, CreateLinkInput, Patch, PatchLinkInput, UtmInput,
};
use crate::state::AppState;

pub const GUEST_COOKIE: &str = "guest_id";

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/links", post(create).get(list))
        .route("/api/links/bulk", post(bulk))
        .route("/api/links/check-alias", get(check_alias))
        .route(
            "/api/links/:id",
            get(get_one).patch(patch_one).delete(delete_one),
        )
        .route("/api/links/:id/unlock", post(unlock))
}

// ─── helpers ─────────────────────────────────────────────────────────────────

fn internal<E: std::fmt::Display>(e: E) -> ApiError {
    tracing::error!("links route error: {e}");
    ApiError::new(ErrorCode::Internal)
}

fn client_ip(headers: &axum::http::HeaderMap) -> Option<String> {
    if let Some(xff) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
        if let Some(first) = xff.split(',').next() {
            let first = first.trim();
            if !first.is_empty() {
                return Some(first.to_string());
            }
        }
    }
    headers
        .get("x-real-ip")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Stable rate-limit key from the client IP (or a fallback when absent).
fn rl_key(ip: &Option<String>) -> String {
    ip.clone().unwrap_or_else(|| "noip".to_string())
}

fn guest_key_hash(state: &AppState, guest_id: &str) -> String {
    // Mirror hash.ts guestKeyHash: HMAC-SHA256(pepper, "guest|"+id) → hex.
    let key = state.cfg.visitor_ip_pepper.as_bytes();
    let msg = format!("guest|{guest_id}");
    hmac_hex(key, msg.as_bytes())
}

fn hmac_hex(key: &[u8], message: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    const BLOCK: usize = 64;
    let mut key_block = [0u8; BLOCK];
    if key.len() > BLOCK {
        let d = Sha256::digest(key);
        key_block[..32].copy_from_slice(&d);
    } else {
        key_block[..key.len()].copy_from_slice(key);
    }
    let mut ipad = [0x36u8; BLOCK];
    let mut opad = [0x5cu8; BLOCK];
    for i in 0..BLOCK {
        ipad[i] ^= key_block[i];
        opad[i] ^= key_block[i];
    }
    let mut inner = Sha256::new();
    inner.update(ipad);
    inner.update(message);
    let inner_d = inner.finalize();
    let mut outer = Sha256::new();
    outer.update(opad);
    outer.update(inner_d);
    hex::encode(outer.finalize())
}

// ─── POST /api/links ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct CreateBody {
    url: String,
    alias: Option<String>,
    #[serde(rename = "expiresAt")]
    expires_at: Option<String>,
    #[serde(rename = "maxClicks")]
    max_clicks: Option<i64>,
    password: Option<String>,
    utm: Option<UtmBody>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct UtmBody {
    source: Option<String>,
    medium: Option<String>,
    campaign: Option<String>,
    term: Option<String>,
    content: Option<String>,
}

impl UtmBody {
    fn into_input(self) -> UtmInput {
        UtmInput {
            source: self.source,
            medium: self.medium,
            campaign: self.campaign,
            term: self.term,
            content: self.content,
        }
    }
}

async fn create(
    State(state): State<AppState>,
    OptionalUser(user): OptionalUser,
    headers: axum::http::HeaderMap,
    body: Result<Json<CreateBody>, axum::extract::rejection::JsonRejection>,
) -> Result<Response, ApiError> {
    let Json(body) = body.map_err(|_| {
        ApiError::new(ErrorCode::ValidationError).with_message("Request body must be valid JSON.")
    })?;
    let ip = client_ip(&headers);

    // Per-IP shorten rate limit (FR-35).
    if let Err(retry) = state.limiter.check(&rl_key(&ip), &state.cfg.rl_shorten) {
        return Err(ApiError::new(ErrorCode::RateLimited).with_retry_after(retry));
    }

    let input = CreateLinkInput {
        url: body.url,
        alias: body.alias,
        expires_at: body.expires_at,
        max_clicks: body.max_clicks,
        password: body.password,
        utm: body.utm.map(|u| u.into_input()),
    };
    let validated = validation::validate_create(&input)?;

    let user_id = user.as_ref().map(|u| u.id.clone());

    // Guest identity (FR-33/34): mint a guest cookie on first guest shorten.
    let mut guest_id = cookie_value_from(&headers, GUEST_COOKIE);
    let mut set_guest_cookie = false;
    if user_id.is_none() && guest_id.is_none() {
        guest_id = Some(cuid_uuid());
        set_guest_cookie = true;
    }
    let guest_key = if user_id.is_none() {
        guest_id.as_ref().map(|g| guest_key_hash(&state, g))
    } else {
        None
    };

    let link = links::create_link(
        &state,
        CreateLinkArgs {
            url: validated.url,
            alias: validated.alias,
            expires_at: validated.expires_at.map(iso_from_dt),
            max_clicks: validated.max_clicks,
            password: validated.password,
            utm: validated.utm.map(to_utm_params),
            owner_id: user_id.clone(),
            is_guest: user_id.is_none(),
            guest_key,
            guest_ttl_hours: state.cfg.guest_ttl_hours,
        },
    )
    .await?;

    // Async metadata scrape (FR-19) — never blocks create.
    let _ = state.scrape_tx.send(link.id.clone());

    let body = json!({ "link": serialize_link(&link, &state.cfg.base_url) });
    let mut resp = (StatusCode::CREATED, Json(body)).into_response();
    if set_guest_cookie {
        if let Some(gid) = guest_id {
            let cookie = crate::auth::extractor::build_cookie(
                GUEST_COOKIE,
                &gid,
                state.cfg.guest_ttl_hours * 3600,
                false,
            );
            if let Ok(v) = HeaderValue::from_str(&cookie) {
                resp.headers_mut().append(SET_COOKIE, v);
            }
        }
    }
    Ok(resp)
}

fn cookie_value_from(headers: &axum::http::HeaderMap, name: &str) -> Option<String> {
    let h = headers
        .get(axum::http::header::COOKIE)
        .and_then(|v| v.to_str().ok());
    crate::auth::extractor::cookie_from_header(h, name)
}

fn iso_from_dt(dt: chrono::DateTime<chrono::Utc>) -> String {
    use chrono::SecondsFormat;
    dt.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn to_utm_params(u: crate::services::utm::UtmParams) -> UtmParams {
    u
}

fn cuid_uuid() -> String {
    // Guest id need only be opaque + unique; reuse cuid for a collision-free id.
    cuid()
}

// ─── GET /api/links ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct ListQuery {
    q: Option<String>,
    search: Option<String>,
    status: Option<String>,
    sort: Option<String>,
    order: Option<String>,
    page: Option<String>,
    #[serde(rename = "pageSize")]
    page_size: Option<String>,
}

async fn list(
    State(state): State<AppState>,
    user: CurrentUser,
    Query(q): Query<ListQuery>,
) -> Result<Json<Value>, ApiError> {
    let search = q
        .q
        .or(q.search)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let status = q.status.as_deref();
    let sort = if q.sort.as_deref() == Some("clicks") { "clicks" } else { "created" };
    let order = if q.order.as_deref() == Some("asc") { "ASC" } else { "DESC" };
    let page = q
        .page
        .and_then(|p| p.parse::<i64>().ok())
        .unwrap_or(1)
        .max(1);
    let page_size = q
        .page_size
        .and_then(|p| p.parse::<i64>().ok())
        .unwrap_or(20)
        .clamp(1, 100);

    let now = iso_from_dt(chrono::Utc::now());
    let soon = iso_from_dt(chrono::Utc::now() + chrono::Duration::hours(24));

    // Build the WHERE clause matching the oracle's Prisma filters.
    let mut conds: Vec<String> = vec!["owner_id = ?".to_string()];
    let mut binds: Vec<String> = vec![user.id.clone()];

    match status {
        Some("active") => {
            conds.push("status = 'ACTIVE'".into());
            conds.push("(expires_at IS NULL OR expires_at > ?)".into());
            binds.push(now.clone());
        }
        Some("expired") => {
            conds.push("(status = 'EXPIRED' OR status = 'DEACTIVATED' OR expires_at <= ?)".into());
            binds.push(now.clone());
        }
        Some("expiring") => {
            conds.push("status = 'ACTIVE'".into());
            conds.push("(expires_at > ? AND expires_at <= ?)".into());
            binds.push(now.clone());
            binds.push(soon.clone());
        }
        Some("protected") => {
            conds.push("password_hash IS NOT NULL".into());
        }
        _ => {}
    }

    if let Some(s) = &search {
        conds.push(
            "(code LIKE ? OR destination_url LIKE ? OR meta_title LIKE ?)".into(),
        );
        let like_lower = format!("%{}%", s.to_lowercase());
        let like = format!("%{s}%");
        binds.push(like_lower);
        binds.push(like.clone());
        binds.push(like);
    }

    let where_sql = conds.join(" AND ");
    let order_col = if sort == "clicks" { "click_count" } else { "created_at" };

    // total
    let count_sql = format!("SELECT COUNT(*) FROM link WHERE {where_sql}");
    let mut cq = sqlx::query_scalar::<_, i64>(&count_sql);
    for b in &binds {
        cq = cq.bind(b);
    }
    let total: i64 = cq.fetch_one(&state.pool).await.map_err(internal)?;

    // page
    let list_sql = format!(
        "SELECT * FROM link WHERE {where_sql} ORDER BY {order_col} {order} LIMIT ? OFFSET ?"
    );
    let mut lq = sqlx::query_as::<_, Link>(&list_sql);
    for b in &binds {
        lq = lq.bind(b);
    }
    lq = lq.bind(page_size).bind((page - 1) * page_size);
    let items = lq.fetch_all(&state.pool).await.map_err(internal)?;

    let items_json: Vec<Value> = items
        .iter()
        .map(|l| serialize_link(l, &state.cfg.base_url))
        .collect();

    Ok(Json(json!({
        "items": items_json,
        "page": page,
        "pageSize": page_size,
        "total": total,
    })))
}

// ─── GET/PATCH/DELETE /api/links/:id ───────────────────────────────────────────

async fn load_owned(state: &AppState, id: &str, user_id: &str) -> Result<Link, ApiError> {
    let link: Option<Link> = sqlx::query_as("SELECT * FROM link WHERE id = ?")
        .bind(id)
        .fetch_optional(&state.pool)
        .await
        .map_err(internal)?;
    let link = link.ok_or_else(|| ApiError::new(ErrorCode::NotFound))?;
    if link.owner_id.as_deref() != Some(user_id) {
        return Err(ApiError::new(ErrorCode::Forbidden));
    }
    Ok(link)
}

async fn get_one(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let link = load_owned(&state, &id, &user.id).await?;
    Ok(Json(json!({ "link": serialize_link(&link, &state.cfg.base_url) })))
}

async fn patch_one(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<String>,
    body: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let Json(raw) = body.map_err(|_| {
        ApiError::new(ErrorCode::ValidationError).with_message("Request body must be valid JSON.")
    })?;
    let existing = load_owned(&state, &id, &user.id).await?;

    let input = parse_patch_body(&raw)?;
    let validated = validation::validate_patch(&input)?;

    // Build the dynamic UPDATE.
    let mut sets: Vec<String> = Vec::new();
    let mut binds: Vec<BindVal> = Vec::new();
    let mut new_code: Option<String> = None;

    if let Some(url) = &validated.destination_url {
        sets.push("destination_url = ?".into());
        binds.push(BindVal::Str(url.clone()));
    }
    match &validated.expires_at {
        Patch::Set(dt) => {
            sets.push("expires_at = ?".into());
            binds.push(BindVal::Str(iso_from_dt(*dt)));
        }
        Patch::Null => {
            sets.push("expires_at = NULL".into());
        }
        Patch::Absent => {}
    }
    match &validated.max_clicks {
        Patch::Set(n) => {
            sets.push("max_clicks = ?".into());
            binds.push(BindVal::Int(*n));
        }
        Patch::Null => {
            sets.push("max_clicks = NULL".into());
        }
        Patch::Absent => {}
    }
    if let Some(status) = &validated.status {
        sets.push("status = ?".into());
        binds.push(BindVal::Str(status.clone()));
    }
    match &validated.password {
        Patch::Set(p) => {
            let h = crate::auth::password::hash(p).map_err(internal)?;
            sets.push("password_hash = ?".into());
            binds.push(BindVal::Str(h));
        }
        Patch::Null => {
            sets.push("password_hash = NULL".into());
        }
        Patch::Absent => {}
    }
    if let Some(a) = &validated.alias {
        // Already syntactically validated; check reserved + availability.
        match alias::validate(a) {
            Ok(()) => {}
            Err(ErrorCode::AliasReserved) => {
                return Err(ApiError::new(ErrorCode::AliasReserved).with_field("alias"));
            }
            Err(_) => {
                return Err(ApiError::validation(
                    "alias",
                    "Use only letters, numbers, hyphens, and underscores.",
                ));
            }
        }
        let lower = alias::normalize(a);
        if lower != existing.code && links::code_exists(&state.pool, &lower).await? {
            return Err(ApiError::new(ErrorCode::AliasTaken)
                .with_field("alias")
                .with_suggestions(links::free_suggestions(&state.pool, a).await));
        }
        sets.push("code = ?".into());
        binds.push(BindVal::Str(lower.clone()));
        sets.push("alias_display = ?".into());
        binds.push(BindVal::Str(a.trim().to_string()));
        new_code = Some(lower);
    }

    sets.push("updated_at = ?".into());
    binds.push(BindVal::Str(iso_from_dt(chrono::Utc::now())));

    let sql = format!("UPDATE link SET {} WHERE id = ?", sets.join(", "));
    let mut q = sqlx::query(&sql);
    for b in &binds {
        q = match b {
            BindVal::Str(s) => q.bind(s),
            BindVal::Int(n) => q.bind(n),
        };
    }
    q = q.bind(&existing.id);
    match q.execute(&state.pool).await {
        Ok(_) => {}
        Err(e) if is_unique(&e) => {
            return Err(ApiError::new(ErrorCode::AliasTaken).with_field("alias"));
        }
        Err(e) => return Err(internal(e)),
    }

    // Cache invalidation (FR-21).
    state.cache.invalidate(&existing.code).await;
    if let Some(nc) = &new_code {
        if nc != &existing.code {
            state.cache.invalidate(nc).await;
        }
    }

    let updated: Link = sqlx::query_as("SELECT * FROM link WHERE id = ?")
        .bind(&existing.id)
        .fetch_one(&state.pool)
        .await
        .map_err(internal)?;
    Ok(Json(json!({ "link": serialize_link(&updated, &state.cfg.base_url) })))
}

enum BindVal {
    Str(String),
    Int(i64),
}

fn is_unique(e: &sqlx::Error) -> bool {
    if let sqlx::Error::Database(db) = e {
        return db.message().contains("UNIQUE constraint failed");
    }
    false
}

/// Translate a JSON patch body into `PatchLinkInput`, honoring absent vs null vs
/// value semantics for the three nullable fields (expiresAt/maxClicks/password).
fn parse_patch_body(raw: &Value) -> Result<PatchLinkInput, ApiError> {
    let obj = raw.as_object().ok_or_else(|| {
        ApiError::new(ErrorCode::ValidationError).with_message("Request body must be a JSON object.")
    })?;

    fn nullable_str(obj: &serde_json::Map<String, Value>, key: &str) -> Result<Patch<String>, ApiError> {
        match obj.get(key) {
            None => Ok(Patch::Absent),
            Some(Value::Null) => Ok(Patch::Null),
            Some(Value::String(s)) => Ok(Patch::Set(s.clone())),
            Some(_) => Err(ApiError::validation(key, "Invalid value.")),
        }
    }
    fn nullable_int(obj: &serde_json::Map<String, Value>, key: &str) -> Result<Patch<i64>, ApiError> {
        match obj.get(key) {
            None => Ok(Patch::Absent),
            Some(Value::Null) => Ok(Patch::Null),
            Some(Value::Number(n)) => n
                .as_i64()
                .map(Patch::Set)
                .ok_or_else(|| ApiError::validation(key, "Must be a whole number.")),
            Some(_) => Err(ApiError::validation(key, "Invalid value.")),
        }
    }

    let destination_url = match obj.get("destinationUrl") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.clone()),
        Some(_) => return Err(ApiError::validation("destinationUrl", "Invalid value.")),
    };
    let alias = match obj.get("alias") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.clone()),
        Some(_) => return Err(ApiError::validation("alias", "Invalid value.")),
    };
    let status = match obj.get("status") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.clone()),
        Some(_) => return Err(ApiError::validation("status", "Invalid value.")),
    };

    Ok(PatchLinkInput {
        destination_url,
        alias,
        expires_at: nullable_str(obj, "expiresAt")?,
        max_clicks: nullable_int(obj, "maxClicks")?,
        status,
        password: nullable_str(obj, "password")?,
    })
}

async fn delete_one(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Response, ApiError> {
    let link = load_owned(&state, &id, &user.id).await?;
    sqlx::query("DELETE FROM link WHERE id = ?")
        .bind(&link.id)
        .execute(&state.pool)
        .await
        .map_err(internal)?;
    state.cache.invalidate(&link.code).await;
    Ok(StatusCode::NO_CONTENT.into_response())
}

// ─── POST /api/links/bulk ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct BulkBody {
    urls: Vec<String>,
}

async fn bulk(
    State(state): State<AppState>,
    user: CurrentUser,
    headers: axum::http::HeaderMap,
    body: Result<Json<BulkBody>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let Json(body) = body.map_err(|_| {
        ApiError::new(ErrorCode::ValidationError).with_message("Request body must be valid JSON.")
    })?;
    if body.urls.is_empty() {
        return Err(ApiError::validation("urls", "Provide at least one URL."));
    }

    if body.urls.len() > state.cfg.bulk_max {
        return Err(ApiError::new(ErrorCode::BulkLimitExceeded)
            .with_message(format!(
                "Please submit at most {} URLs at a time.",
                state.cfg.bulk_max
            )));
    }

    let ip = client_ip(&headers);
    if let Err(retry) = state.limiter.check(&rl_key(&ip), &state.cfg.rl_shorten) {
        return Err(ApiError::new(ErrorCode::RateLimited).with_retry_after(retry));
    }

    let mut results: Vec<Value> = Vec::new();
    for raw in &body.urls {
        let input = raw.trim();
        if input.is_empty() {
            continue;
        }
        // Per-row URL validation (httpUrlSchema).
        if validation::validate_http_url(input, "url").is_err() {
            results.push(json!({
                "input": input,
                "ok": false,
                "error": { "code": "INVALID_URL", "message": ErrorCode::InvalidUrl.default_message() },
            }));
            continue;
        }
        let create = links::create_link(
            &state,
            CreateLinkArgs {
                url: input.to_string(),
                alias: None,
                expires_at: None,
                max_clicks: None,
                password: None,
                utm: None,
                owner_id: Some(user.id.clone()),
                is_guest: false,
                guest_key: None,
                guest_ttl_hours: state.cfg.guest_ttl_hours,
            },
        )
        .await;
        match create {
            Ok(link) => {
                let _ = state.scrape_tx.send(link.id.clone());
                results.push(json!({
                    "input": input,
                    "ok": true,
                    "link": serialize_link(&link, &state.cfg.base_url),
                }));
            }
            Err(e) => {
                results.push(json!({
                    "input": input,
                    "ok": false,
                    "error": { "code": e.code, "message": e.message },
                }));
            }
        }
    }

    Ok(Json(json!({ "results": results })))
}

// ─── GET /api/links/check-alias ─────────────────────────────────────────────────

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct CheckAliasQuery {
    alias: Option<String>,
}

async fn check_alias(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Query(q): Query<CheckAliasQuery>,
) -> Result<Json<Value>, ApiError> {
    let ip = client_ip(&headers);
    if let Err(retry) = state.limiter.check(&rl_key(&ip), &state.cfg.rl_shorten) {
        return Err(ApiError::new(ErrorCode::RateLimited).with_retry_after(retry));
    }

    let alias_raw = q.alias.unwrap_or_default();
    match alias::validate(&alias_raw) {
        Err(ErrorCode::AliasReserved) => {
            return Ok(Json(json!({ "available": false, "reason": "reserved" })));
        }
        Err(_) => {
            return Ok(Json(json!({ "available": false, "reason": "invalid" })));
        }
        Ok(()) => {}
    }
    let lower = alias::normalize(&alias_raw);
    if links::code_exists(&state.pool, &lower).await? {
        return Ok(Json(json!({
            "available": false,
            "reason": "taken",
            "suggestions": links::free_suggestions(&state.pool, &alias_raw).await,
        })));
    }
    Ok(Json(json!({ "available": true })))
}

// ─── POST /api/links/:id/unlock ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct UnlockBody {
    password: Option<String>,
}

async fn unlock(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: axum::http::HeaderMap,
    body: Result<Json<UnlockBody>, axum::extract::rejection::JsonRejection>,
) -> Result<Response, ApiError> {
    let Json(body) = body.map_err(|_| {
        ApiError::new(ErrorCode::ValidationError).with_message("Request body must be valid JSON.")
    })?;
    let password = body.password.unwrap_or_default();
    if password.is_empty() {
        return Err(ApiError::validation("password", "Enter the password."));
    }

    // The :id param here is actually the short CODE (oracle note).
    let code = alias::normalize(&id);
    let ip = client_ip(&headers);

    let link: Option<Link> = sqlx::query_as("SELECT * FROM link WHERE code = ?")
        .bind(&code)
        .fetch_optional(&state.pool)
        .await
        .map_err(internal)?;
    let link = link.ok_or_else(|| ApiError::new(ErrorCode::NotFound))?;
    if link.status != "ACTIVE" {
        return Err(ApiError::new(ErrorCode::NotFound));
    }
    let hash = match &link.password_hash {
        Some(h) => h.clone(),
        None => return Err(ApiError::new(ErrorCode::NotFound)),
    };

    // Independent unlock limiter / lockout (AC-24).
    let key = rl_key(&ip);
    if let Err(retry) = state.limiter.check_unlock(&link.id, &key, &state.cfg.rl_unlock) {
        return Err(ApiError::new(ErrorCode::UnlockLocked).with_retry_after(retry));
    }

    if !crate::auth::password::verify(&hash, &password) {
        state.limiter.record_unlock_failure(&link.id, &key, &state.cfg.rl_unlock);
        return Err(ApiError::new(ErrorCode::WrongPassword));
    }

    state.limiter.clear_unlock_failures(&link.id, &key);

    let now_ms = chrono::Utc::now().timestamp_millis();
    let token = crate::services::unlock::issue_token(
        &code,
        &state.cfg.auth_secret,
        now_ms,
        state.cfg.unlock_session_ttl_sec,
    );
    let cookie = crate::auth::extractor::build_cookie(
        &unlock_cookie_name(&code),
        &token,
        state.cfg.unlock_session_ttl_sec,
        false,
    );
    let mut resp = (StatusCode::OK, Json(json!({ "ok": true }))).into_response();
    if let Ok(v) = HeaderValue::from_str(&cookie) {
        resp.headers_mut().append(SET_COOKIE, v);
    }
    Ok(resp)
}

/// Unlock cookie name per request.ts: `unlock_{code.toLowerCase()}`.
pub fn unlock_cookie_name(code: &str) -> String {
    format!("unlock_{}", code.to_lowercase())
}

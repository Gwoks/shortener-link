//! Guest-link claim routes (Phase 3) — ports `src/app/api/guest-links/**`.
//! A guest's links (created before sign-up) are matched by the hashed guest
//! cookie and claimed into the account.

use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::extractor::CurrentUser;
use crate::error::{ApiError, ErrorCode};
use crate::models::Link;
use crate::routes::links::GUEST_COOKIE;
use crate::services::serialize::serialize_link;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/guest-links/claimable", get(claimable))
        .route("/api/guest-links/claim", post(claim))
}

fn internal<E: std::fmt::Display>(e: E) -> ApiError {
    tracing::error!("guest route error: {e}");
    ApiError::new(ErrorCode::Internal)
}

fn now_iso() -> String {
    use chrono::SecondsFormat;
    chrono::Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn guest_cookie(headers: &axum::http::HeaderMap) -> Option<String> {
    let h = headers
        .get(axum::http::header::COOKIE)
        .and_then(|v| v.to_str().ok());
    crate::auth::extractor::cookie_from_header(h, GUEST_COOKIE)
}

fn guest_key_hash(state: &AppState, guest_id: &str) -> String {
    use sha2::{Digest, Sha256};
    const BLOCK: usize = 64;
    let key = state.cfg.visitor_ip_pepper.as_bytes();
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
    let msg = format!("guest|{guest_id}");
    let mut inner = Sha256::new();
    inner.update(ipad);
    inner.update(msg.as_bytes());
    let inner_d = inner.finalize();
    let mut outer = Sha256::new();
    outer.update(opad);
    outer.update(inner_d);
    hex::encode(outer.finalize())
}

async fn claimable(
    State(state): State<AppState>,
    _user: CurrentUser,
    headers: axum::http::HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let guest_id = match guest_cookie(&headers) {
        Some(g) => g,
        None => return Ok(Json(json!({ "links": [] }))),
    };
    let key = guest_key_hash(&state, &guest_id);
    let now = now_iso();
    let links: Vec<Link> = sqlx::query_as(
        "SELECT * FROM link
         WHERE is_guest = 1 AND owner_id IS NULL AND guest_key = ? AND status = 'ACTIVE'
           AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY created_at DESC",
    )
    .bind(&key)
    .bind(&now)
    .fetch_all(&state.pool)
    .await
    .map_err(internal)?;

    let items: Vec<Value> = links
        .iter()
        .map(|l| serialize_link(l, &state.cfg.base_url))
        .collect();
    Ok(Json(json!({ "links": items })))
}

#[derive(Debug, Deserialize)]
struct ClaimBody {
    ids: Vec<String>,
}

async fn claim(
    State(state): State<AppState>,
    user: CurrentUser,
    headers: axum::http::HeaderMap,
    body: Result<Json<ClaimBody>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let Json(body) = body.map_err(|_| {
        ApiError::new(ErrorCode::ValidationError).with_message("Request body must be valid JSON.")
    })?;
    if body.ids.is_empty() {
        return Err(ApiError::validation("ids", "Provide at least one id."));
    }

    let guest_id = match guest_cookie(&headers) {
        Some(g) => g,
        None => return Ok(Json(json!({ "claimed": 0 }))),
    };
    let key = guest_key_hash(&state, &guest_id);
    let now = now_iso();

    let placeholders = std::iter::repeat("?")
        .take(body.ids.len())
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT id, code FROM link
         WHERE id IN ({placeholders}) AND is_guest = 1 AND owner_id IS NULL AND guest_key = ?
           AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > ?)"
    );
    let mut q = sqlx::query_as::<_, (String, String)>(&sql);
    for id in &body.ids {
        q = q.bind(id);
    }
    q = q.bind(&key).bind(&now);
    let claimable: Vec<(String, String)> = q.fetch_all(&state.pool).await.map_err(internal)?;

    if claimable.is_empty() {
        return Ok(Json(json!({ "claimed": 0 })));
    }

    let ids: Vec<&String> = claimable.iter().map(|(id, _)| id).collect();
    let ph = std::iter::repeat("?").take(ids.len()).collect::<Vec<_>>().join(",");
    let upd = format!(
        "UPDATE link SET owner_id = ?, is_guest = 0, guest_key = NULL, expires_at = NULL
         WHERE id IN ({ph})"
    );
    let mut uq = sqlx::query(&upd).bind(&user.id);
    for id in &ids {
        uq = uq.bind(id);
    }
    uq.execute(&state.pool).await.map_err(internal)?;

    for (_, code) in &claimable {
        state.cache.invalidate(code).await;
    }

    Ok(Json(json!({ "claimed": claimable.len() })))
}

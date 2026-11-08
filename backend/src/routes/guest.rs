//! Guest-link claim routes (Phase 3) — ports `src/app/api/guest-links/**`.
//! A guest's links (created before sign-up) are matched by the hashed guest
//! cookie and claimed into the account.

use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::extractor::{cookie_from_headers, CurrentUser};
use crate::crypto::guest_key_hash;
use crate::db::placeholders;
use crate::error::{internal, ApiError, ErrorCode};
use crate::models::Link;
use crate::routes::links::GUEST_COOKIE;
use crate::services::serialize::serialize_link;
use crate::state::AppState;
use crate::util::now_iso;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/guest-links/claimable", get(claimable))
        .route("/api/guest-links/claim", post(claim))
}

async fn claimable(
    State(state): State<AppState>,
    _user: CurrentUser,
    headers: axum::http::HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let guest_id = match cookie_from_headers(&headers, GUEST_COOKIE) {
        Some(g) => g,
        None => return Ok(Json(json!({ "links": [] }))),
    };
    let key = guest_key_hash(&state.cfg.visitor_ip_pepper, &guest_id);
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

    let guest_id = match cookie_from_headers(&headers, GUEST_COOKIE) {
        Some(g) => g,
        None => return Ok(Json(json!({ "claimed": 0 }))),
    };
    let key = guest_key_hash(&state.cfg.visitor_ip_pepper, &guest_id);
    let now = now_iso();

    let id_list = placeholders(body.ids.len());
    let sql = format!(
        "SELECT id, code FROM link
         WHERE id IN ({id_list}) AND is_guest = 1 AND owner_id IS NULL AND guest_key = ?
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
    let claimed_list = placeholders(ids.len());
    let upd = format!(
        "UPDATE link SET owner_id = ?, is_guest = 0, guest_key = NULL, expires_at = NULL
         WHERE id IN ({claimed_list})"
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

//! Analytics routes (Phase 3) — ports the per-link + summary analytics endpoints.

use axum::extract::{Path, Query, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::Value;

use crate::auth::extractor::CurrentUser;
use crate::error::ApiError;
use crate::services::analytics::{self, Range};
use crate::services::links::load_owned_link;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/links/:id/analytics", get(link_analytics))
        .route("/api/analytics/summary", get(summary))
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct RangeQuery {
    range: Option<String>,
}

async fn link_analytics(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<String>,
    Query(q): Query<RangeQuery>,
) -> Result<Json<Value>, ApiError> {
    let link_id = load_owned_link(&state.pool, &id, &user.id).await?.id;
    let range = Range::parse(q.range.as_deref());
    let data = analytics::link_analytics(&state.pool, &link_id, range, chrono::Utc::now()).await?;
    Ok(Json(data))
}

async fn summary(
    State(state): State<AppState>,
    user: CurrentUser,
    Query(q): Query<RangeQuery>,
) -> Result<Json<Value>, ApiError> {
    let range = Range::parse(q.range.as_deref());
    let data =
        analytics::summary_analytics(&state.pool, &user.id, range, chrono::Utc::now()).await?;
    Ok(Json(data))
}

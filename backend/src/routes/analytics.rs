//! Analytics routes (Phase 3) — ports the per-link + summary analytics endpoints.

use axum::extract::{Path, Query, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::Value;

use crate::auth::extractor::CurrentUser;
use crate::error::{ApiError, ErrorCode};
use crate::services::analytics::{self, Range};
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

fn internal<E: std::fmt::Display>(e: E) -> ApiError {
    tracing::error!("analytics route error: {e}");
    ApiError::new(ErrorCode::Internal)
}

async fn link_analytics(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<String>,
    Query(q): Query<RangeQuery>,
) -> Result<Json<Value>, ApiError> {
    let row: Option<(String, Option<String>)> =
        sqlx::query_as("SELECT id, owner_id FROM link WHERE id = ?")
            .bind(&id)
            .fetch_optional(&state.pool)
            .await
            .map_err(internal)?;
    let (link_id, owner_id) = row.ok_or_else(|| ApiError::new(ErrorCode::NotFound))?;
    if owner_id.as_deref() != Some(user.id.as_str()) {
        return Err(ApiError::new(ErrorCode::Forbidden));
    }
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
    let data = analytics::summary_analytics(&state.pool, &user.id, range, chrono::Utc::now()).await?;
    Ok(Json(data))
}

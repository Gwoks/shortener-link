//! Health route (Phase 3) — `GET /api/healthz`.

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/healthz", get(healthz))
}

async fn healthz(State(state): State<AppState>) -> Json<Value> {
    // Probe the SQLite connection (the only datastore; Redis was removed).
    let db_ok = sqlx::query_scalar::<_, i64>("SELECT 1")
        .fetch_one(&state.pool)
        .await
        .is_ok();
    Json(json!({ "status": "ok", "db": db_ok }))
}

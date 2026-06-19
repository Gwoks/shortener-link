//! Health route (Phase 3) — `GET /api/healthz`.

use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/healthz", get(healthz))
}

async fn healthz() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

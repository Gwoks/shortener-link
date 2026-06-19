//! QR PNG routes (Phase 3) — ports `src/app/api/links/[id]/qr` and
//! `src/app/api/qr/[code]`. The QR only ever encodes the public short URL.

use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use serde::Deserialize;

use crate::auth::extractor::CurrentUser;
use crate::error::{ApiError, ErrorCode};
use crate::services::qr::{self, QrSize};
use crate::services::serialize::short_url_for_code;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/links/:id/qr", get(qr_by_id))
        .route("/api/qr/:code", get(qr_by_code))
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct QrQuery {
    size: Option<String>,
    download: Option<String>,
}

fn internal<E: std::fmt::Display>(e: E) -> ApiError {
    tracing::error!("qr route error: {e}");
    ApiError::new(ErrorCode::Internal)
}

fn png_response(
    bytes: Vec<u8>,
    cache_control: &str,
    download_name: Option<&str>,
) -> Response {
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("image/png"));
    if let Ok(v) = HeaderValue::from_str(cache_control) {
        headers.insert(header::CACHE_CONTROL, v);
    }
    if let Some(name) = download_name {
        if let Ok(v) = HeaderValue::from_str(&format!("attachment; filename=\"{name}\"")) {
            headers.insert(header::CONTENT_DISPOSITION, v);
        }
    }
    (StatusCode::OK, headers, bytes).into_response()
}

fn size_or_md(v: Option<&str>) -> QrSize {
    QrSize::parse(v).unwrap_or(QrSize::Md)
}

fn size_label(size: QrSize) -> &'static str {
    match size {
        QrSize::Sm => "sm",
        QrSize::Md => "md",
        QrSize::Lg => "lg",
    }
}

async fn qr_by_id(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<String>,
    Query(q): Query<QrQuery>,
) -> Result<Response, ApiError> {
    let row: Option<(Option<String>, String, Option<String>)> =
        sqlx::query_as("SELECT owner_id, code, alias_display FROM link WHERE id = ?")
            .bind(&id)
            .fetch_optional(&state.pool)
            .await
            .map_err(internal)?;
    let (owner_id, code, alias_display) = row.ok_or_else(|| ApiError::new(ErrorCode::NotFound))?;
    if owner_id.as_deref() != Some(user.id.as_str()) {
        return Err(ApiError::new(ErrorCode::Forbidden));
    }

    let size = size_or_md(q.size.as_deref());
    let download = q.download.as_deref() == Some("1");
    let display_code = alias_display.unwrap_or(code);
    let url = short_url_for_code(&state.cfg.base_url, &display_code);
    let png = qr::png_sized(&url, size).map_err(internal)?;
    let name = format!("qr-{display_code}-{}.png", size_label(size));
    Ok(png_response(
        png,
        "private, max-age=3600",
        download.then_some(name.as_str()),
    ))
}

async fn qr_by_code(
    State(state): State<AppState>,
    Path(code): Path<String>,
    Query(q): Query<QrQuery>,
) -> Result<Response, ApiError> {
    let normalized = code.trim().to_lowercase();
    let row: Option<(String, Option<String>)> =
        sqlx::query_as("SELECT code, alias_display FROM link WHERE code = ?")
            .bind(&normalized)
            .fetch_optional(&state.pool)
            .await
            .map_err(internal)?;
    let (db_code, alias_display) = row.ok_or_else(|| ApiError::new(ErrorCode::NotFound))?;

    let size = size_or_md(q.size.as_deref());
    let download = q.download.as_deref() == Some("1");
    let display_code = alias_display.unwrap_or(db_code);
    let url = short_url_for_code(&state.cfg.base_url, &display_code);
    let png = qr::png_sized(&url, size).map_err(internal)?;
    let name = format!("qr-{display_code}-{}.png", size_label(size));
    Ok(png_response(
        png,
        "public, max-age=3600",
        download.then_some(name.as_str()),
    ))
}

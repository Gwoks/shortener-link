//! Static frontend serving + SPA fallback + single-segment route precedence (Phase 7, spec §3).
//!
//! Precedence for a request that isn't under `/api`:
//!   1. multi-segment paths (`/assets/x.js`, `/dashboard/links/:id`, `/_next/*`)
//!      → handled by `ServeDir(static_dir).fallback(ServeFile(index.html))` (the router fallback).
//!   2. single-segment paths (`/:seg`) → this `code_or_spa` dispatcher:
//!      a. a real static file at `static_dir/seg` (e.g. favicon.ico, robots.txt) → serve it,
//!      b. a reserved app root (dashboard, signin, dead-link, …) → serve the SPA `index.html`,
//!      c. otherwise → treat as a short code (`redirect::handle_code`): redirect / gate /
//!         dead-link (410) / not-found (404).

use std::path::Path as FsPath;

use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::routes::redirect::handle_code;
use crate::services::reserved::is_reserved;
use crate::state::AppState;

/// Guess a content-type from a file extension (covers the handful of single-segment
/// static assets a Vite build emits at the web root).
fn content_type_for(name: &str) -> &'static str {
    match name.rsplit('.').next().unwrap_or("") {
        "ico" => "image/x-icon",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "txt" => "text/plain; charset=utf-8",
        "xml" => "application/xml",
        "json" => "application/json",
        "webmanifest" => "application/manifest+json",
        "css" => "text/css; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "html" => "text/html; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// Read a file under `static_dir` if it exists and is a regular file. `name` is a single
/// path segment (no slashes), so this cannot traverse out of `static_dir`.
async fn try_static_file(static_dir: &str, name: &str) -> Option<Response> {
    if name.is_empty() || name.contains('/') || name.contains("..") {
        return None;
    }
    let path = FsPath::new(static_dir).join(name);
    if !path.is_file() {
        return None;
    }
    let bytes = tokio::fs::read(&path).await.ok()?;
    let mut resp = (StatusCode::OK, bytes).into_response();
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(content_type_for(name)),
    );
    Some(resp)
}

/// Serve the SPA shell (`static_dir/index.html`). Falls back to a tiny placeholder
/// when the bundle isn't built yet (keeps tests/dev from 500ing).
pub async fn serve_index(static_dir: &str) -> Response {
    let path = FsPath::new(static_dir).join("index.html");
    match tokio::fs::read(&path).await {
        Ok(bytes) => {
            let mut resp = (StatusCode::OK, bytes).into_response();
            resp.headers_mut().insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static("text/html; charset=utf-8"),
            );
            resp
        }
        Err(_) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
            "<!doctype html><title>Link Shortener</title><div id=\"root\"></div>",
        )
            .into_response(),
    }
}

/// Single-segment dispatcher (mounted at `GET /:code`).
pub async fn code_or_spa(
    State(state): State<AppState>,
    Path(seg): Path<String>,
    headers: HeaderMap,
) -> Response {
    let static_dir = state.cfg.static_dir.as_str();

    // (a) real static file at the web root (favicon.ico, robots.txt, …)
    if let Some(resp) = try_static_file(static_dir, &seg).await {
        return resp;
    }
    // (b) reserved app root → SPA shell (client router renders the page)
    if is_reserved(&seg) {
        return serve_index(static_dir).await;
    }
    // (c) short code → redirect / gate / dead / not-found
    handle_code(&state, &seg, &headers).await
}

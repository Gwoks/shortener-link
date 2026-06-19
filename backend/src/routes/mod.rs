//! HTTP route layer (Phases 3 + 5 + 7). Each submodule mirrors the oracle's
//! `src/app/api/**` files; `redirect` mirrors `src/app/[code]/route.ts`; `spa`
//! serves the static Vite bundle with SPA fallback (spec §3).

pub mod analytics;
pub mod guest;
pub mod health;
pub mod links;
pub mod qr;
pub mod redirect;
pub mod spa;

use std::path::Path;

use axum::routing::get;
use axum::Router;
use tower_http::services::{ServeDir, ServeFile};

use crate::state::AppState;

/// All `/api/*` routers merged (auth is merged separately in `build_app`).
pub fn api_router() -> Router<AppState> {
    Router::new()
        .merge(health::router())
        .merge(links::router())
        .merge(qr::router())
        .merge(analytics::router())
        .merge(guest::router())
}

/// Build the full application router: auth + `/api` + single-segment dispatcher
/// (`/:code` → static file / SPA root / short-code redirect) + a static fallback
/// service (`ServeDir` → `index.html`) for multi-segment asset & client routes.
/// Shared by `main` and the integration tests.
pub fn build_app(state: AppState) -> Router {
    let static_dir = state.cfg.static_dir.clone();
    let index_path = Path::new(&static_dir).join("index.html");
    let serve_dir = ServeDir::new(&static_dir).fallback(ServeFile::new(index_path));

    Router::new()
        .merge(crate::auth::router())
        .merge(api_router())
        .route("/:code", get(spa::code_or_spa))
        .fallback_service(serve_dir)
        .with_state(state)
}

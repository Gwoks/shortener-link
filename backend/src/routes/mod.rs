//! HTTP route layer (Phase 3 + 5). Each submodule mirrors the oracle's
//! `src/app/api/**` files; `redirect` mirrors `src/app/[code]/route.ts`.

pub mod analytics;
pub mod guest;
pub mod health;
pub mod links;
pub mod qr;
pub mod redirect;

use axum::Router;

use crate::state::AppState;

/// All `/api/*` routers merged (auth is merged separately in `main`).
pub fn api_router() -> Router<AppState> {
    Router::new()
        .merge(health::router())
        .merge(links::router())
        .merge(qr::router())
        .merge(analytics::router())
        .merge(guest::router())
}

/// The root-mounted redirect route (`GET /:code`).
pub fn redirect_router() -> Router<AppState> {
    redirect::router()
}

/// Build the full application router (auth + api + redirect) bound to `state`.
/// Shared by `main` and the integration tests.
pub fn build_app(state: AppState) -> Router {
    Router::new()
        .merge(crate::auth::router())
        .merge(api_router())
        .merge(redirect_router())
        .with_state(state)
}

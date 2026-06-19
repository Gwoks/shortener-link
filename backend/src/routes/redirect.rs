//! The HOT redirect path (Phase 5) — ports `src/app/[code]/route.ts`.
//!
//! Budget: one cache GET (+ an atomic INCR when maxClicks is set) + a
//! fire-and-forget click enqueue on a counted hit. The pure decision lives in
//! `services::redirect::resolve`; this handler does cache/DB orchestration,
//! unlock-cookie verification, max-click enforcement, and response shaping.

use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;

use crate::queue::ClickMsg;
use crate::routes::links::unlock_cookie_name;
use crate::services::clicker_pages::{dead_link_html, gate_html};
use crate::services::links::resolve_for_redirect;
use crate::services::redirect::{resolve, Decision, RedirectContext};
use crate::services::unlock::verify_token;
use crate::state::AppState;

pub const VID_COOKIE: &str = "vid";

pub fn router() -> Router<AppState> {
    Router::new().route("/:code", get(redirect))
}

fn code_shape_ok(code: &str) -> bool {
    let len = code.chars().count();
    if len < 3 || len > 50 {
        return false;
    }
    code.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn html_response(body: String, status: StatusCode) -> Response {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/html; charset=utf-8"),
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    (status, headers, body).into_response()
}

fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    let h = headers.get(header::COOKIE).and_then(|v| v.to_str().ok());
    crate::auth::extractor::cookie_from_header(h, name)
}

fn random_vid() -> String {
    use rand::Rng;
    const HEX: &[u8] = b"0123456789abcdef";
    let mut rng = rand::thread_rng();
    (0..32).map(|_| HEX[rng.gen_range(0..16)] as char).collect()
}

async fn redirect(
    State(state): State<AppState>,
    Path(code): Path<String>,
    headers: HeaderMap,
) -> Response {
    if !code_shape_ok(&code) {
        return html_response(dead_link_html("not-found"), StatusCode::NOT_FOUND);
    }

    let now = chrono::Utc::now().timestamp_millis();

    let resolved = resolve_for_redirect(&state, &code).await;
    let (link_view, link_id) = match &resolved {
        Some((v, id)) => (Some(v.clone()), Some(id.clone())),
        None => (None, None),
    };

    let unlocked = match &link_view {
        Some(v) if v.has_password => {
            let token = cookie_value(&headers, &unlock_cookie_name(&code));
            verify_token(token.as_deref(), &code, &state.cfg.auth_secret, now)
        }
        _ => false,
    };

    let ctx = RedirectContext {
        now,
        unlocked,
        live_click_count: state.cache.peek_click_count(&code),
    };

    let decision = resolve(link_view.as_ref(), &ctx);

    match decision {
        Decision::NotFound => html_response(dead_link_html("not-found"), StatusCode::NOT_FOUND),
        Decision::Dead { reason } => html_response(dead_link_html(&reason), StatusCode::GONE),
        Decision::Gate => html_response(gate_html(&code), StatusCode::OK),
        Decision::Redirect { url, status } => {
            let view = link_view.as_ref().expect("redirect implies a link");

            // Enforce max-clicks atomically: deny the (K+1)th hit (AC-21).
            if let Some(max) = view.max_clicks {
                let live = state.cache.incr_click_count(&code, view.click_count);
                if live > max {
                    return html_response(dead_link_html("max-clicks"), StatusCode::GONE);
                }
            }

            let vid_cookie = cookie_value(&headers, VID_COOKIE);

            // Fire-and-forget click enqueue (never blocks/errs the redirect).
            if let Some(id) = link_id {
                let _ = state.click_tx.send(ClickMsg {
                    link_id: id,
                    code: code.clone(),
                    occurred_at_ms: now,
                    ip: client_ip(&headers),
                    user_agent: header_str(&headers, header::USER_AGENT),
                    referer: header_str(&headers, header::REFERER),
                    vid_cookie: vid_cookie.clone(),
                });
            }

            let redirect_status = StatusCode::from_u16(status).unwrap_or(StatusCode::FOUND);
            let mut resp = redirect_status.into_response();
            if let Ok(loc) = HeaderValue::from_str(&url) {
                resp.headers_mut().insert(header::LOCATION, loc);
            }
            resp.headers_mut().insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("private, no-store"),
            );
            // Ensure an analytics cookie exists for cookie-first unique counting.
            if vid_cookie.is_none() {
                let cookie = crate::auth::extractor::build_cookie(
                    VID_COOKIE,
                    &random_vid(),
                    60 * 60 * 24 * 365,
                    false,
                );
                if let Ok(v) = HeaderValue::from_str(&cookie) {
                    resp.headers_mut().append(header::SET_COOKIE, v);
                }
            }
            resp
        }
    }
}

fn client_ip(headers: &HeaderMap) -> Option<String> {
    if let Some(xff) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
        if let Some(first) = xff.split(',').next() {
            let first = first.trim();
            if !first.is_empty() {
                return Some(first.to_string());
            }
        }
    }
    headers
        .get("x-real-ip")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn header_str(headers: &HeaderMap, name: header::HeaderName) -> Option<String> {
    headers.get(name).and_then(|v| v.to_str().ok()).map(|s| s.to_string())
}

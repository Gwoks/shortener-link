//! Integration tests for Cloudflare Turnstile enforcement on the protected
//! surfaces: login, register, single shorten, and bulk shorten.
//!
//! A tiny in-process mock of the siteverify endpoint stands in for Cloudflare:
//!   token "ok-<action>"           → success, hostname "localhost", that action
//!   token "ok-<action>-evilhost"  → success, but hostname "evil.example"
//!   anything else                 → success=false, invalid-input-response

use std::collections::HashMap;
use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::routing::post;
use axum::{Form, Json, Router};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use shortener::config::Config;
use shortener::db;
use shortener::queue;
use shortener::routes;
use shortener::services::cache::Cache;
use shortener::services::ratelimit::Limiter;
use shortener::state::AppState;
use tower::ServiceExt;

const MOCK_SECRET: &str = "mock-turnstile-secret";
const TOKEN_HEADER: &str = "cf-turnstile-response";

struct TestApp {
    router: axum::Router,
    _guard: tempfile::TempDir,
}

async fn mock_siteverify(Form(form): Form<HashMap<String, String>>) -> Json<Value> {
    if form.get("secret").map(String::as_str) != Some(MOCK_SECRET) {
        return Json(json!({ "success": false, "error-codes": ["invalid-input-secret"] }));
    }
    let token = form.get("response").cloned().unwrap_or_default();
    let Some(rest) = token.strip_prefix("ok-") else {
        return Json(json!({ "success": false, "error-codes": ["invalid-input-response"] }));
    };
    let (action, hostname) = match rest.strip_suffix("-evilhost") {
        Some(a) => (a.to_string(), "evil.example"),
        None => (rest.to_string(), "localhost"),
    };
    Json(json!({ "success": true, "action": action, "hostname": hostname, "error-codes": [] }))
}

/// Spawn the mock siteverify server and return its URL.
async fn spawn_mock() -> String {
    let app = Router::new().route("/siteverify", post(mock_siteverify));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{addr}/siteverify")
}

async fn setup(turnstile_secret: &str, verify_url: &str) -> TestApp {
    let dir = tempfile::tempdir().unwrap();
    let path_str = dir.path().join("test.db").to_str().unwrap().to_string();

    let mut cfg = Config::from_env();
    cfg.sqlite_path = path_str.clone();
    cfg.base_url = "http://localhost:8080".into();
    cfg.auth_secret = "test-secret-key-for-integration-tests-32b".into();
    cfg.turnstile_secret = turnstile_secret.into();
    cfg.turnstile_verify_url = verify_url.into();

    let pool = db::pool(&path_str).await.unwrap();
    db::migrate(&pool).await.unwrap();

    let (click_tx, mut click_rx, scrape_tx, mut scrape_rx) = queue::channels();
    tokio::spawn(async move { while click_rx.recv().await.is_some() {} });
    tokio::spawn(async move { while scrape_rx.recv().await.is_some() {} });

    let state = AppState {
        pool,
        cfg: Arc::new(cfg),
        cache: Arc::new(Cache::new(3600, 60, 1000)),
        limiter: Arc::new(Limiter::new()),
        geo: Arc::new(None),
        click_tx,
        scrape_tx,
    };
    TestApp {
        router: routes::build_app(state),
        _guard: dir,
    }
}

async fn enabled_app() -> TestApp {
    let url = spawn_mock().await;
    setup(MOCK_SECRET, &url).await
}

/// POST JSON with an optional token and cookie; returns (status, set-cookies, body).
async fn post_json(
    app: &TestApp,
    uri: &str,
    token: Option<&str>,
    cookie: Option<&str>,
    body: Value,
) -> (StatusCode, Vec<String>, Value) {
    let mut req = Request::builder()
        .method("POST")
        .uri(uri)
        .header("content-type", "application/json");
    if let Some(t) = token {
        req = req.header(TOKEN_HEADER, t);
    }
    if let Some(c) = cookie {
        req = req.header("cookie", c);
    }
    let req = req
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let cookies = resp
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok().map(str::to_string))
        .collect();
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, cookies, json)
}

fn assert_captcha_failed(status: StatusCode, body: &Value) {
    assert_eq!(status, StatusCode::FORBIDDEN, "body: {body}");
    assert_eq!(body["error"]["code"], "CAPTCHA_FAILED");
}

fn creds(email: &str) -> Value {
    json!({ "email": email, "password": "password123" })
}

fn link_body() -> Value {
    json!({ "url": "https://example.com/x" })
}

fn session_cookie(cookies: &[String]) -> String {
    cookies
        .iter()
        .find_map(|c| {
            c.strip_prefix("session=")
                .map(|r| r.split(';').next().unwrap_or(""))
        })
        .map(|v| format!("session={v}"))
        .expect("session cookie")
}

// ─── missing / bad tokens are rejected on every protected surface ───────────

#[tokio::test]
async fn register_without_token_is_rejected() {
    let app = enabled_app().await;
    let (status, _, body) = post_json(
        &app,
        "/api/auth/register",
        None,
        None,
        creds("a@example.com"),
    )
    .await;
    assert_captcha_failed(status, &body);
}

#[tokio::test]
async fn login_without_token_is_rejected() {
    let app = enabled_app().await;
    let (status, _, body) =
        post_json(&app, "/api/auth/login", None, None, creds("a@example.com")).await;
    assert_captcha_failed(status, &body);
}

#[tokio::test]
async fn shorten_without_token_is_rejected() {
    let app = enabled_app().await;
    let (status, _, body) = post_json(&app, "/api/links", None, None, link_body()).await;
    assert_captcha_failed(status, &body);
}

#[tokio::test]
async fn invalid_token_is_rejected() {
    let app = enabled_app().await;
    let (status, _, body) = post_json(&app, "/api/links", Some("garbage"), None, link_body()).await;
    assert_captcha_failed(status, &body);
}

#[tokio::test]
async fn oversized_token_is_rejected() {
    let app = enabled_app().await;
    let token = format!("ok-shorten{}", "x".repeat(2100));
    let (status, _, body) = post_json(&app, "/api/links", Some(&token), None, link_body()).await;
    assert_captcha_failed(status, &body);
}

// ─── valid tokens pass ───────────────────────────────────────────────────────

#[tokio::test]
async fn signup_login_and_shorten_with_valid_tokens() {
    let app = enabled_app().await;

    let (status, _, _) = post_json(
        &app,
        "/api/auth/register",
        Some("ok-signup"),
        None,
        creds("b@example.com"),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);

    let (status, _, _) = post_json(
        &app,
        "/api/auth/login",
        Some("ok-login"),
        None,
        creds("b@example.com"),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, _, body) =
        post_json(&app, "/api/links", Some("ok-shorten"), None, link_body()).await;
    assert_eq!(status, StatusCode::CREATED, "body: {body}");
}

#[tokio::test]
async fn bulk_requires_token() {
    let app = enabled_app().await;
    let (status, cookies, _) = post_json(
        &app,
        "/api/auth/register",
        Some("ok-signup"),
        None,
        creds("c@example.com"),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let session = session_cookie(&cookies);
    let bulk_body = json!({ "urls": ["https://example.com/b1"] });

    let (status, _, body) = post_json(
        &app,
        "/api/links/bulk",
        None,
        Some(&session),
        bulk_body.clone(),
    )
    .await;
    assert_captcha_failed(status, &body);

    let (status, _, _) = post_json(
        &app,
        "/api/links/bulk",
        Some("ok-shorten"),
        Some(&session),
        bulk_body,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}

// ─── action / hostname binding, fail-closed ──────────────────────────────────

#[tokio::test]
async fn token_for_another_action_is_rejected() {
    let app = enabled_app().await;
    let (status, _, body) =
        post_json(&app, "/api/links", Some("ok-login"), None, link_body()).await;
    assert_captcha_failed(status, &body);
}

#[tokio::test]
async fn token_for_another_hostname_is_rejected() {
    let app = enabled_app().await;
    let (status, _, body) = post_json(
        &app,
        "/api/links",
        Some("ok-shorten-evilhost"),
        None,
        link_body(),
    )
    .await;
    assert_captcha_failed(status, &body);
}

#[tokio::test]
async fn unreachable_siteverify_fails_closed() {
    // Nothing listens on port 9 locally: connection refused → must reject.
    let app = setup(MOCK_SECRET, "http://127.0.0.1:9/siteverify").await;
    let (status, _, body) =
        post_json(&app, "/api/links", Some("ok-shorten"), None, link_body()).await;
    assert_captcha_failed(status, &body);
}

// ─── disabled when no secret is configured ───────────────────────────────────

#[tokio::test]
async fn disabled_when_secret_is_blank() {
    let app = setup("", "http://127.0.0.1:9/siteverify").await;
    let (status, _, _) = post_json(&app, "/api/links", None, None, link_body()).await;
    assert_eq!(status, StatusCode::CREATED);
}

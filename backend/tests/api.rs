//! Integration tests for the ported HTTP layer (Phases 3/4/5). Builds a real
//! router over a temp SQLite database and drives it with `tower::ServiceExt`.

use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use shortener::config::Config;
use shortener::queue;
use shortener::routes;
use shortener::services::cache::Cache;
use shortener::services::ratelimit::Limiter;
use shortener::state::AppState;
use shortener::{db, seed};
use tower::ServiceExt;

struct TestApp {
    router: axum::Router,
    _guard: tempfile::TempDir,
}

async fn setup() -> TestApp {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("test.db");
    let path_str = path.to_str().unwrap().to_string();

    // Deterministic config for tests.
    std::env::set_var("AUTH_SECRET", "test-secret-key-for-integration-tests-32b");
    std::env::set_var("BASE_URL", "http://localhost:8080");
    std::env::set_var("VISITOR_IP_PEPPER", "test-pepper");

    let mut cfg = Config::from_env();
    cfg.sqlite_path = path_str.clone();
    cfg.base_url = "http://localhost:8080".into();
    cfg.auth_secret = "test-secret-key-for-integration-tests-32b".into();

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

/// Send a request and return (status, set-cookie headers, json/bytes body).
async fn send(
    app: &TestApp,
    method: &str,
    uri: &str,
    cookie: Option<&str>,
    body: Option<Value>,
) -> (StatusCode, Vec<String>, Vec<u8>) {
    let mut req = Request::builder().method(method).uri(uri);
    if let Some(c) = cookie {
        req = req.header("cookie", c);
    }
    let req = if let Some(b) = body {
        req.header("content-type", "application/json")
            .body(Body::from(serde_json::to_vec(&b).unwrap()))
            .unwrap()
    } else {
        req.body(Body::empty()).unwrap()
    };

    let resp = app.router.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let cookies: Vec<String> = resp
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok().map(|s| s.to_string()))
        .collect();
    let bytes = resp.into_body().collect().await.unwrap().to_bytes().to_vec();
    (status, cookies, bytes)
}

fn json_of(bytes: &[u8]) -> Value {
    serde_json::from_slice(bytes).unwrap()
}

/// Extract the `session=...` cookie value from Set-Cookie headers.
fn session_from(cookies: &[String]) -> Option<String> {
    for c in cookies {
        if let Some(rest) = c.strip_prefix("session=") {
            let val = rest.split(';').next().unwrap_or("");
            return Some(format!("session={val}"));
        }
    }
    None
}

async fn register_and_login(app: &TestApp, email: &str) -> String {
    let (status, cookies, _) = send(
        app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": email, "password": "password123", "name": "Test" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "register should 201");
    session_from(&cookies).expect("register sets session cookie")
}

#[tokio::test]
async fn full_link_lifecycle() {
    let app = setup().await;
    let session = register_and_login(&app, "owner@example.com").await;

    // create
    let (status, _, body) = send(
        &app,
        "POST",
        "/api/links",
        Some(&session),
        Some(json!({ "url": "https://example.com/page" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let v = json_of(&body);
    let link = &v["link"];
    for key in [
        "id", "code", "shortUrl", "destinationUrl", "status", "metaStatus", "metaTitle",
        "metaDescription", "hasPassword", "expiresAt", "maxClicks", "clickCount", "isGuest",
        "createdAt", "updatedAt",
    ] {
        assert!(link.get(key).is_some(), "create link JSON missing key {key}");
    }
    assert_eq!(link["destinationUrl"], "https://example.com/page");
    assert_eq!(link["status"], "ACTIVE");
    assert_eq!(link["hasPassword"], false);
    assert_eq!(link["isGuest"], false);
    let id = link["id"].as_str().unwrap().to_string();

    // list
    let (status, _, body) = send(&app, "GET", "/api/links", Some(&session), None).await;
    assert_eq!(status, StatusCode::OK);
    let v = json_of(&body);
    assert_eq!(v["total"], 1);
    assert_eq!(v["page"], 1);
    assert_eq!(v["pageSize"], 20);
    assert_eq!(v["items"].as_array().unwrap().len(), 1);

    // get
    let (status, _, body) = send(&app, "GET", &format!("/api/links/{id}"), Some(&session), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json_of(&body)["link"]["id"], id);

    // patch
    let (status, _, body) = send(
        &app,
        "PATCH",
        &format!("/api/links/{id}"),
        Some(&session),
        Some(json!({ "destinationUrl": "https://example.com/changed", "maxClicks": 5 })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let v = json_of(&body);
    assert_eq!(v["link"]["destinationUrl"], "https://example.com/changed");
    assert_eq!(v["link"]["maxClicks"], 5);

    // delete
    let (status, _, _) = send(&app, "DELETE", &format!("/api/links/{id}"), Some(&session), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    // get after delete → 404
    let (status, _, _) = send(&app, "GET", &format!("/api/links/{id}"), Some(&session), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn list_requires_auth() {
    let app = setup().await;
    let (status, _, body) = send(&app, "GET", "/api/links", None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(json_of(&body)["error"]["code"], "UNAUTHENTICATED");
}

#[tokio::test]
async fn check_alias_available_taken_reserved() {
    let app = setup().await;
    let session = register_and_login(&app, "alias@example.com").await;

    // available
    let (status, _, body) = send(&app, "GET", "/api/links/check-alias?alias=myfreealias", None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json_of(&body)["available"], true);

    // reserved
    let (_, _, body) = send(&app, "GET", "/api/links/check-alias?alias=admin", None, None).await;
    let v = json_of(&body);
    assert_eq!(v["available"], false);
    assert_eq!(v["reason"], "reserved");

    // invalid (too short)
    let (_, _, body) = send(&app, "GET", "/api/links/check-alias?alias=ab", None, None).await;
    assert_eq!(json_of(&body)["reason"], "invalid");

    // create a link with an alias, then it's taken
    let (status, _, _) = send(
        &app,
        "POST",
        "/api/links",
        Some(&session),
        Some(json!({ "url": "https://example.com", "alias": "takenone" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let (_, _, body) = send(&app, "GET", "/api/links/check-alias?alias=takenone", None, None).await;
    let v = json_of(&body);
    assert_eq!(v["available"], false);
    assert_eq!(v["reason"], "taken");
}

#[tokio::test]
async fn bulk_over_limit_413() {
    let app = setup().await;
    let session = register_and_login(&app, "bulk@example.com").await;

    let urls: Vec<String> = (0..101).map(|i| format!("https://example.com/{i}")).collect();
    let (status, _, body) = send(
        &app,
        "POST",
        "/api/links/bulk",
        Some(&session),
        Some(json!({ "urls": urls })),
    )
    .await;
    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(json_of(&body)["error"]["code"], "BULK_LIMIT_EXCEEDED");
}

#[tokio::test]
async fn bulk_partial_success() {
    let app = setup().await;
    let session = register_and_login(&app, "bulk2@example.com").await;

    let (status, _, body) = send(
        &app,
        "POST",
        "/api/links/bulk",
        Some(&session),
        Some(json!({ "urls": ["https://good.example.com", "not-a-url"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let results = json_of(&body)["results"].as_array().unwrap().clone();
    assert_eq!(results.len(), 2);
    assert_eq!(results[0]["ok"], true);
    assert_eq!(results[1]["ok"], false);
    assert_eq!(results[1]["error"]["code"], "INVALID_URL");
}

#[tokio::test]
async fn unlock_wrong_then_right() {
    let app = setup().await;
    let session = register_and_login(&app, "pw@example.com").await;

    // Create a password-protected link.
    let (status, _, body) = send(
        &app,
        "POST",
        "/api/links",
        Some(&session),
        Some(json!({ "url": "https://secret.example.com", "password": "letmein" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let code = json_of(&body)["link"]["code"].as_str().unwrap().to_string();

    // wrong password → 401 WRONG_PASSWORD
    let (status, _, body) = send(
        &app,
        "POST",
        &format!("/api/links/{code}/unlock"),
        None,
        Some(json!({ "password": "nope" })),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(json_of(&body)["error"]["code"], "WRONG_PASSWORD");

    // right password → 200 + unlock cookie
    let (status, cookies, body) = send(
        &app,
        "POST",
        &format!("/api/links/{code}/unlock"),
        None,
        Some(json!({ "password": "letmein" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json_of(&body)["ok"], true);
    assert!(cookies.iter().any(|c| c.starts_with(&format!("unlock_{}=", code.to_lowercase()))));
}

#[tokio::test]
async fn redirect_active_password_unknown() {
    let app = setup().await;
    let session = register_and_login(&app, "redir@example.com").await;

    // active link
    let (_, _, body) = send(
        &app,
        "POST",
        "/api/links",
        Some(&session),
        Some(json!({ "url": "https://dest.example.com/x", "alias": "goactive" })),
    )
    .await;
    let code = json_of(&body)["link"]["code"].as_str().unwrap().to_string();

    let (status, _, _) = send(&app, "GET", &format!("/{code}"), None, None).await;
    assert!(status == StatusCode::FOUND || status == StatusCode::MOVED_PERMANENTLY);

    // password-protected → gate 200 html
    let (_, _, body) = send(
        &app,
        "POST",
        "/api/links",
        Some(&session),
        Some(json!({ "url": "https://dest.example.com/p", "alias": "gatelink", "password": "pw1234" })),
    )
    .await;
    let pcode = json_of(&body)["link"]["code"].as_str().unwrap().to_string();
    let (status, _, body) = send(&app, "GET", &format!("/{pcode}"), None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(String::from_utf8_lossy(&body).contains("password protected"));

    // unknown code → 404 html
    let (status, _, body) = send(&app, "GET", "/doesnotexist", None, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(String::from_utf8_lossy(&body).contains("Link not found"));

    // bad shape → 404
    let (status, _, _) = send(&app, "GET", "/ab", None, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn redirect_expired_is_410() {
    let app = setup().await;
    // Insert an expired link directly via a fresh pool on the same temp db is not
    // accessible; instead create via API then PATCH expiry into the past.
    let session = register_and_login(&app, "exp@example.com").await;
    let (_, _, body) = send(
        &app,
        "POST",
        "/api/links",
        Some(&session),
        Some(json!({ "url": "https://dest.example.com/e", "alias": "explink" })),
    )
    .await;
    let id = json_of(&body)["link"]["id"].as_str().unwrap().to_string();
    let code = json_of(&body)["link"]["code"].as_str().unwrap().to_string();

    // Patch to a past expiry.
    let (status, _, _) = send(
        &app,
        "PATCH",
        &format!("/api/links/{id}"),
        Some(&session),
        Some(json!({ "expiresAt": "2000-01-01T00:00:00.000Z" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, _, body) = send(&app, "GET", &format!("/{code}"), None, None).await;
    assert_eq!(status, StatusCode::GONE);
    assert!(String::from_utf8_lossy(&body).contains("expired"));
}

#[tokio::test]
async fn session_authed_vs_anon() {
    let app = setup().await;

    // anon
    let (status, _, body) = send(&app, "GET", "/api/session", None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json_of(&body)["user"], Value::Null);

    // authed
    let session = register_and_login(&app, "sess@example.com").await;
    let (status, _, body) = send(&app, "GET", "/api/session", Some(&session), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json_of(&body)["user"]["email"], "sess@example.com");
}

#[tokio::test]
async fn register_duplicate_is_409() {
    let app = setup().await;
    let _ = register_and_login(&app, "dup@example.com").await;
    let (status, _, body) = send(
        &app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": "dup@example.com", "password": "password123" })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(json_of(&body)["error"]["code"], "EMAIL_TAKEN");
}

#[tokio::test]
async fn login_bad_credentials() {
    let app = setup().await;
    let _ = register_and_login(&app, "login@example.com").await;
    let (status, _, body) = send(
        &app,
        "POST",
        "/api/auth/login",
        None,
        Some(json!({ "email": "login@example.com", "password": "wrongpass" })),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(json_of(&body)["error"]["code"], "UNAUTHENTICATED");
}

#[tokio::test]
async fn ownership_forbidden() {
    let app = setup().await;
    let s1 = register_and_login(&app, "a1@example.com").await;
    let s2 = register_and_login(&app, "a2@example.com").await;

    let (_, _, body) = send(
        &app,
        "POST",
        "/api/links",
        Some(&s1),
        Some(json!({ "url": "https://example.com/owned" })),
    )
    .await;
    let id = json_of(&body)["link"]["id"].as_str().unwrap().to_string();

    let (status, _, body) = send(&app, "GET", &format!("/api/links/{id}"), Some(&s2), None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(json_of(&body)["error"]["code"], "FORBIDDEN");
}

#[tokio::test]
async fn healthz_ok() {
    let app = setup().await;
    let (status, _, body) = send(&app, "GET", "/api/healthz", None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json_of(&body)["status"], "ok");
}

#[tokio::test]
async fn guest_create_sets_cookie() {
    let app = setup().await;
    let (status, cookies, body) = send(
        &app,
        "POST",
        "/api/links",
        None,
        Some(json!({ "url": "https://guest.example.com" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(json_of(&body)["link"]["isGuest"], true);
    assert!(cookies.iter().any(|c| c.starts_with("guest_id=")));
}

#[tokio::test]
async fn redirect_enforces_max_clicks_cap() {
    let app = setup().await;
    let session = register_and_login(&app, "cap@example.com").await;
    let (_, _, body) = send(
        &app,
        "POST",
        "/api/links",
        Some(&session),
        Some(json!({ "url": "https://dest.example.com/cap", "alias": "caplink", "maxClicks": 1 })),
    )
    .await;
    let code = json_of(&body)["link"]["code"].as_str().unwrap().to_string();

    // First hit redirects (counts as click 1).
    let (status, _, _) = send(&app, "GET", &format!("/{code}"), None, None).await;
    assert!(status == StatusCode::FOUND || status == StatusCode::MOVED_PERMANENTLY);

    // Second hit (the K+1th) is denied with 410 max-clicks.
    let (status, _, body) = send(&app, "GET", &format!("/{code}"), None, None).await;
    assert_eq!(status, StatusCode::GONE);
    assert!(String::from_utf8_lossy(&body).contains("reached its limit"));
}

#[tokio::test]
async fn seed_runs_on_fresh_db() {
    let pool = db::pool(":memory:").await.unwrap();
    db::migrate(&pool).await.unwrap();
    seed::run(&pool).await.unwrap();
}

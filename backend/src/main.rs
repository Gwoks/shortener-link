use axum::{routing::get, Json, Router};
use serde_json::json;

async fn healthz() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok" }))
}

#[tokio::main]
async fn main() {
    let port: u16 = std::env::var("PUBLIC_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8080);

    let app = Router::new().route("/api/healthz", get(healthz));

    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    println!("shortener listening on {addr}");
    axum::serve(listener, app).await.unwrap();
}

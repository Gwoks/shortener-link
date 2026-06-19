use axum::{routing::get, Json, Router};
use serde_json::json;
use shortener::{config::Config, db};

async fn healthz() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok" }))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let cfg = Config::from_env();

    // Ensure the SQLite parent directory exists before opening.
    if cfg.sqlite_path != ":memory:" {
        if let Some(parent) = std::path::Path::new(&cfg.sqlite_path).parent() {
            std::fs::create_dir_all(parent).ok();
        }
    }

    let pool = db::pool(&cfg.sqlite_path).await?;
    db::migrate(&pool).await?;

    let app = Router::new().route("/api/healthz", get(healthz));

    let addr = format!("0.0.0.0:{}", cfg.public_port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("shortener listening on {addr}");
    axum::serve(listener, app).await?;
    Ok(())
}

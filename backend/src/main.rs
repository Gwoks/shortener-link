use std::sync::Arc;

use shortener::config::Config;
use shortener::queue;
use shortener::routes;
use shortener::services::cache::Cache;
use shortener::services::ratelimit::Limiter;
use shortener::state::AppState;
use shortener::db;

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

    // Optional GeoIP reader — None when the .mmdb is absent (geo degrades to None).
    let geo = match maxminddb::Reader::open_readfile(&cfg.geoip_db_path) {
        Ok(reader) => Some(reader),
        Err(_) => {
            tracing::info!("geoip db not found at {} — geo lookups disabled", cfg.geoip_db_path);
            None
        }
    };

    let cache = Cache::new(cfg.redirect_cache_ttl, cfg.redirect_negative_cache_ttl, 10_000);
    let (click_tx, mut click_rx, scrape_tx, mut scrape_rx) = queue::channels();

    // TODO Phase 6: replace these drains with the real click/scrape consumers.
    // For now we drain both channels so the senders never error (channel open).
    tokio::spawn(async move {
        while click_rx.recv().await.is_some() {}
    });
    tokio::spawn(async move {
        while scrape_rx.recv().await.is_some() {}
    });

    let cfg = Arc::new(cfg);
    let state = AppState {
        pool,
        cfg: cfg.clone(),
        cache: Arc::new(cache),
        limiter: Arc::new(Limiter::new()),
        geo: Arc::new(geo),
        click_tx,
        scrape_tx,
    };

    let app = routes::build_app(state);

    let addr = format!("0.0.0.0:{}", cfg.public_port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("shortener listening on {addr}");
    axum::serve(listener, app).await?;
    Ok(())
}

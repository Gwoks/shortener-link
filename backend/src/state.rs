//! Shared Axum application state (spec §3). Cloneable handle passed to every handler.

use std::sync::Arc;

use sqlx::SqlitePool;
use tokio::sync::mpsc::UnboundedSender;

use crate::config::Config;
use crate::queue::{ClickMsg, ScrapeMsg};
use crate::services::cache::Cache;
use crate::services::ratelimit::Limiter;

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub cfg: Arc<Config>,
    pub cache: Arc<Cache>,
    pub limiter: Arc<Limiter>,
    /// Optional GeoIP reader (None when the .mmdb is absent → geo lookups degrade to None).
    pub geo: Arc<Option<maxminddb::Reader<Vec<u8>>>>,
    pub click_tx: UnboundedSender<ClickMsg>,
    pub scrape_tx: UnboundedSender<ScrapeMsg>,
}

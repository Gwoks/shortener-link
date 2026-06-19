//! In-process work queues replacing Redis streams (spec §5.5).
//! Producers: the redirect route (clicks) and link create/update (scrape).
//! Consumers: the tokio background tasks (Phase 6).

use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

/// One click to be ingested durably. Mirrors `ClickEventInput` in `src/lib/events.ts`:
/// the redirect path enqueues raw signals; the consumer categorizes/geos/parses.
#[derive(Debug, Clone)]
pub struct ClickMsg {
    pub link_id: String,
    pub code: String,
    pub occurred_at_ms: i64,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    /// analytics cookie id (cookie-first unique detection, A-UNIQUE)
    pub vid_cookie: Option<String>,
}

/// A link id whose destination metadata should be scraped.
pub type ScrapeMsg = String;

/// Create the click + scrape channels. `main` keeps the receivers (handed to the
/// background tasks) and clones the senders into `AppState`.
pub fn channels() -> (
    UnboundedSender<ClickMsg>,
    UnboundedReceiver<ClickMsg>,
    UnboundedSender<ScrapeMsg>,
    UnboundedReceiver<ScrapeMsg>,
) {
    let (click_tx, click_rx) = unbounded_channel::<ClickMsg>();
    let (scrape_tx, scrape_rx) = unbounded_channel::<ScrapeMsg>();
    (click_tx, click_rx, scrape_tx, scrape_rx)
}

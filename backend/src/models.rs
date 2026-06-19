//! Row structs mirroring the SQLite schema (snake_case columns).
//! API JSON shaping (camelCase) lives in the serialize layer (Phase 3), not here.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub email_verified: Option<String>,
    pub name: Option<String>,
    pub image: Option<String>,
    pub password_hash: Option<String>,
    pub role: String,
    pub created_at: String,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub user_id: String,
    pub r#type: String,
    pub provider: String,
    pub provider_account_id: String,
    pub refresh_token: Option<String>,
    pub access_token: Option<String>,
    pub expires_at: Option<i64>,
    pub token_type: Option<String>,
    pub scope: Option<String>,
    pub id_token: Option<String>,
    pub session_state: Option<String>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Link {
    pub id: String,
    pub code: String,
    pub alias_display: Option<String>,
    pub destination_url: String,
    pub owner_id: Option<String>,
    pub is_guest: bool,
    pub guest_key: Option<String>,
    pub status: String,
    pub meta_status: String,
    pub meta_title: Option<String>,
    pub meta_description: Option<String>,
    pub password_hash: Option<String>,
    pub expires_at: Option<String>,
    pub max_clicks: Option<i64>,
    pub click_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct ClickEvent {
    pub id: String,
    pub link_id: String,
    pub occurred_at: String,
    pub visitor_key: String,
    pub is_unique: bool,
    pub referrer_category: String,
    pub referrer_host: Option<String>,
    pub country: Option<String>,
    pub city: Option<String>,
    pub device_type: Option<String>,
    pub browser: Option<String>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct ClickRollup {
    pub id: String,
    pub link_id: String,
    pub day: String,
    pub clicks: i64,
    pub uniques: i64,
    pub by_referrer: String,
    pub by_country: String,
    pub by_device: String,
    pub by_browser: String,
}

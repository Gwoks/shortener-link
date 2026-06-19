//! Link Shortener backend — single Axum binary over SQLite.
//! Library crate so `main.rs` and `bin/seed.rs` share modules.

pub mod config;
pub mod db;
pub mod ids;
pub mod models;
pub mod seed;

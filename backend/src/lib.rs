//! Link Shortener backend — single Axum binary over SQLite.
//! Library crate so `main.rs` and `bin/seed.rs` share modules.

pub mod auth;
pub mod config;
pub mod db;
pub mod error;
pub mod ids;
pub mod models;
pub mod queue;
pub mod routes;
pub mod seed;
pub mod services;
pub mod state;
pub mod tasks;

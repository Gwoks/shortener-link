//! `cargo run --bin seed` — seed demo data into the configured SQLite DB.

use shortener::{config::Config, db, seed};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cfg = Config::from_env();
    if cfg.sqlite_path != ":memory:" {
        if let Some(parent) = std::path::Path::new(&cfg.sqlite_path).parent() {
            std::fs::create_dir_all(parent).ok();
        }
    }
    let pool = db::pool(&cfg.sqlite_path).await?;
    db::migrate(&pool).await?;
    seed::run(&pool).await?;
    println!("Seeded accounts (email / password — role):");
    println!("  admin@example.com / admin-password-123 — ADMIN");
    println!("  user@example.com  / user-password-123  — USER");
    println!("  demo@example.com  / demo-password-123  — USER");
    println!("Seeded 6 sample links.");
    Ok(())
}

//! SQLite pool + pragmas + migrations (spec §6: WAL, foreign_keys, busy_timeout).

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::SqlitePool;
use std::str::FromStr;
use std::time::Duration;

/// Open (creating if missing) a WAL-mode SQLite pool with foreign keys enforced.
pub async fn pool(sqlite_path: &str) -> anyhow::Result<SqlitePool> {
    let url = if sqlite_path == ":memory:" {
        "sqlite::memory:".to_string()
    } else {
        format!("sqlite://{sqlite_path}")
    };
    let opts = SqliteConnectOptions::from_str(&url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_secs(5))
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(opts)
        .await?;
    Ok(pool)
}

/// Run embedded migrations from ./migrations.
pub async fn migrate(pool: &SqlitePool) -> anyhow::Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::cuid;

    #[tokio::test]
    async fn migrate_then_round_trip_link() {
        let pool = pool(":memory:").await.unwrap();
        migrate(&pool).await.unwrap();

        let id = cuid();
        sqlx::query(
            "INSERT INTO link (id, code, destination_url, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind("abc123")
        .bind("https://example.com")
        .bind("2026-06-19T00:00:00.000Z")
        .bind("2026-06-19T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

        let row: crate::models::Link =
            sqlx::query_as("SELECT * FROM link WHERE code = ?")
                .bind("abc123")
                .fetch_one(&pool)
                .await
                .unwrap();

        assert_eq!(row.id, id);
        assert_eq!(row.destination_url, "https://example.com");
        assert_eq!(row.status, "ACTIVE");
        assert_eq!(row.meta_status, "PENDING");
        assert_eq!(row.click_count, 0);
        assert!(!row.is_guest);
    }
}

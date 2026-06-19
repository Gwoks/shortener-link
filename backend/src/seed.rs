//! Demo seed data — ported from `prisma/seed.ts` (spec §6/§8). Idempotent.

use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
use argon2::Argon2;
use chrono::{Duration, SecondsFormat, Utc};
use sqlx::SqlitePool;

use crate::ids::cuid;

fn hash_password(password: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow::anyhow!("argon2: {e}"))?
        .to_string();
    Ok(hash)
}

fn iso(dt: chrono::DateTime<Utc>) -> String {
    dt.to_rfc3339_opts(SecondsFormat::Millis, true)
}

struct Account {
    email: &'static str,
    password: &'static str,
    name: &'static str,
    role: &'static str,
}

const ACCOUNTS: &[Account] = &[
    Account { email: "admin@example.com", password: "admin-password-123", name: "Admin User", role: "ADMIN" },
    Account { email: "user@example.com", password: "user-password-123", name: "Regular User", role: "USER" },
    Account { email: "demo@example.com", password: "demo-password-123", name: "Demo User", role: "USER" },
];

/// Seed sample accounts + links. Safe to re-run (upserts on email / code).
pub async fn run(pool: &SqlitePool) -> anyhow::Result<()> {
    let now = Utc::now();

    for acct in ACCOUNTS {
        let password_hash = hash_password(acct.password)?;
        sqlx::query(
            "INSERT INTO \"user\" (id, email, name, role, password_hash, email_verified, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(email) DO UPDATE SET role = excluded.role",
        )
        .bind(cuid())
        .bind(acct.email)
        .bind(acct.name)
        .bind(acct.role)
        .bind(&password_hash)
        .bind(iso(now))
        .bind(iso(now))
        .execute(pool)
        .await?;
    }

    let demo_id: String = sqlx::query_scalar("SELECT id FROM \"user\" WHERE email = ?")
        .bind("demo@example.com")
        .fetch_one(pool)
        .await?;
    let admin_id: String = sqlx::query_scalar("SELECT id FROM \"user\" WHERE email = ?")
        .bind("admin@example.com")
        .fetch_one(pool)
        .await?;
    let link_password_hash = hash_password("secret")?;

    // (code, alias_display, destination, owner, is_guest, guest_key, status, meta_status,
    //  meta_title, meta_description, password_hash, expires_at, max_clicks)
    let links: Vec<(
        &str, Option<&str>, &str, Option<String>, bool, Option<&str>, &str, &str,
        Option<&str>, Option<&str>, Option<String>, Option<String>, Option<i64>,
    )> = vec![
        ("demo01", None, "https://example.com/welcome", Some(demo_id.clone()), false, None, "ACTIVE", "READY",
         Some("Example Domain"), Some("Illustrative destination for the demo dashboard."), None, None, None),
        ("demopw", Some("demoPW"), "https://example.com/protected", Some(demo_id.clone()), false, None, "ACTIVE", "READY",
         Some("Protected Page"), None, Some(link_password_hash.clone()), None, None),
        ("demoex", None, "https://example.com/expired", Some(demo_id.clone()), false, None, "ACTIVE", "READY",
         None, None, None, Some(iso(now - Duration::hours(1))), None),
        ("demomx", None, "https://example.com/limited", Some(demo_id.clone()), false, None, "ACTIVE", "READY",
         None, None, None, None, Some(1)),
        ("admin1", None, "https://example.com/admin-resource", Some(admin_id.clone()), false, None, "ACTIVE", "READY",
         Some("Admin's link"), None, None, None, None),
        ("guest1", None, "https://example.com/guest", None, true, Some("seed-guest-key"), "ACTIVE", "PENDING",
         None, None, None, Some(iso(now + Duration::hours(24))), None),
    ];

    for l in &links {
        sqlx::query(
            "INSERT INTO link (id, code, alias_display, destination_url, owner_id, is_guest, guest_key,
                               status, meta_status, meta_title, meta_description, password_hash,
                               expires_at, max_clicks, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(code) DO NOTHING",
        )
        .bind(cuid())
        .bind(l.0).bind(l.1).bind(l.2).bind(&l.3).bind(l.4).bind(l.5)
        .bind(l.6).bind(l.7).bind(l.8).bind(l.9).bind(&l.10).bind(&l.11).bind(l.12)
        .bind(iso(now)).bind(iso(now))
        .execute(pool)
        .await?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[tokio::test]
    async fn seeds_accounts_and_links_idempotently() {
        let pool = db::pool(":memory:").await.unwrap();
        db::migrate(&pool).await.unwrap();

        run(&pool).await.unwrap();
        run(&pool).await.unwrap(); // idempotent

        let users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM \"user\"").fetch_one(&pool).await.unwrap();
        let links: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM link").fetch_one(&pool).await.unwrap();
        assert_eq!(users, 3);
        assert_eq!(links, 6);

        // password-protected demo link carries a hash
        let pw: Option<String> = sqlx::query_scalar("SELECT password_hash FROM link WHERE code = 'demopw'")
            .fetch_one(&pool).await.unwrap();
        assert!(pw.is_some());
    }
}

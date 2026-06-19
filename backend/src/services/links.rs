//! DB-aware link helpers (Phase 3) — ports `src/lib/links-service.ts`:
//! `codeExists`, `createLink`, `freeSuggestions`, and the redirect-path resolver.
//! Pure rules live in alias/redirect/blocklist/ssrf/utm; this is the orchestration.

use chrono::SecondsFormat;
use sqlx::SqlitePool;

use crate::error::{ApiError, ErrorCode};
use crate::ids::cuid;
use crate::models::Link;
use crate::services::alias::{self};
use crate::services::blocklist;
use crate::services::redirect::LinkView;
use crate::services::shortcode;
use crate::services::utm::{assemble_utm_url, UtmParams};
use crate::state::AppState;

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// True if a (lowercased) code already exists.
pub async fn code_exists(pool: &SqlitePool, code_lower: &str) -> Result<bool, ApiError> {
    let found: Option<String> = sqlx::query_scalar("SELECT id FROM link WHERE code = ?")
        .bind(code_lower)
        .fetch_optional(pool)
        .await
        .map_err(internal)?;
    Ok(found.is_some())
}

/// Generate alias suggestions that are actually free in the DB (AC-4).
pub async fn free_suggestions(pool: &SqlitePool, base: &str) -> Vec<String> {
    let candidates = alias::suggest(base);
    let mut free = Vec::new();
    for c in candidates {
        let lower = alias::normalize(&c);
        match code_exists(pool, &lower).await {
            Ok(false) => free.push(c),
            _ => {}
        }
        if free.len() >= 3 {
            break;
        }
    }
    free
}

/// Arguments for creating a link (mirrors `CreateLinkArgs`).
pub struct CreateLinkArgs {
    pub url: String,
    pub alias: Option<String>,
    pub expires_at: Option<String>,
    pub max_clicks: Option<i64>,
    pub password: Option<String>,
    pub utm: Option<UtmParams>,
    pub owner_id: Option<String>,
    pub is_guest: bool,
    pub guest_key: Option<String>,
    pub guest_ttl_hours: i64,
}

/// Create a link: assemble UTM, run the inbound blocklist, resolve alias or
/// generate a unique code, hash the password, insert. Throws ApiError with the
/// canonical code on validation/availability failures (§6.2).
pub async fn create_link(state: &AppState, args: CreateLinkArgs) -> Result<Link, ApiError> {
    let destination_url = assemble_utm_url(&args.url, args.utm.as_ref());

    // Inbound trust boundary (FR-36) — distinct from outbound SSRF.
    let parsed = url::Url::parse(&destination_url).ok();
    if let Some(u) = &parsed {
        if blocklist::is_blocked(u) {
            return Err(ApiError::new(ErrorCode::UrlBlocked));
        }
    }

    let mut code: String;
    let mut alias_display: Option<String> = None;

    match &args.alias {
        Some(a) if !a.trim().is_empty() => {
            // validateAliasSyntax: reserved → ALIAS_RESERVED, else VALIDATION_ERROR.
            match alias::validate(a) {
                Ok(()) => {}
                Err(ErrorCode::AliasReserved) => {
                    return Err(ApiError::new(ErrorCode::AliasReserved).with_field("alias"));
                }
                Err(_) => {
                    let len = a.trim().chars().count();
                    let msg = if len < alias::ALIAS_MIN || len > alias::ALIAS_MAX {
                        format!(
                            "Custom links must be {}\u{2013}{} characters.",
                            alias::ALIAS_MIN,
                            alias::ALIAS_MAX
                        )
                    } else {
                        "Use only letters, numbers, hyphens, and underscores.".to_string()
                    };
                    return Err(ApiError::validation("alias", msg));
                }
            }
            let lower = alias::normalize(a);
            if code_exists(&state.pool, &lower).await? {
                return Err(ApiError::new(ErrorCode::AliasTaken)
                    .with_field("alias")
                    .with_suggestions(free_suggestions(&state.pool, a).await));
            }
            code = lower;
            alias_display = Some(a.trim().to_string());
        }
        _ => {
            code = generate_unique_code(&state.pool).await?;
        }
    }

    let password_hash = match &args.password {
        Some(p) => Some(crate::auth::password::hash(p).map_err(internal)?),
        None => None,
    };

    // Guest links get a default TTL when none was provided.
    let mut expires_at: Option<String> = args.expires_at.clone();
    if args.is_guest && expires_at.is_none() {
        let exp = chrono::Utc::now() + chrono::Duration::hours(args.guest_ttl_hours);
        expires_at = Some(exp.to_rfc3339_opts(SecondsFormat::Millis, true));
    }

    // Insert, retrying once on a generated-code collision (alias races → ALIAS_TAKEN).
    loop {
        match insert_link(
            state,
            &code,
            alias_display.as_deref(),
            &destination_url,
            args.owner_id.as_deref(),
            args.is_guest,
            args.guest_key.as_deref(),
            password_hash.as_deref(),
            expires_at.as_deref(),
            args.max_clicks,
        )
        .await
        {
            Ok(link) => return Ok(link),
            Err(e) if is_unique_violation(&e) => {
                if alias_display.is_some() {
                    return Err(ApiError::new(ErrorCode::AliasTaken)
                        .with_field("alias")
                        .with_suggestions(
                            free_suggestions(&state.pool, alias_display.as_deref().unwrap()).await,
                        ));
                }
                code = generate_unique_code(&state.pool).await?;
                continue;
            }
            Err(e) => return Err(internal(e)),
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn insert_link(
    state: &AppState,
    code: &str,
    alias_display: Option<&str>,
    destination_url: &str,
    owner_id: Option<&str>,
    is_guest: bool,
    guest_key: Option<&str>,
    password_hash: Option<&str>,
    expires_at: Option<&str>,
    max_clicks: Option<i64>,
) -> Result<Link, sqlx::Error> {
    let id = cuid();
    let now = now_iso();
    sqlx::query(
        "INSERT INTO link (id, code, alias_display, destination_url, owner_id, is_guest, guest_key,
                           password_hash, expires_at, max_clicks, status, meta_status, click_count,
                           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'PENDING', 0, ?, ?)",
    )
    .bind(&id)
    .bind(code)
    .bind(alias_display)
    .bind(destination_url)
    .bind(owner_id)
    .bind(is_guest)
    .bind(guest_key)
    .bind(password_hash)
    .bind(expires_at)
    .bind(max_clicks)
    .bind(&now)
    .bind(&now)
    .execute(&state.pool)
    .await?;

    sqlx::query_as("SELECT * FROM link WHERE id = ?")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
}

/// Generate a code that does not collide, growing length on repeated collisions
/// (mirrors `generateUniqueCode`). Returns lowercased.
async fn generate_unique_code(pool: &SqlitePool) -> Result<String, ApiError> {
    for attempt in 0..10 {
        let len = if attempt < 6 {
            shortcode::DEFAULT_CODE_LENGTH
        } else {
            shortcode::GROWN_CODE_LENGTH
        };
        let candidate = shortcode::random_code(len).to_lowercase();
        if !code_exists(pool, &candidate).await? {
            return Ok(candidate);
        }
    }
    Err(internal("exhausted unique code attempts"))
}

/// Resolve a code for the redirect path: cache → DB on miss (warming cache).
/// Returns the redirect `LinkView` plus the link id (needed for click enqueue).
pub async fn resolve_for_redirect(
    state: &AppState,
    code: &str,
) -> Option<(LinkView, String)> {
    // Cache stores only the view; keep an id side-table-free design by re-reading
    // the id on the (rare) path that needs it. On a cache hit we still need the id
    // for the ClickMsg, so we cache nothing extra and read the row on demand only
    // when a hit occurs AND the decision counts. To keep one read budget, we fetch
    // the row id together with the view on a miss and return it; on a hit we look
    // up the id lazily here.
    match state.cache.get(code).await {
        crate::services::cache::CacheLookup::Hit(view) => {
            // Need the id for click enqueue; cheap point lookup by code.
            let id: Option<String> = sqlx::query_scalar("SELECT id FROM link WHERE code = ?")
                .bind(alias_normalize(code))
                .fetch_optional(&state.pool)
                .await
                .ok()
                .flatten();
            id.map(|i| (view, i))
        }
        crate::services::cache::CacheLookup::Dead => None,
        crate::services::cache::CacheLookup::Miss => {
            let row: Option<Link> = sqlx::query_as("SELECT * FROM link WHERE code = ?")
                .bind(alias_normalize(code))
                .fetch_optional(&state.pool)
                .await
                .ok()
                .flatten();
            match row {
                None => {
                    state.cache.put_dead(code).await;
                    None
                }
                Some(link) => {
                    let view = to_link_view(&link, state.cfg.redirect_status);
                    state.cache.put(code, view.clone()).await;
                    Some((view, link.id))
                }
            }
        }
    }
}

fn alias_normalize(code: &str) -> String {
    code.trim().to_lowercase()
}

/// Build the redirect view cached for the hot path (mirrors `toResolvedLink`).
pub fn to_link_view(link: &Link, redirect_status: u16) -> LinkView {
    LinkView {
        destination_url: link.destination_url.clone(),
        status: link.status.clone(),
        expires_at: link.expires_at.clone(),
        max_clicks: link.max_clicks,
        click_count: link.click_count,
        has_password: link.password_hash.is_some(),
        redirect_status,
    }
}

fn internal<E: std::fmt::Display>(e: E) -> ApiError {
    tracing::error!("links service error: {e}");
    ApiError::new(ErrorCode::Internal)
}

fn is_unique_violation(e: &sqlx::Error) -> bool {
    if let sqlx::Error::Database(db) = e {
        // SQLite UNIQUE constraint failed → code 2067 (SQLITE_CONSTRAINT_UNIQUE)
        // or 1555 (PRIMARY KEY), or message contains "UNIQUE constraint failed".
        return db.code().as_deref() == Some("2067")
            || db.code().as_deref() == Some("1555")
            || db.message().contains("UNIQUE constraint failed");
    }
    false
}

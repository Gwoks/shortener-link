-- Initial schema — ported from prisma/schema.prisma (spec §6).
-- Postgres -> SQLite: enums -> TEXT CHECK; cuid ids -> TEXT; datetimes -> TEXT (ISO-8601);
-- JSON columns -> TEXT; booleans -> INTEGER. Session/VerificationToken dropped (stateless JWT).
-- ClickEvent.streamId dropped (Redis-stream idempotency replaced by in-process key).
-- Column names are snake_case internally; the API serialize layer maps to camelCase JSON.

PRAGMA foreign_keys = ON;

CREATE TABLE "user" (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  email_verified TEXT,
  name           TEXT,
  image          TEXT,
  password_hash  TEXT,
  role           TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','ADMIN')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE account (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type                TEXT NOT NULL,
  provider            TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token       TEXT,
  access_token        TEXT,
  expires_at          INTEGER,
  token_type          TEXT,
  scope               TEXT,
  id_token            TEXT,
  session_state       TEXT,
  UNIQUE (provider, provider_account_id)
);
CREATE INDEX account_user_id_idx ON account(user_id);

CREATE TABLE link (
  id               TEXT PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  alias_display    TEXT,
  destination_url  TEXT NOT NULL,
  owner_id         TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  is_guest         INTEGER NOT NULL DEFAULT 0,
  guest_key        TEXT,
  status           TEXT NOT NULL DEFAULT 'ACTIVE'   CHECK (status IN ('ACTIVE','EXPIRED','DEACTIVATED')),
  meta_status      TEXT NOT NULL DEFAULT 'PENDING'  CHECK (meta_status IN ('PENDING','READY','FAILED')),
  meta_title       TEXT,
  meta_description TEXT,
  password_hash    TEXT,
  expires_at       TEXT,
  max_clicks       INTEGER,
  click_count      INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX link_owner_created_idx ON link(owner_id, created_at DESC);
CREATE INDEX link_status_expires_idx ON link(status, expires_at);
CREATE INDEX link_guest_key_idx ON link(guest_key);

CREATE TABLE click_event (
  id                TEXT PRIMARY KEY,
  link_id           TEXT NOT NULL REFERENCES link(id) ON DELETE CASCADE,
  occurred_at       TEXT NOT NULL,
  visitor_key       TEXT NOT NULL,
  is_unique         INTEGER NOT NULL,
  referrer_category TEXT NOT NULL CHECK (referrer_category IN ('SOCIAL','SEARCH','DIRECT','REFERRAL','OTHER')),
  referrer_host     TEXT,
  country           TEXT,
  city              TEXT,
  device_type       TEXT,
  browser           TEXT
);
CREATE INDEX click_event_link_occurred_idx ON click_event(link_id, occurred_at);

CREATE TABLE click_rollup (
  id          TEXT PRIMARY KEY,
  link_id     TEXT NOT NULL REFERENCES link(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,
  clicks      INTEGER NOT NULL DEFAULT 0,
  uniques     INTEGER NOT NULL DEFAULT 0,
  by_referrer TEXT NOT NULL DEFAULT '{}',
  by_country  TEXT NOT NULL DEFAULT '{}',
  by_device   TEXT NOT NULL DEFAULT '{}',
  by_browser  TEXT NOT NULL DEFAULT '{}',
  UNIQUE (link_id, day)
);

CREATE TABLE visitor_seen (
  link_id     TEXT NOT NULL,
  visitor_key TEXT NOT NULL,
  first_seen  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (link_id, visitor_key)
);

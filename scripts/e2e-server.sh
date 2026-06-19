#!/usr/bin/env bash
# Boot the single Rust binary for Playwright E2E: build, seed a fresh temp DB,
# then serve API + redirect + static SPA. Paths are made absolute so the server
# is CWD-independent.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
. "$HOME/.cargo/env" 2>/dev/null || true

PORT="${E2E_PORT:-8080}"
( cd backend && cargo build --bin shortener --bin seed >&2 )

DB="$(mktemp -u "${TMPDIR:-/tmp}/e2e-XXXXXX.db")"
export SQLITE_PATH="$DB"
export PUBLIC_PORT="$PORT"
export BASE_URL="http://localhost:$PORT"
export AUTH_SECRET="e2e-insecure-secret-do-not-use-in-prod-please"
export STATIC_DIR="$ROOT/dist"
export BLOCKLIST_PATH="$ROOT/data/blocklist.txt"
export VISITOR_IP_PEPPER="e2e-pepper"

./backend/target/debug/seed >&2
exec ./backend/target/debug/shortener

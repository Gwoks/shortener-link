#!/usr/bin/env bash
# Build the frontend + Rust backend, then run the single binary.
# The binary serves the API, the /:code redirect, and the static SPA over one
# SQLite file, and runs the click/scrape/sweep tasks in-process. No Docker.
set -euo pipefail

cd "$(dirname "$0")/.."

# Load .env if present (export every assignment).
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

echo "==> Building frontend (Vite -> dist/)"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
pnpm build

echo "==> Building backend (cargo --release)"
( cd backend && cargo build --release )

# Optional: seed demo data on first run when the DB doesn't exist yet.
SQLITE_PATH="${SQLITE_PATH:-data/app.db}"
if [ "${SEED:-0}" = "1" ] || [ ! -f "$SQLITE_PATH" ]; then
  echo "==> Seeding demo data ($SQLITE_PATH)"
  ./backend/target/release/seed || true
fi

echo "==> Starting shortener on :${PUBLIC_PORT:-8080}"
exec ./backend/target/release/shortener

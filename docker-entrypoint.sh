#!/bin/sh
# Container entrypoint (ARCHITECTURE.md §10.2). The `web` role applies DB
# migrations + seed once on boot, then starts Next. The `worker` role just runs
# the background worker. Selected by the first arg (set via compose `command:`).
set -e

ROLE="${1:-web}"

if [ "$ROLE" = "web" ]; then
  echo "[entrypoint] applying migrations…"
  pnpm prisma migrate deploy
  echo "[entrypoint] seeding demo data (idempotent)…"
  pnpm db:seed || echo "[entrypoint] seed skipped/failed (non-fatal)"
  echo "[entrypoint] starting web…"
  exec pnpm start
elif [ "$ROLE" = "worker" ]; then
  echo "[entrypoint] starting worker…"
  exec pnpm worker
else
  echo "[entrypoint] unknown role: $ROLE (use 'web' or 'worker')"
  exit 1
fi

#!/bin/bash
# =============================================================================
# Deploy script for url.lgtm.my.id
# =============================================================================
set -e

echo "==> Pulling latest code"
git fetch origin main
git reset --hard origin/main

echo "==> Installing dependencies and building frontend"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
pnpm build

echo "==> Building Rust backend"
. "$HOME/.cargo/env"
cd backend
cargo build --release

echo "==> Fixing permissions"
sudo chmod 755 /home/ubuntu

echo "==> Restarting shortener service"
sudo systemctl restart shortener
echo "shortener deployed successfully"

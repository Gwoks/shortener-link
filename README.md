# Link Shortener

A complete, self-hostable URL shortener in the spirit of Bitly / Dub.co — fast redirects, rich analytics, and full link management. Built as a **single Rust (Axum) binary over SQLite** that also serves a static **Vite + React** SPA. No Node runtime, no Redis, no Postgres, no Docker — one process and one file.

> Originally produced by a multi-agent feature pipeline (Next.js + Postgres + Redis), then re-platformed to Rust/SQLite for a feather-weight, self-contained deployment. Design + plan: [`docs/superpowers/`](docs/superpowers/). Behavioral contract: [`docs/features/link-shortener/`](docs/features/link-shortener/).

## Features

- **Shorten** any URL to a 6-character code, or pick a **custom alias**
- **Fast redirects** — in-memory cache-fronted hot path; clicks ingested asynchronously
- **Analytics** — total clicks, unique visitors, clicks over time, referrers, geography, device/browser (per-link and aggregate), each with an accessible data table
- **QR codes** — auto-generated per link, downloadable as PNG
- **Link management** — expiration (date and/or max clicks), password protection, destination editing, enable/disable
- **Title/description scraping** of destinations (SSRF-safe, in a background task)
- **UTM builder** with live preview, and **bulk shortening**
- **Auth** — Google, GitHub, and email/password; **guest mode** (24h links, claimable on sign-up)
- **Anti-abuse** — per-IP rate limiting + an offline phishing/malware blocklist
- **Polished UI** — dark/light themes, WCAG 2.1 AA, loading/empty/error states, copy-to-clipboard toasts

---

## Architecture

```
Browser ─▶ [ Rust / Axum binary ]  ──▶  SQLite (data/app.db, WAL)
              ├─ /api/**            REST API (auth, links, analytics, qr, guest)
              ├─ /:code             redirect hot path (302 / password gate / dead-link)
              ├─ static + SPA       serves the built Vite bundle (dist/) with SPA fallback
              └─ tokio tasks       click ingest · metadata scraper · expiry sweep
```

One binary holds the HTTP server, an in-memory redirect cache, an in-process rate limiter, the
background work queues, and the SQLite connection pool. **Single-instance** by design (in-process
cache/queues) — the self-host sweet spot; scale vertically.

---

## Run the project

### Prerequisites
- **Rust** (stable, ≥1.80) — install via [rustup](https://rustup.rs/)
- **Node.js 20+** and **[pnpm](https://pnpm.io/) 10** — only to *build* the frontend (not at runtime)

### Quick start

```bash
cp .env.example .env        # defaults run everything locally, no external services
bash scripts/start.sh       # builds frontend + backend, seeds on first run, serves → http://localhost:8080
```

`scripts/start.sh` runs `pnpm build` (Vite → `dist/`), `cargo build --release`, seeds demo data on
first run, and launches the binary (which applies SQLite migrations on startup). Open
**http://localhost:8080** — guest shortening works immediately; sign up for the full dashboard.

### Manual / development

```bash
cp .env.example .env
pnpm install

# Backend (terminal 1) — serves API + redirect on :8080; migrates on startup.
cd backend && cargo run --bin seed   # one-time: seed demo data
cd backend && cargo run --bin shortener

# Frontend dev server with hot reload (terminal 2) — proxies /api → :8080.
pnpm dev                              # → http://localhost:5173
```

For a production-style run, `pnpm build` then point the backend at it via `STATIC_DIR=dist` (the
default) and just run the binary — it serves the SPA itself, so the Vite dev server isn't needed.

### Sample accounts (after seeding)

`cargo run --bin seed` (or `pnpm backend:seed`) creates these for local use. **Sample credentials — not for production.**

| Email | Password | Role |
|---|---|---|
| `admin@example.com` | `admin-password-123` | `ADMIN` |
| `user@example.com` | `user-password-123` | `USER` |
| `demo@example.com` | `demo-password-123` | `USER` |

The seed also adds sample links covering each state — active, password-protected (link password `secret`), expired, max-clicks, and a 24h guest link.

---

## Configuration

Copy `.env.example` to `.env`. Defaults run the whole app locally. Key variables:

| Variable | Required | Notes |
|---|---|---|
| `SQLITE_PATH` | – | SQLite file path (default `data/app.db`, created on first run) |
| `PUBLIC_PORT` | – | Port the binary listens on (default `8080`) |
| `STATIC_DIR` | – | Built frontend directory (default `dist`) |
| `AUTH_SECRET` | ✅ | Signs the session JWT — set a strong value (≥32 bytes) in production |
| `BASE_URL` | ✅ | Public app URL (builds short URLs + OAuth callbacks) |
| `VISITOR_IP_PEPPER` | ✅ | Pepper used to hash visitor identifiers (privacy) |
| `GOOGLE_CLIENT_ID` / `_SECRET` | optional | Enables Google sign-in (omit to hide it) |
| `GITHUB_CLIENT_ID` / `_SECRET` | optional | Enables GitHub sign-in (omit to hide it) |
| `MAXMIND_LICENSE_KEY` / `GEOIP_DB_PATH` | optional | Geo analytics (see below) |
| `REDIRECT_STATUS`, `GUEST_TTL_HOURS`, `BULK_MAX`, `RL_*` | optional | Tunables with sensible defaults |

OAuth is **optional** — with no Google/GitHub keys the app runs fine on email/password alone (fully offline).

### Geo analytics (optional)

```bash
# add MAXMIND_LICENSE_KEY=... to .env, then:
pnpm fetch:geoip            # downloads data/GeoLite2-City.mmdb
```

Without it the app runs normally; geo fields are simply left empty.

---

## Testing

```bash
cd backend && cargo test   # Rust unit + integration tests (the bulk of the logic)
pnpm typecheck             # tsc --noEmit (frontend)
pnpm e2e                   # Playwright end-to-end (boots the binary + serves dist)
```

---

## Project structure

```
backend/                    the Rust/Axum binary (the whole server)
  migrations/0001_init.sql  SQLite schema
  src/
    main.rs                 bootstrap: config, db, migrate, tasks, serve
    config.rs db.rs models.rs ids.rs state.rs queue.rs
    error.rs               uniform API error envelope
    auth/                   argon2 + JWT session + Google/GitHub OAuth + extractors
    services/               ported business logic (links, analytics, redirect, cache,
                            ratelimit, ssrf, blocklist, referrer, ua, geo, qr, …)
    routes/                 /api handlers + /:code redirect + static/SPA serving
    tasks/                  click-ingest · scraper · expiry-sweep (tokio)
    bin/seed.rs             demo data seeder
index.html, vite.config.ts  Vite SPA entry/build
src/
  main.tsx router.tsx       SPA bootstrap + react-router route tree
  auth/                     AuthContext + auth-client (talks to /api/auth/*)
  components/               UI (primitives, links, analytics, auth, app shell)
data/                       offline assets (blocklist; GeoLite2 once provisioned)
docs/                       specs/plans (docs/superpowers) + behavioral contract (docs/features)
```

`docs/features/link-shortener/ARCHITECTURE.md` is the authoritative behavioral contract.

---

## Scripts

| Command | Description |
|---|---|
| `bash scripts/start.sh` | build frontend + backend, seed (first run), serve |
| `pnpm dev` / `pnpm build` / `pnpm preview` | Vite dev server / production build / preview |
| `pnpm backend:run` / `:seed` / `:build` / `:test` | run / seed / build / test the Rust backend |
| `pnpm fetch:geoip` | download the GeoLite2 database (needs `MAXMIND_LICENSE_KEY`) |
| `pnpm typecheck` / `pnpm e2e` | frontend typecheck / end-to-end tests |

---

## Deploy to VPS

### Prerequisites

| Requirement | Notes |
|---|---|
| VPS with public IPv4 | e.g. DigitalOcean, Hetzner, AWS EC2 |
| Domain A record pointing to VPS IP | `url.yourdomain.com` → `<vps-ip>` |
| Ports 80 and 443 open | `sudo ufw allow 80,443/tcp` |
| Ubuntu 22.04+ | Other distros similar |

### One-time server setup

```bash
# Install tools
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx curl git

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
sudo npm install -g pnpm

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
. "$HOME/.cargo/env"
```

### Manual deployment

```bash
# 1. Clone the repo
git clone https://github.com/Gwoks/shortener-link /home/ubuntu/shortener-link
cd /home/ubuntu/shortener-link

# 2. Build frontend
pnpm install && pnpm build

# 3. Build backend
cd backend && cargo build --release

# 4. Create data dir
sudo mkdir -p /home/ubuntu/shortener-link/data
sudo chown -R $(whoami):$(id -gn) /home/ubuntu/shortener-link/data

# 5. systemd service
sudo tee /etc/systemd/system/shortener.service > /dev/null << 'EOF'
[Unit]
Description=URL Shortener API Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/shortener-link
ExecStart=/home/ubuntu/shortener-link/backend/target/release/shortener
Environment="DATABASE_PATH=/home/ubuntu/shortener-link/data/app.db"
Environment="STATIC_DIR=/home/ubuntu/shortener-link/dist"
Environment="PUBLIC_PORT=8081"
Restart=unless-stopped
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now shortener

# 6. nginx
sudo tee /etc/nginx/sites-available/shortener > /dev/null << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name url.yourdomain.com;

    root /home/ubuntu/shortener-link/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8081/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/shortener /etc/nginx/sites-enabled/shortener
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 7. SSL (no email required)
sudo certbot --nginx -d url.yourdomain.com \
  --noninteractive --agree-tos --register-unsafely-without-email --redirect
```

### Auto-deploy with GitHub Actions (CI/CD)

On every push to `main`, this repo's Actions workflow will:
1. Build the frontend (pnpm)
2. Build the Rust backend (cargo)
3. SSH into your VPS, pull latest code, rebuild, and restart the service.

#### Step 1 — Add GitHub Secrets

In **your GitHub repo** → *Settings* → *Secrets and variables* → *Actions* → *New repository secret*, add:

| Secret Name | Value |
|---|---|
| `VPS_IP` | Your VPS public IP address (e.g. `43.157.202.239`) |
| `VPS_USER` | SSH username on the VPS (e.g. `ubuntu`) |
| `VPS_SSH_KEY` | **Private** SSH key from the keypair generated on the VPS |

#### Step 2 — Generate an SSH keypair for the VPS

On your VPS:

```bash
# Generate a new SSH key pair (no passphrase)
ssh-keygen -t ed25519 -f ~/.ssh/vps_deploy_key -N ""

# Add the PUBLIC key to authorized_keys
cat ~/.ssh/vps_deploy_key.pub >> ~/.ssh/authorized_keys

# Copy the PRIVATE key — you'll add it to GitHub Secrets
cat ~/.ssh/vps_deploy_key
```

Copy the **private key** output and add it as the `VPS_SSH_KEY` secret in GitHub.

#### Step 3 — Ensure the VPS home dir is traversable

```bash
# nginx (www-data) needs to read /home/ubuntu/shortener-link/dist
sudo chmod 755 /home/ubuntu
```

#### Step 4 — Trigger the workflow

Push any change to `main`:

```bash
git push origin main
```

Then check the **Actions** tab in your GitHub repo to see the deployment running.

### Common VPS commands

```bash
# Restart after updates
sudo systemctl restart shortener

# View logs
sudo journalctl -u shortener -f

# Rebuild manually
cd /home/ubuntu/shortener-link
git pull
pnpm build
cd backend && cargo build --release
sudo systemctl restart shortener

# Check SSL cert expiry
sudo certbot certificates
```

---

## License

MIT

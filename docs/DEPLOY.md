# Spid3rWeb Deployment & Operations Guide

**Minimum runtime:** Spid3r `v1.1.1+` · **Health endpoint:** `GET /health` · **Artifacts:** `deploy/{Dockerfile,docker-compose.yml,nginx.conf,Caddyfile}`

---

## 1. Choosing a Production Build Format

| Strategy | Command | Ideal For | Runtime Dependencies |
|---|---|---|---|
| **Native LLVM AOT (Recommended)** | `spid3r magic build --release --bundle -o dist/spid3rweb` | Standalone Linux/Windows HTTP servers (`spid3rweb --port 8000`) | None (ships compiled machine code + `public/`, `resources/`) |
| **Compiled Bytecode (`.matrixc`)** | `spid3r magic build --bytecode-only -o dist/server.matrixc` | Environments enforcing `spid3r exec --sandbox`, `--budget`, or `spid3r.ini` limits without shipping `.matrix` source | Spid3r VM runtime (`spid3r exec dist/server.matrixc`) |
| **Container Image (Docker)** | `docker build -f deploy/Dockerfile -t spid3rweb:latest .` | Reproducible cloud / Compose deployments with pinned `v1.1.1` SHA-256 verification and `USER spid3r` isolation | Docker / OCI runtime |
| **Bundled GUI Payload (`--bundle-runtime`)** | `spid3r magic build --bytecode --bundle-runtime --embed public/index.html -o dist/app` | Hybrid desktop apps launched via `spid3r gui --payload` (uses `run_payload_strict()` + SHA-256 cached runtime extraction) | Self-contained (`spid3r` embedded; requires an `--embed` HTML UI) |

> **Important note on `--bundle-runtime`:** In Spid3r `v1.1.1`, `spid3r build --bytecode --bundle-runtime` builds a `run_payload_strict()` launcher that invokes `spid3r gui --payload` and requires an embedded HTML entrypoint. For headless HTTP APIs and web servers, deploy either the **Native LLVM AOT binary** (`--release`), **Docker**, or `spid3r exec <file>.matrixc`.

---

## 2. Pre-Flight Checklist (Before Every Deploy)

```bash
# 1. Verify spid3r.ini syntax and keys
SPID3R_INI=./spid3r.ini.example spid3r config validate

# 2. Generate strong secrets (never commit .env)
cp .env.example .env
chmod 0600 .env
spid3r magic key:generate

# 3. Sync generated migration registry & verify config/runtime health
spid3r magic config:check
spid3r magic migrate:sync
APP_ENV=production APP_KEY="$(grep '^APP_KEY=' .env | cut -d= -f2-)" spid3r magic doctor --strict

# 4. Run database migrations (idempotent) & create public/storage link if serving user uploads
spid3r magic migrate
spid3r magic storage:link
```

---

## 3. Standalone Native AOT Binary Deployment

```bash
# Build native release executable + copy public/ & resources/
spid3r magic build --release --bundle -o dist/spid3rweb

# Run on loopback behind nginx/Caddy (or pass SPID3R_HOST=0.0.0.0)
cd dist
APP_ENV=production APP_KEY="hex:..." ./spid3rweb --port 8000 --root .
```

Native TLS can be enabled directly when terminating TLS in-process (`app.listen_tls` / `--tls --cert ... --key ...`), or delegated to Nginx / Caddy.

---

## 4. Reverse Proxies & TLS Termination

Ready-to-use configs live in `deploy/`:

- **Nginx:** [`deploy/nginx.conf`](../deploy/nginx.conf) (HTTP -> HTTPS redirect, HTTP/2, WebSocket Upgrade headers, `/health` pass-through)
- **Caddy:** [`deploy/Caddyfile`](../deploy/Caddyfile) (automatic Let's Encrypt HTTPS, zstd/gzip compression, active `/health` checks)

When running behind a reverse proxy:

```bash
SPID3R_TRUSTED_PROXIES=127.0.0.1,10.0.0.0/8
SPID3R_TASK_DRAIN_MS=2000
```

- **HTTP/2 termination**: Spid3r's native HTTP server speaks HTTP/1.1 (`serve_listener`); enable HTTP/2 (`h2`) at Nginx (`listen 443 ssl http2`) or Caddy, proxying upstream over HTTP/1.1 keep-alive.
- `req.client_ip()`, `req.is_secure()`, and `req.host()` honor `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Host` **only** from IPs/CIDRs listed in `SPID3R_TRUSTED_PROXIES`.
- In `APP_ENV=production`, HTTPS requests automatically emit `Strict-Transport-Security` (`config/security.matrix`).
- Static assets under `/css/`, `/js/`, `/assets/`, etc. support `Accept-Ranges: bytes` (`206`/`416`) and `Content-Encoding: gzip` (`Vary: Accept-Encoding`).

---

## 5. Docker & Compose Deployment

```bash
# Prepare host secrets (.env is never baked into the Dockerfile)
cp .env.example .env
chmod 0600 .env
spid3r magic key:generate

# Build image (installs pinned Spid3r v1.1.1 tarball verified by SHA-256, runs as USER spid3r)
docker build -f deploy/Dockerfile -t spid3rweb:v1.1.1 .

# Run full Compose stack (App + MySQL 8 + PostgreSQL 16; DB ports stay internal)
docker compose -f deploy/docker-compose.yml up --build -d
```

For production containers, run with `--read-only` root filesystem plus writable mounts for `/var/www/app/storage` (`storage/database/database.sqlite` lives inside `storage/` via `app.paths.state_dir`) and, if keeping legacy DB placement, `/var/www/app/database` (mode `0700`, owned by `spid3r`).

---

## 6. Routine Maintenance Commands

```bash
spid3r magic storage:prune    # remove expired logs (> retention_days) & stale temp uploads
spid3r magic cache:gc         # garbage-collect expired cache entries (memory/file/database)
spid3r magic db:backup        # online SQLite snapshot under storage/backups/
spid3r magic db:vacuum        # checkpoint SQLite WAL and compact DB
spid3r magic docs             # generate HTML API reference at docs/build/api.html
spid3r magic bench --gate     # verify performance floors against benchmarks/RESULTS.md
```

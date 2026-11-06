# Phase 15 — CI/CD and Deployment

The pipeline that verifies every push, and the one-command way to prove the
store works against real database engines and a real HTTP server process.

**Deliverable:** deployment-verified application.

---

## CI pipeline (`.github/workflows/ci.yml`)

| Job | What it proves |
|---|---|
| **Lint** | `shellcheck` (POSIX sh) on `install.sh` and `deploy/docker-smoke.sh`; `actionlint` on the workflow itself. |
| **Tests (sqlite / postgres / mysql)** | On a throwaway service container per engine: migrate → seed → route:list → serve --dry-run → **the full suite (31 suites)** → bytecode-VM engine runs → full-stack example → benchmarks → load probe → **real-server smoke**. |
| **Real server smoke** (sqlite leg) | Boots `spid3r magic serve` as a LIVE process and verifies over TCP with curl: `/health`, `/`, `/catalog`, `/sitemap.xml`, a 404, HEAD support and the CSP header. The test suites drive `handle_request` in-process; this step proves the actual HTTP server serves the store end to end. |

Standards kept: least-privilege `permissions`, pinned major actions,
concurrency cancellation, fail-fast false, injection-safe env passing.

---

## Two Docker paths

### 1. Fully containerised stack (`deploy/`)

`deploy/Dockerfile` builds a **production-style multi-stage image** — the
Spid3r toolchain is compiled from source (the installer's documented
`--source --core` fallback, the same path CI uses) and the runtime stage is
a slim Debian with the framework code. The container **migrates on boot**
(idempotent) and `exec`s the server as PID 1:

```bash
docker compose -f deploy/docker-compose.yml up --build -d   # app on :8090 (MySQL)
```

The compose stack carries MySQL 8.0 (with `mysql_native_password` — the
runtime client's requirement) and PostgreSQL 16, both with healthchecks and
published ports for host-side tooling. PostgreSQL runs with
`POSTGRES_HOST_AUTH_METHOD=trust` because the runtime client speaks
md5/trust auth, not SCRAM (documented in `.env.example`).

### 2. One-command deployment smoke (`deploy/docker-smoke.sh`)

Boots the real engine from the same compose file, then verifies the
**host-process server** — the path CI and `magic serve` deployments use:

```bash
./deploy/docker-smoke.sh postgres        # or: mysql
SMOKE_ONLY=1 ./deploy/docker-smoke.sh postgres   # skip the full suite
PORT=8010 ./deploy/docker-smoke.sh mysql         # choose the HTTP port
```

What it does, in order:

1. **Starts the real engine in Docker** and waits for `healthy`.
2. **Ensures the MySQL user** uses `mysql_native_password`.
3. **Migrates and seeds** the real database through the app.
4. **Boots the real Spid3r HTTP server** in the background
   (`spid3r magic serve --port=$PORT`) with a readiness loop that FAILS
   when the server never comes up.
5. **Ten HTTP smoke checks over TCP**: liveness JSON, storefront, catalog,
   sitemap, robots, static assets, a 404, HEAD support, and the presence of
   the CSP security header.
6. **Runs the full test suite** against the same engine (skipped with
   `SMOKE_ONLY=1`).
7. **Tears everything down** (`docker compose down -v`) and reports
   `DEPLOYMENT SMOKE PASSED` / `FAILED` with a non-zero exit code.

Verified locally: PostgreSQL and MySQL both pass all ten HTTP checks
against the live server process.

---

## Deployment model

| Concern | Approach |
|---|---|
| Runtime | Either the containerised stack (`deploy/docker-compose.yml up --build -d` — migrates on boot) or the native binary on the host: `spid3r magic serve` behind a reverse proxy for TLS. HSTS via `SPID3R_HSTS=1`, secure cookies via `SPID3R_COOKIE_SECURE=1`, `APP_ENV=production`. Production can also serve under the bytecode VM (`spid3r run --engine vm server.matrix`). |
| Database | PostgreSQL primary (managed service or the compose service above). MySQL/MariaDB and SQLite are fully supported alternatives. |
| Cache | `SPID3R_CACHE_DRIVER=memory` per process, or `database` for a shared cache across processes. Redis becomes a drop-in `CacheStore` when the runtime ships the native. |
| Queue | The `database` connection drains with `spid3r magic queue:work` (a supervisor/systemd unit); the `sync` driver runs jobs inline for single-process deployments. |
| Uploads | Stored through the `public` disk (`storage/` → symlinked or volume-mounted); validated by magic bytes, 2 MiB cap. |
| Secrets | Environment only (`.env` on the host, never committed). Gateway and SMS credentials are read from env exclusively. |
| Verification | `./deploy/docker-smoke.sh <engine>` doubles as the post-deployment health check — the same ten HTTP probes against the live server. |

### Rollback

The store is stateless apart from the database and the upload volume:

1. Re-deploy the previous binary/commit (`git checkout <tag> && spid3r magic serve`).
2. Migrations are one-way — a rollback does NOT revert schema changes, but
   every migration through 020 is additive (tables, columns, indexes), so an
   older binary keeps working against a newer schema.
3. Database backup/restore: `docs/ecommerce/BACKUP.md` (Phase 2) covers the
   backup command and restore procedure.

---

## Developing on Docker

The stack doubles as a development environment:

```bash
# production-style boot (migrate + seed on boot, then serve on :8090)
docker compose -f deploy/docker-compose.yml up -d --build app

# seed browsable demo content (idempotent; LOCAL DEV credentials)
docker compose -f deploy/docker-compose.yml exec -T app \
  spid3r run tools/seed_demo.matrix
#   -> admin@spid3r.test / secret123 (admin panel)
#   -> shopper@spid3r.test / secret123 (customer)
#   -> 4 demo products, coupon WELCOME10, a Dhaka shipping zone
```

For host-side development add the dev override — the app container then
bind-mounts the repository, so you edit on the host and restart the app
service to pick up `.matrix` changes (templates and static assets
revalidate automatically in debug mode):

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.dev.yml up -d --build app
docker compose -f deploy/docker-compose.yml restart app   # after code edits
```

Notes:

* The build context is the **repository root** (`build.context: ..`) because
  the Dockerfile COPYs `app/`, `framework/`, `routes/`, … from there;
  `.dockerignore` keeps the context lean.
* The image sets `SPID3R_PATH=/var/www/app` so in-container script runs
  (`spid3r run tools/…`) resolve framework imports.
* The MySQL/PostgreSQL ports are published for host-side tooling
  (`deploy/docker-smoke.sh`, database clients).
* The demo seeder is opt-in and never runs in CI or production; its
  credentials are for a local stack only.

## What is deliberately NOT done

* **Zero-downtime deploys** — the single-process runtime has no graceful
  hand-off; deploys are restart-based (the app container's restart policy
  covers crashes, not version hand-offs). Documented, not hidden.
* **Blue/green or canary automation** — needs a process supervisor and
  multiple instances, which the runtime's single-threaded server does not
  yet support.
* **PostgreSQL SCRAM support** — the runtime client speaks md5/trust auth
  only; local containers use trust auth (above) and production servers must
  set `password_encryption = 'md5'` for the app user (see `.env.example`).

# Spid3rWeb Security Architecture & Operations Guide

**Verified against:** Spid3r `v1.1.1+` · **Modules:** `config/{security,upload,http,auth}.matrix`, `framework/Foundation/{Config,Env,RuntimeVersion}.matrix`, `framework/Http/{CookieJar,Csrf,StaticFiles,RequestParser,Response,Middleware}.matrix`, `framework/Auth/{Hash,Jwt,Auth}.matrix`, `spid3r.ini.example`

---

## 1. Spid3rWeb vs. Spid3r Stdlib `web` Module

The upstream Spid3r language manual (`../docs/SECURITY.md`, "Known gaps") notes:
*"No CSRF middleware … Sessions are client-side (`web.SessionStore` signs the data; the client can read it)."*

That note applies **only** to the minimal built-in `web` module shipped in Spid3r's standard library. **Spid3rWeb (`spid3r_web`) implements full server-side protections:**

- **2-Layer CSRF Defense (`framework/Http/Csrf.matrix`, `Application.handle_request`)**:
  1. **Origin validation (`is_same_origin`)**: For `POST`/`PUT`/`PATCH`/`DELETE`, verifies any `Origin` header matches `Host` (normalizing scheme default ports).
  2. **Per-session synchronizer token (`csrf_valid`)**: Cookie-authenticated mutations without an `Origin` header must present the CSPRNG `_csrf` token issued at login and stored server-side.
- **Server-Side Sessions (`sessions` table & `SessionStore`)**:
  - Authenticated login sessions (`Auth.matrix`) issue an opaque CSPRNG `sess_<hex>` token stored in the database `sessions` table (`payload` never lives in browser cookies).
  - General session/flash data (`SessionStore`, `framework/Session/Session.matrix`) is kept server-side via `Cache` (`session:<id>`) and referenced by an `HttpOnly`, `SameSite=Lax`, validated cookie (`CookieJar`).

---

## 2. Production Runtime Policy (`spid3r.ini` & CLI Flags)

### Recommended `spid3r.ini` Guardrails (`spid3r.ini.example`)

Verify configuration files before deploying:

```bash
SPID3R_INI=./spid3r.ini.example spid3r config validate
```

Key directives:

- `[modules] disable = ssh, ftp, gui`, `allow_wasm = false`, `allow_host = false`: blocks unused stdlib modules across tree, VM, and AOT compilation.
- `[security] basedir = ./public, ./storage, ./database, ./resources, ./config`: confines file-taking runtime natives (`read_file`, `write_file_atomic`, `db_open`, etc.) component-wise after canonicalization.
- `[net] max_body = 10485760`, `max_headers = 64`, `timeout_ms = 30000`, `keepalive_ms = 5000`: bounds HTTP body sizes (`413`), header counts (`431`), and slowloris windows.
- `[spid3r] task_drain_ms = 2000`, `max_workers = 256`, `queue_cap = 65536`.
- `[env.<name>]`: per-environment overrides without changing code.

### Important Confinement Boundary (`basedir` Alone Is Not a Jail)

Per Spid3r's `SECURITY.md`, `[security] basedir` restricts path-taking natives, **not child OS processes** spawned through `exec_capture` / `spawn_process`. When running a dedicated HTTP server via `spid3r run server.matrix` (without running CLI migrations inside the same process), also enable in `[security]`:

```ini
disable_natives = spawn_process, exec_capture, run_payload, run_payload_strict
```

And pair with container/OS isolation (`USER spid3r`, unprivileged Linux UID, `--sandbox`, `--budget <steps>`, or `--max-call-depth` for untrusted sub-scripts).

---

## 3. Cryptographic & HTTP Controls

| Control | Implementation | Notes |
|---|---|---|
| **Fail-closed `APP_ENV` / `APP_KEY`** | `Config.matrix`, `Application.check_production_ready()` | `APP_ENV` defaults to `"production"` (`debug = false`). Production refuses to start if `APP_KEY` / `SPID3R_APP_KEY` is missing, `< 16` chars, or a known placeholder. Run `spid3r magic key:generate`. |
| **Runtime minimum check** | `RuntimeVersion.matrix` | Verifies Spid3r runtime >= `1.1.1` when CLI binary is inspectable; skipped cleanly in standalone AOT or when `exec_capture` is disabled. |
| **Password hashing** | `Hash.matrix`, `config/auth.matrix`, `Auth.matrix` | Defaults to **Argon2id** (`m=19456`, `t=2`, `p=1`) with **Bcrypt** verification compatibility and automatic `Hash.needs_rehash()` upgrade on successful login. |
| **RFC 6265 cookies** | `CookieJar.matrix`, `Response.matrix` | Validates cookie token names, control chars/semicolons, path leading `/`, emits separate `Set-Cookie` headers, and sets `Secure` automatically on HTTPS / production. |
| **Security headers & CSP** | `config/security.matrix`, `Response.matrix`, `Application.matrix` | Default strict CSP (`default-src 'self'; object-src 'none'; frame-ancestors 'none'`), `nosniff`, `SAMEORIGIN`, `COOP`, `Permissions-Policy`, per-route `.csp()`/`.security_headers()`, and automatic production TLS HSTS. |
| **Static files & uploads** | `StaticFiles.matrix`, `RequestParser.matrix`, `Storage.matrix`, `config/upload.matrix` | Segment-based traversal guard, upload size/count/extension/MIME validation (`blocked_extensions`: `html`, `htm`, `svg`, `js`, `php`, `exe`, etc.), server-side randomized upload names, and `/uploads/` `Content-Disposition: attachment` + `default-src 'none'; sandbox` CSP. |
| **Trusted proxies** | `config/http.matrix`, `Request.matrix` | Honors `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Host` **only** when the peer IP matches `SPID3R_TRUSTED_PROXIES`. |
| **WebSockets** | `WsServer.matrix` | Atomic `max_clients` slot cap, `max_message_bytes` enforcement, and `allowed_origins` policy helper. |

---

## 4. File Permissions & Windows / OneDrive Checklist

On POSIX hosts (Linux / macOS / Docker):

- `.env`: `chmod 0600 .env` (never readable by group/others; never copied into Docker images).
- `storage/` (and subdirectories) & `database/`: `chmod 0700`; SQLite files and logs `chmod 0600`.
- Application source (`app/`, `bootstrap/`, `config/`, `framework/`, `routes/`, `public/`): root-owned / read-only to the unprivileged `spid3r` service user (`USER spid3r` in `deploy/Dockerfile`).
- Run `spid3r magic doctor --fix --strict` before releasing to verify permissions, directory presence, config validity, `APP_KEY`, and DB connectivity.

On Windows development workstations:

- Keep development clones outside **OneDrive-synced** folders (e.g. `C:\dev\spid3r_web`), or exclude `.env`, `storage/`, and `database/` from sync so SQLite WAL/SHM locks do not conflict and secrets are not uploaded to cloud storage. Set `SPID3R_STATE_DIR=%LOCALAPPDATA%\Spid3rWeb` (or `SPID3R_DB_PATH`) when developing inside a synced folder.
- Runtime state isolation: SQLite runtime state resolves via `app.paths.state_dir` (`SPID3R_STATE_DIR`, default `storage`, placing the file at `storage/database/database.sqlite`) cleanly separated from code in `app/` and `database/migrations/`.

---

## 5. Single-Process vs. Multi-Process State Matrix

| Subsystem | Single Process | Multiple Workers / Containers | Notes |
|---|---|---|---|
| **Cache (`config/cache.matrix`)** | `memory` (dev/test) or `file` | **`file`** (shared volume) or **`database`** | `APP_ENV=production` defaults cache driver to **`file`** automatically when `SPID3R_CACHE_DRIVER` is unset. |
| **Throttle (`ThrottleMiddleware`)** | `Cache` (`memory` ok) | Set **`SPID3R_CACHE_DRIVER=database`** (or edge rate-limiting in nginx/Caddy) | `ThrottleMiddleware` stores counters in `Cache`; in-memory counters do not synchronize across separate OS processes. |
| **Sessions (`sessions` table)** | DB (`sqlite`/`postgres`/`mysql`) | DB (`postgres`/`mysql`/`mariadb`) | Server-side DB table; share across replicas seamlessly. |
| **Queue (`jobs` table)** | DB or `sync` | DB (`postgres`/`mysql`/`mariadb`) | Uses optimistic compare-and-swap on `reserved_at` (`retry_after` reclamation). |

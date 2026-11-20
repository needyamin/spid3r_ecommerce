# Spid3rWeb — Architecture & Technical Reference

**Version:** `1.1.1` · **Verified against:** Spid3r `v1.1.1+` (Bytecode VM default + Tree-Walk oracle + LLVM 23 AOT) · **Related docs:** [Security Guide](SECURITY.md) · [Driver Support Matrix](DRIVERS.md) · [Deploy Guide](DEPLOY.md) · **API Docs:** run `spid3r magic docs` → `docs/build/api.html`

---

## 1. Division of Responsibility

Spid3rWeb builds a clean, zero-dependency MVC architecture on top of Spid3r's native Rust runtime primitives:

| Layer | Owner | Responsibilities |
|---|---|---|
| **Runtime Natives (Rust)** | `spid3r` / `spid3r-self` | Multi-threaded HTTP/1.1 `serve_listener` worker pool (keep-alive, native TLS `tls_listen`, chunked `http_stream`), TCP sockets (`tcp_connect`/`tcp_listen`), RFC 6455 WebSocket (`ws_*`), streaming file I/O, `file_seek`, `gzip_compress`/`gunzip` & `write_file_atomic`, `file_lock`, SQLite / PostgreSQL / MySQL native drivers, `argon2_hash` / `argon2_verify`, `bcrypt_hash` / `bcrypt_verify`, `sha256` / `hmac_sha256` / `secure_compare`, `mutex`, `spid3r.ini` security guardrails (`basedir`, `modules.disable`, `disable_natives`, `--budget`, `--sandbox`) |
| **Application Bootstrap** | `app/`, `bootstrap/`, `routes/` | `bootstrap/app.matrix` wires providers & route modules (`AppServiceProvider`, `HomeController`, `routes/web.matrix`, `routes/api.matrix`, `routes/queue.matrix`); `server.matrix` and `magic` delegate here cleanly |
| **Spid3rWeb Framework** | `framework/` | Single-import barrel (`framework/Web`), `Foundation/` (`Application`, `Config`, `ConfigValidator`, `Container`, `Env`, `Server`, `ServiceProvider`, `RuntimeVersion`), `Http/` (`Router`, `RouteMatcher`, `Request`, `RequestParser`, `Response`, `CookieJar`, `StaticFiles`, `Csrf`, `Middleware`, `Controller`, `Resource`, `Validator`, `ValidatorRules`, `HttpException`, `ErrorRenderer`), `Database/` (`DB`, `Driver`, `Connection`, `ServerConnections`, `ConnectionPool`, `DatabaseManager`, `QueryBuilder`, `QueryCompiler`, `Schema`, `Migration`, `Model`, `ModelRepository`), `Auth/` (`Auth`, `Hash`, `Jwt`), `Session/`, `Cache/`, `Log/`, `Mail/`, `Queue/`, `Filesystem/`, `Events/`, `View/` (`BD`, `TemplateCompiler`, `TemplateEvaluator`), `WebSocket/`, `Console/`, and `Testing/` |

---

## 2. Request Lifecycle

Every incoming HTTP request passes through `Application.handle_request(raw_req)`:

1. **Production Policy & Provider Boot**: `check_production_ready()` validates `APP_KEY` and `RuntimeVersion.assert_min_runtime_version()`. `app.boot()` runs `register()` / `boot()` on all registered `ServiceProvider` instances once before the first request and dispatches `app.booted`.
2. **Request Construction & Method Spoofing**: `Request.init_from_raw(raw_req)` parses headers, cookies, query string, JSON/form/multipart bodies (`RequestParser.matrix` enforcing `config/upload.matrix` limits and trusted-proxy `SPID3R_TRUSTED_PROXIES` rules), and applies `_method` / `X-HTTP-Method-Override` spoofing.
3. **Request-Scoped Authentication**: Creates an isolated `AuthManager` on `req.auth`. Three-part `Bearer` JWTs verify statelessly via `Jwt.verify()` (0 DB hits); cookie/opaque tokens check the `sessions` table.
4. **2-Layer CSRF Defense (`Csrf.matrix`)**: On state-changing methods (`POST`, `PUT`, `PATCH`, `DELETE`), enforces `is_same_origin(req, origin)` (Layer 1) and per-session `_csrf` token verification for cookie sessions (Layer 2).
5. **Static Asset Delivery (`StaticFiles.matrix`)**: Serves `/css/`, `/js/`, `/assets/`, `/images/`, `/fonts/`, `/vendor/`, `/uploads/` with segment-based traversal guards, weak `ETag` (`304 Not Modified`), `Accept-Ranges: bytes` + HTTP `Range` (`206`/`416`), `gzip_compress` (`Vary: Accept-Encoding`), chunked `file_stream` responses, and `Content-Disposition: attachment` + sandbox CSP on `/uploads/`.
6. **Global Onion Pipeline**: Executes `self.global_middleware` around downstream dispatch (`CorsMiddleware` handles `OPTIONS`).
7. **O(1) / Prefix-Indexed Route Matching & Model Binding**: Exact static routes resolve in O(1) via `static_routes[method][path]`; parameterized routes use length + 2-level prefix buckets in `RouteMatcher`; registered parameter resolvers (`app.bind()` / `Route.bind()`) hydrate `req.bound(key)`; unmatched requests check root static files, `405`, `fallback`, or `404`.
8. **Route Middleware & Handler Dispatch**: Resolves aliases (`auth`, `guest`, `throttle:N,S`, `etag`, `request_id`) and runs controller/closure handlers.
9. **Response Finalization (`finalize_http_response`)**: Coerces maps/lists/strings, commits dirty `req.session()` stores (`Cache` + `Set-Cookie`), applies RFC 6265 cookies via `CookieJar`, and attaches auto-HSTS on production HTTPS requests.

---

## 3. Spid3rWeb vs. Stdlib `web` Security Scope

`../docs/SECURITY.md` notes under *Known gaps* that Spid3r's bare stdlib `web` module has no built-in CSRF middleware and uses signed client-side session cookies. **Spid3rWeb fills both gaps in framework code**:

- Server-side sessions (`sessions` DB table in `Auth.matrix` + `Cache`-backed `SessionStore` in `Session.matrix`).
- Two-layer CSRF protection (`Origin` validation + synchronizer `_csrf` token in `Csrf.matrix`).
- Full details live in [`docs/SECURITY.md`](SECURITY.md).

---

## 4. Upstream Runtime Nuances & Invariants

- **`spider.toml` strict manifest schema**: Spid3r v1.1.1's `pkg::Manifest` allows only `[package]` (`name`, `version`, `entry`), `[dependencies]`, and `[workspace]`. Framework minimum-runtime enforcement (`MIN_SPID3R_VERSION = "1.1.1"`) therefore lives in `framework/Foundation/RuntimeVersion.matrix` and `config/app.matrix`.
- **Dynamic Migration Registry**: Migrations under `database/migrations/` support both `Migration` subclasses and Laravel-9-style `public fn up()`/`down()` modules without any committed `registry.matrix`. `MigrationRegistry.matrix` generates the git-ignored `storage/framework/migrations.matrix` (with SHA-256 content digests) automatically on `migrate*` and `build`, while `MigrationRunner` tracks migration checksums, supports `--pretend`, `--step`, `migrate:fresh`, `migrate:reset`, `db:wipe`, and wraps DDL in transactions where supported (SQLite/PostgreSQL).
- **3-Engine Differential & Coverage Testing**: Because `examples/` exists at repo root, bare `spid3r test` inspects `examples/*.matrix`. Use `spid3r magic test --differential` (verifies `tree`, `vm`, and compiled `.matrixc` `exec` parity), `--coverage`, and `--db=all`.
- **Explicit Imports & Mutability Rules**:
  - `import "X"` exports only direct `public` symbols of `X.matrix`; use `import "framework/Web";` for factories or import classes directly.
  - `for x in list` iterates over copies — use indexed `while` loops for in-place list mutations.
  - Guard shared mutable state with `mutex()`, avoid `super()` for LLVM AOT compatibility, and always guard `m[k]` reads with `m.has(k)`.

---

## 5. Stdlib Overlap & Design Decisions

Spid3r `v1.1.1` ships stdlib modules (`session`, `middleware`, `multipart`, `uuid`, `semver`, `toml`, `yaml`, `http`) alongside Spid3rWeb's framework subsystems. The table below documents where Spid3rWeb extends vs. relies on the stdlib:

| Framework Component | Stdlib Module | Design Choice & Rationale |
|---|---|---|
| `framework/Session/Session.matrix` & `Auth.matrix` | `session.matrix` | Keeps DB `sessions` table + `Cache`-backed server-side flash/session storage, CSPRNG IDs via `random_bytes`, and RFC 6265 `CookieJar` validation (`Set-Cookie` emission separated cleanly from client-side session serialization). |
| `framework/Http/Middleware.matrix` | `middleware.matrix` | Keeps the framework's true Onion `(req, next) => next(req)` pipeline contract, `ThrottleMiddleware` (`X-RateLimit-*` via pluggable `Cache`), `CorsMiddleware`, `EtagMiddleware`, and `RequestIdMiddleware` so custom app middleware composes uniformly. |
| `framework/Http/RequestParser.matrix` | `multipart.matrix` | Retains framework-level `config/upload.matrix` limits (`max_bytes`, `max_files`, extension/MIME allow/deny filtering, safe filenames), `_method` spoofing, and trusted-proxy IP/proto gating in one parser pass. |
| Runtime helpers | `uuid`, `semver`, `toml`, `yaml` | Use stdlib natives/modules directly when adding optional TOML/YAML integrations (real exports: `uuid.uuid_v4`, `toml.toml_parse`, `semver.semver_parse`). Framework runtime version checks live in `RuntimeVersion.matrix` for zero-import boot checks. |

# Spid3rWeb — Architecture & Technical Reference

**Status:** Authoritative engineering document (verified 2026-11-07 against Spid3r v1.0.0 and the 17-suite test harness).

---

## 1. Division of Responsibility

Spid3rWeb builds a clean, zero-dependency MVC architecture on top of Spid3r's native Rust runtime primitives:

| Layer | Owner | Responsibilities |
|---|---|---|
| **Runtime Natives (Rust)** | `spid3r` binary | Multi-threaded HTTP/1.1 `serve_listener` worker pool, TCP sockets, RFC 6455 WebSocket (`ws_*`), SQLite / PostgreSQL / MySQL native drivers, `bcrypt_hash` / `bcrypt_verify`, `sha256` / `hmac_sha256` / `secure_compare`, `mutex`, Thompson NFA `regex_match`, `json_parse` / `json_write` |
| **Spid3rWeb Framework** | `framework/` | Single-import barrel (`framework/Web`), HTTP kernel (`Application`), O(1) + prefix-indexed `Router`, true Onion `Middleware` pipeline, zero-boilerplate ORM (`DB`, `QueryBuilder`, `Schema`, `Model`, `ModelRepository`), `Validator` with type coercion, `Auth` + stateless `Jwt`, `SessionStore` + flash messages, thread-safe `Cache`, `Config` / `Env`, thread-safe `Log`, `Storage`, `Mail`, `Queue`, SpiderBD v2 (`BD`), `ServiceContainer`, `Event` bus, `TestClient`, Magic CLI, and auto-discovering `TestRunner` |

---

## 2. Request Lifecycle

Every incoming HTTP request passes through `Application.handle_request(raw_req)`:

1. **Idempotent Provider Boot**: `app.boot()` runs `register()` / `boot()` on all registered `ServiceProvider` instances once before the first request and dispatches `app.booted`.
2. **Request Construction & Method Spoofing**: `new Request(raw_req)` parses headers, cookies (`self.cookies`), query string, JSON/form/multipart bodies (`self.data`, `self.files`), and applies `_method` / `X-HTTP-Method-Override` spoofing (`PUT`, `PATCH`, `DELETE`) on `POST` requests. Attaches `req.app = self` and `req.res = new Response()`.
3. **Request-Scoped Authentication**: Creates an isolated `AuthManager` on `req.auth` (never mutating global state across concurrent worker threads). If a `Bearer` token is a 3-part JWT, verifies it statelessly via `Jwt.verify()` with zero DB queries; otherwise validates the session token against the `sessions` table. Sets `req.user_data` when authenticated.
4. **CSRF Defense-in-Depth**: On state-changing methods (`POST`, `PUT`, `PATCH`, `DELETE`), verifies `Origin` vs `Host` (Layer 1) and per-session `_csrf` tokens for cookie-authenticated browser requests (Layer 2).
5. **Static Asset Delivery & Conditional GET**: Serves `/css/`, `/js/`, `/assets/`, `/images/`, `/fonts/`, `/vendor/`, `/uploads/` with strict path-traversal guards, weak `ETag` (`W/"<size>-<mtime>"`), and `If-None-Match` → `304 Not Modified` short-circuiting.
6. **Global Onion Pipeline**: Executes `self.global_middleware` around downstream route dispatch. Middleware can short-circuit early (e.g. `CorsMiddleware` on `OPTIONS`) or wrap downstream execution via `let res = next(req)`.
7. **O(1) / Prefix-Indexed Route Matching**:
   - Exact static routes resolve in **O(1)** via `static_routes[method][path]`.
   - Dynamic routes (`:id`, `{id}`) resolve via `dynamic_by_len[method][seg_count]` with 2-level (`s1/s2`) and 1-level (`s1`) literal prefix buckets and pre-split segment arrays.
   - Catch-all routes (`*filepath`) resolve via `wildcard_routes[method]`.
   - Unmatched paths check root static files (`/robots.txt`, `/sitemap.xml`, `/favicon.ico`, `/manifest.json`), `405 Method Not Allowed` (`allowed_methods`), or `router.fallback_handler`.
8. **Route-Specific Onion Pipeline & Handler Dispatch**: Resolves middleware aliases (`auth`, `guest`, `throttle:60,60`, `etag`, `request_id`, custom closures/classes) and invokes the handler (`req => ...` or `(req, res) => ...`).
9. **Response Coercion & Session Commit**: Plain `map` and `list` return values auto-coerce to `200 application/json`; `string` returns auto-coerce to `200 text/html`. Dirty `req.session()` stores commit to `Cache` and emit `Set-Cookie: spid3r_sid=...`. Typed `HttpException` maps render via `ErrorRenderer.http_error` (JSON for `/api/*` or `Accept: application/json`, HTML cards otherwise).

---

## 3. Component Status

| # | Component | Module | Highlights |
|---|---|---|---|
| 1 | Single-Import Barrel | `framework/Web.matrix` | Exports `web()`, `router()`, `model()`, `route()`, `abort()`, `db()`, `schema()`, `cache()`, `auth()`, `jwt()`, `hash()`, `log()`, `queue()`, `mail()`, `storage()`, `events()`, `config()`, `views()`, `test_client()` |
| 2 | HTTP Kernel | `framework/Application.matrix` | Direct routing (`app.get/post/put/patch/delete/group/mount`), return auto-coercion, static ETag (`304`), CSRF defense |
| 3 | O(1) & Bucketed Router | `framework/Router.matrix` | **133,333 ops/sec** on VM; `:param` & `{param}`, `*wildcard`, `mount()`, `url()` reverse routing |
| 4 | True Onion Middleware | `framework/Middleware.matrix` | `(req, next) => ...` closures & class middleware; built-in `auth`, `guest`, `cors`, `logger`, `etag`, `request_id`, `throttle` (`X-RateLimit-*`) |
| 5 | Request & Uploads | `framework/Request.matrix` | `_method` spoofing, cookies & HMAC `signed_cookie`, multipart file uploads (`req.file`, `req.store_file`), `only`/`except`/`bool`/`float`/`page`/`per_page`, `validate_or_fail()` |
| 6 | Fluent Response | `framework/Response.matrix` | Cached HSTS init, `.status()`, `.json()`, `.html()`, `.text()`, `.send()`, `.redirect()`, `.cookie()`, `.signed_cookie()`, `.clear_cookie()` |
| 7 | Validation & Coercion | `framework/Validator.matrix` | `.validated()` type coercion (`int`, `float`, `bool`) + `required`, `nullable`, `min`, `max`, `between`, `min_value`, `max_value`, `email`, `url`, `uuid`, `regex`, `in`, `confirmed`, `same`, `alpha`, `alpha_num`, `array`/`list`, `map`, `unique:table,col`, `exists:table,col` |
| 8 | Stateless JWT & Auth | `framework/Auth/Jwt.matrix`, `Auth.matrix` | HS256 `Jwt.sign` / `Jwt.verify` (`hmac_sha256` + `secure_compare`), zero-DB Bearer JWT auth, CSPRNG DB sessions, `Hash` (bcrypt) |
| 9 | Sessions & Flash | `framework/Session/Session.matrix` | `req.session()` key-value store (`get`, `put`, `has`, `forget`, `flush`) + one-time `flash()` / `get_flash()` |
| 10 | Zero-Boilerplate ORM | `framework/Database/Model.matrix` | `model("table", opts)` repository, `casts` (`int`, `float`, `bool`, `string`, `json`), `hidden` stripping, dirty tracking (`is_dirty`), `find_or_fail`, `first_or_fail`, `update_or_create`, batched eager loading (`load_has_many`, `load_belongs_to`), lifecycle events |
| 11 | QueryBuilder & Schema | `QueryBuilder.matrix`, `Schema.matrix` | Parameterized SQL across SQLite/PostgreSQL/MySQL/MariaDB, joins, `whereIn`, `whereNull`, `whereGroup`, `latest`, `oldest`, `paginate` (capped at 100), mutex-serialized `DB.transaction()` |
| 12 | SpiderBD v2 Views | `framework/View/BD.matrix` | Pre-compiled line cache with `file_mtime` invalidation (**9,569 ops/sec** on VM), `@if` comparisons (`==`, `!=`, `>=`, `<=`, `>`, `<`, `and`, `or`, `not`), `@elif`, inline `@if`, `loop` metadata in `@foreach`, `@csrf`, `@method`, `views().share()` |
| 13 | Thread-Safe Cache & Log | `CacheStore.matrix`, `Log.matrix` | Mutex-guarded `MemoryCacheStore` (bounded 10,000 keys + atomic `add`/`increment`), file & DB stores; mutex-guarded appending `Log.write()` |
| 14 | DI, Providers & Events | `Container.matrix`, `ServiceProvider.matrix`, `Event.matrix` | `bind`/`singleton`/`instance`/`extend`/`alias`; `register`/`boot` lifecycle; exact + `prefix.*` wildcard listeners, `once`, subscribers |
| 15 | WebSocket Server | `framework/WebSocket/WsServer.matrix` | RFC 6455 server alongside HTTP app, per-connection handlers + cross-connection `broadcast()` |
| 16 | TestClient & Magic CLI | `TestClient.matrix`, `ConsoleKernel.matrix`, `TestRunner.matrix` | Fluent `app.test_client()` (`acting_as`, `post_json`, `assert_json_path`), auto-discovered `tests/test_*.matrix` suites, `make:controller/model/middleware/provider/test/migration`, `key:generate`, `cache:clear` |

---

## 4. Spid3r Language Invariants for Contributors

- **Explicit Imports (Non-Transitive)**: Spid3r `import "X"` only exports `public` symbols declared directly in `X.matrix`. Use `import "framework/Web";` for single-import factory access (`web()`, `model()`, `route()`, `db()`, etc.), or import specific class modules directly when using `new ClassName()`.
- **`for x in list` Iterates Over Copies**: Mutating `x` inside `for x in list` mutates a copy. Always use indexed loops (`while i < list.len() { list[i].mutate(); i += 1; }`) when mutating list elements in place.
- **Closures & Outer Variables**: Closures read outer variables by value and cannot reassign outer scalars; mutate a captured `map` or `list` (`let state = {"count": 0}; state["count"] += 1;`) instead.
- **Top-Level Classes**: Classes must be declared at module top level, never inside a function. Default member visibility is `private`; mark public API methods and fields `public`.
- **String Interpolation**: Double-quoted strings interpolate `{ident}` when there are no spaces inside braces. Escape literal braces as `\{` and `\}` or use raw strings `r"..."`.
- **Reserved Keywords**: Never use `match`, `in`, `as`, `from`, `new` (except constructor `fn new`), `async`, `await`, `spawn`, `yield`, `interface`, or `abstract` as variable, parameter, or method names.

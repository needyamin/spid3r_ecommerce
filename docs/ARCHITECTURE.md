# Spid3r Web — Architecture & Roadmap

**Status:** authoritative engineering document. Supersedes the milestone tables in `docs/history/PROJECT.md` (kept for history).

**Verified:** 2026-11-06, against the Spid3r language source (`spid3r/src`, `stdlib/`, `docs/`) and this repository.

---

## 1. Division of Responsibility

The framework deliberately does **not** reimplement what the language already provides. Three layers:

| Layer | Owner | Examples |
|---|---|---|
| Runtime natives (Rust) | `spid3r/src/stdlib/*.rs` | TCP, HTTP/1.1 framing, WebSocket (`ws_*`), MySQL/PostgreSQL/Redis/SQLite clients, bcrypt/argon2, crypto digest, compression, regex, multipart |
| First-party stdlib (`.matrix`) | `spid3r/stdlib/` | `http` (server loop, keep-alive, graceful shutdown, error isolation), `web` (WebApp, cookies, JWT, CSRF-ready responses, template, static files), `middleware` (cors, csrf, gzip, etag, rate-limit, security headers, basic auth, body limit), `session` (server-side sessions + flash), `fastcgi`, `multipart`, `smtp`, `uuid`, `toml`, `testkit`, `mock` |
| **Spid3r Web framework** | this repo | MVC lifecycle, Router, Middleware pipeline, ORM (DB/QueryBuilder/Schema/Model), Migrations, Validation, Auth, Cache, Config/Env, Log, Storage, Mail, Queue, BD view engine, Container, Events, CLI, TestRunner |

Language capabilities the framework relies on (all verified in `docs/GRAMMAR.md` + source):
classes with single inheritance + interfaces + visibility, enums with pattern `match`, closures, `spawn`/`await` concurrency on an OS-thread scheduler, `mutex`, `try/catch/finally`, string interpolation, named/default arguments, nullable and union types.
Class declarations are **top-level only** (no nested classes). Closures read outer locals but cannot reassign them — mutate through captured containers (maps/lists) instead.

## 2. Component Status (target: 30-component enterprise framework)

| # | Component | Status | Notes |
|---|---|---|---|
| 1 | HTTP kernel & lifecycle | ✅ | `Application.matrix` on the stdlib `serve_listener` loop (keep-alive, drain, body limits, error isolation) |
| 2 | Routing engine | ✅ | `Router.matrix`: verbs, `:param`, groups (prefix/middleware), names, fallback, 405 detection, `route:list` |
| 3 | Controllers | ✅ | `Controller.matrix` base class |
| 4 | Middleware pipeline | ✅ | `Middleware.matrix` onion pipeline + named registry (`Application.middleware(name, factory)`) |
| 5 | DI container | ✅ | `Container/Container.matrix`: bind/singleton/instance/make/fresh/extend/alias; global `Container` facade; wired into Application (`app.container`, `req.app`) |
| 6 | Service providers | ✅ | `Providers/ServiceProvider.matrix`: `register(container)`/`boot(container)` phases; `Application.register()` + idempotent `boot()` (auto-run by `listen()` and lazily by the first request); `app.booted` event dispatched |
| 7 | Request/Response | ✅ | incl. secure cookies (HttpOnly/SameSite/Secure), JSON/HTML/redirect builders, HEAD handling |
| 8 | View engine | ✅ | `View/BD.matrix` SpiderBD: layouts, sections, `@if`/`@foreach`, dot-notation, auto-escape |
| 9 | Model layer | ✅ | `Database/Model.matrix`: Active Record, `hasMany`/`belongsTo` lazy relations, **batched eager loading** (`load_has_many`/`load_belongs_to` — one extra query, never N+1, works on model instances or row maps), **lifecycle events with veto** (`model.<table>.creating/.created/.updating/.updated/.deleting/.deleted` via the Event bus; a listener returning `false` cancels), touch, reload |
| 10 | ORM / DB abstraction | ✅ | `DB` facade, QueryBuilder (incl. joins), Connection, DatabaseManager; SQLite/MySQL/PostgreSQL native drivers; prepared statements throughout |
| 11 | Migrations | ✅ | auto-discovery, registry sync, `migrate`/`rollback`/`status`, `make:migration` |
| 12 | Seeders | ✅ | `db:seed`, stub `DatabaseSeeder` |
| 13 | Validation | ✅ | `Validator.matrix` |
| 14 | Auth | ✅ | `Auth.matrix` (CSPRNG session tokens, CSRF payload) + `Hash.matrix` (bcrypt); `auth` middleware alias (401 JSON for API, `/login` redirect for web) + `guest` middleware; request-scoped `req.auth` + `req.app` on every request |
| 15 | Sessions | ✅ | framework auth sessions + stdlib `session.matrix` (flash, pruning) + CSRF middleware |
| 16 | Cookies | ✅ | `web.matrix` cookie builder + Response flags |
| 17 | File storage | ✅ | `Filesystem/Storage.matrix`, traversal-guarded |
| 18 | Cache | ✅ | memory/file/database drivers, remember/add/increment, throttle uses it |
| 19 | Logging | ✅ | `Log.matrix`, `storage/logs/` |
| 20 | Exception handling | ✅ | Typed HTTP exceptions (`HttpException.matrix`: bad_request/unauthorized/forbidden/not_found/validation_failed→422/too_many_requests) rendered centrally by `ErrorRenderer.http_error` (JSON for API clients, HTML cards otherwise); raw exceptions still → generic 500 with zero detail leak |
| 21 | Config | ✅ | `config/*.matrix` + dot-notation repository |
| 22 | Environment | ✅ | `Env.matrix` |
| 23 | CLI & scaffolding | ✅ | `magic serve/test/migrate*/db:seed/queue:work/route:list/make:*` |
| 24 | Queues & jobs | ✅ | database + sync drivers, `queue:work`, `routes/queue.matrix` |
| 25 | Events & listeners | ✅ **new** | `Events/Event.matrix`: exact + trailing-`*` wildcards, `once`, subscribers, global `Event` facade |
| 26 | RESTful API support | ✅ | JSON responses + route groups + `Resource.matrix` envelopes (`resource_item`/`resource_collection`/`resource_paginated` — transformers get plain maps, model instances auto-unwrapped) + typed exception aborts from handlers |
| 27 | WebSocket | ✅ | `WebSocket/WsServer.matrix`: real RFC 6455 server (per-connection handlers, port-based routing, first-message auth pattern, probe rejection, liveness registry) **plus cross-connection `broadcast()`** — enabled by a runtime fix (2026-11-06) that gives every plain TCP connection an independent write half, so `ws_send`/`ws_close` never block behind a parked `ws_recv` and frame writers serialize on the write-half mutex |
| 28 | Testing | ✅ | `TestRunner` + `tests/run_all.matrix`, 12 suites, `spid3r magic test` exit-code contract |
| 29 | Security | ✅ core | prepared statements, BD auto-escape, CSRF, traversal guard, secure cookie flags, bcrypt, stdlib security-headers/CORS/rate-limit middleware |
| 30 | App lifecycle | ✅ | ConsoleKernel + Application bootstrap |

**Test baseline:** `SPID3R_DB_DRIVER=sqlite spid3r magic test` → **16/16 suites, exit 0** (2026-11-06).

## 3. Roadmap

### Phase A — Lifecycle coherence ✅ DONE (2026-11-06)
- A1 ✅: `ServiceProvider` base (`register`/`boot`); `Application.register()` + idempotent `Application.boot()` (auto by `listen()`, lazy by first `handle_request`).
- A2 ✅: Container + Event wired into the lifecycle — `app.container` (with `app`, `router`, `events` core bindings), `req.app` on every request, `app.booted` event.
- A3 ✅: `auth` middleware alias (existed; verified + tested) and new `guest` middleware alias; request-scoped `req.auth` contract documented.

### Phase A½ — Provider ecosystem (optional next)
- Framework-provided providers extracting bootstrap from the Application constructor (DatabaseServiceProvider, CacheServiceProvider) — current facades work; refactor when a second app proves the shape.

### Phase B — ORM depth ✅ DONE (2026-11-06)
- B1 ✅: Eager loading — `load_has_many(models, table, foreign_key, as_key)` / `load_belongs_to(models, table, fk_column, as_key)` batched `IN` queries; accepts Model instances or row maps.
- B2 ✅: Pagination — `QueryBuilder.paginate()` (existed: total/last_page/from/to/has_more metadata) plus a hard `per_page` cap at 100 (DoS guard). Page-links view helper deferred to the example app (Phase E3).
- B3 ✅: Model events — `model.<table>.{creating,created,updating,updated,deleting,deleted}` on the Event bus; handlers get the model instance and may mutate it; returning `false` vetoes the operation (save returns false / delete aborts).
- B4 ✅: Transactions — `DB.transaction(callback)` (existed) now regression-tested at the Model level (commit + rollback-on-throw).

### Phase C — API & error ergonomics ✅ DONE (2026-11-06)
- C1 ✅: REST resource layer — `framework/Resource.matrix`: `resource_item` / `resource_collection` / `resource_paginated` envelopes with transformer fns (model instances unwrapped to plain maps; sensitive columns stay out by construction).
- C2 ✅: Typed exception hierarchy — `framework/HttpException.matrix` helpers (`map`-based with marker key; `is_http_exception()`); caught in `Application.handle_request` at all three entry points (global middleware, middleware alias resolution, route dispatch) and rendered via new `ErrorRenderer.http_error` — JSON for `/api/*` and `Accept: application/json`, HTML card otherwise; non-http exceptions keep the zero-leak generic 500.

### Phase D — WebSocket integration ✅ DONE with a documented runtime limit (2026-11-06)
- D ✅: `framework/WebSocket/WsServer.matrix` — companion WS server (own port; the stdlib `serve_listener` owns HTTP framing and `ws_accept` consumes the upgrade handshake itself, so path-based routing is impossible — routing is by port). Real handshakes, per-connection handler tasks, socket-timeout reaping, non-WS probe rejection, `client_count()`. Fully tested over loopback (echo, stateful per-connection protocol, probe rejection, contract errors).
- **Runtime limitation found — and fixed in the language (2026-11-06):** `spid3r/src/stdlib/net.rs` held one mutex across the blocking read (`read_exact_conn`) while `ws_send` needed the same lock — `ws_send` to a connection parked in `ws_recv` deadlocked permanently. Fix: every `Conn` now carries an independent write half (`try_clone` of the TcpStream, own mutex) used by all ws frame writers; the reader's lock stays free. Verified: language net/web/deadlock suites pass, and the broadcast integration test that previously hung 100+ s now passes in seconds. TLS connections (non-default feature) still serialize writes with reads — no clone exists there.

### Phase E — Quality, docs, release ✅ DONE (2026-11-06)
- E1 ✅: Benchmarks — `benchmarks/bench.matrix` (route matching, query compilation, JSON round-trip, BD render, SQLite CRUD) with recorded results in `benchmarks/RESULTS.md`: **bytecode VM is 1.4–2.1× faster than the tree-walk interpreter on framework work** (routing +62%, query compile +89%, template render +114%); SQLite rows are disk-bound noise. No claims without numbers.
- E2 ✅: README rewritten to match reality (component table, exception/resource/provider/event APIs, benchmark summary, VM deployment flag); `.env.example` demo-login leftovers removed.
- E3 ✅: `examples/task-api/main.matrix` — runnable full-stack example (provider, model events, validator → 422, typed 404, resource envelopes, pagination) exercised through `handle_request`; all endpoints verified (422/201/200/404, zero 500s, event counter proof).
- E4 ✅: CI (`.github/workflows/ci.yml`, pre-existing multi-engine workflow) extended: bytecode-VM runs of six key suites (verified green locally under `--engine vm`), full-stack example run, benchmark smoke. Workflow not yet exercised on GitHub — first push will validate.

## 4. Engineering Invariants (do not regress)

- No fake implementations — every feature testable or documented as a limitation.
- Framework never modifies the language repo to make framework code easier.
- Spid3r gotchas that already cost time: `match` is reserved (Router uses `match_any`); class symbols are not transitive across imports; `{var}` interpolates in `.matrix` strings (never write literal `{word}` placeholders in string literals); classes are top-level only; closures cannot reassign captured locals; **`for x in list` iterates over COPIES — mutate elements via indexed access (`l[i].method()`), never via the loop variable**; `DB.statement` runs stacked statements on SQLite (never feed it untrusted input); migrations registry is hand-curated in `database/migrations/registry.matrix`.
- User preferences: SEO-friendly URLs (`/resource/{slug}`), `/sitemap.xml` + `/robots.txt`, meta description on every page; single self-contained CSS, no framework/CDN/build step, no inline `style=`, 44px touch targets; JS as progressive enhancement only.

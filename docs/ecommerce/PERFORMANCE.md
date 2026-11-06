# Phase 13 — Performance and Scalability

What was measured, what was added, and what the runtime genuinely cannot do
yet — with the performance claims verified by an executable suite
(`tests/test_store_performance.matrix`).

**Deliverable:** performance-tested application.

---

## Baseline: application-layer load probe

`tools/store_load.matrix` drives the real request pipeline
(`Application.handle_request` — routing, middleware, controllers, views)
against a seeded 12-product catalog. Per-endpoint throughput and worst-case
latency, tree-walk interpreter, SQLite, in-process:

| Endpoint | Throughput | Avg | Worst |
|---|---|---|---|
| `GET /health` (liveness JSON) | ~3500 req/s | <1 ms | 1 ms |
| `GET /` (home, featured via cache) | ~250 req/s | 3 ms | 12 ms |
| `GET /catalog` (cached listing) | ~190 req/s | 5 ms | 9 ms |
| `GET /catalog?q=…` (uncached search) | ~250 req/s | 4 ms | 5 ms |
| `GET /product/:slug` (cached detail) | ~110 req/s | 9 ms | 17 ms |
| `GET /cart` (guest) | ~150 req/s | 6 ms | 14 ms |

Run it yourself (`LOAD_ITERS` controls the sample size):

```bash
LOAD_ITERS=150 spid3r run tools/store_load.matrix
```

These are single-process, single-machine numbers measured in CI on the
SQLite leg (25 iterations) so regressions are visible; production numbers
behind a real HTTP server and PostgreSQL will differ.

---

## What was added in this phase

### 1. Database indexes for the hot read paths

`database/migrations/020_performance_indexes.matrix` — the Phase 2 schema
indexed most access paths but missed five that real traffic exercises:

| Index | Serves |
|---|---|
| `order_items (product_id)` | verified-purchase review checks (Phase 10) |
| `loyalty_ledger (order_id)` | the exactly-one-award-per-order idempotency check |
| `coupon_usages (coupon_id)` | coupon usage accounting |
| `sessions (last_activity)` | session garbage collection |
| `jobs (queue, available_at)` | queue polling |
| `products (status, id)` | the storefront listing scan |

`down()` drops them with dialect-aware SQL (MySQL needs `ON <table>`).

### 2. Catalog caching with generation-based invalidation

The storefront's hottest reads are cached through the framework Cache facade
(`app/Services/StorefrontService.matrix`):

| What | Key | TTL |
|---|---|---|
| Home featured products | `store:catalog:v{N}:featured:{limit}:{currency}:{fx}` | `home_ttl` (120 s) |
| Catalog listing (unfiltered only) | `store:catalog:v{N}:list:{currency}:{fx}:{sort}:p{page}` | `product_ttl` (300 s) |
| Product detail context | `store:catalog:v{N}:product:{slug}:{currency}:{fx}` | `product_ttl` (300 s) |

**Invalidation is generation-based** (`app/Support/CatalogCache.matrix`):
entries are keyed with a version number and every catalog write bumps it,
orphaning all previous entries at once — no wildcard flush, identical
behaviour on every driver (memory / file / database). The bump happens in
EVERY write that can change what the storefront shows:

* product create / update / publish / delete (`ProductService`)
* category and brand writes (`CategoryService`, `BrandService`)
* gallery uploads and deletions (`ImageService`)
* stock movements — `InventoryRepository.reserve/release`, i.e. checkout,
  cancellations, returns and admin adjustments, so availability badges and
  detail pages never go stale after a sale
* display-currency changes (converted prices)

**Design guardrails:**

* Only the UNFILTERED listing is cached — its key space (sort × page) is
  bounded, so request params can never poison the cache into an unbounded
  key-explosion. Filtered searches always hit the database.
* Cache entries store FULLY decorated rows, so a hit performs zero queries.
* The default `memory` driver is per-process, which keeps test suites
  isolated (each suite is a fresh process); switching to `database` (shared)
  via `SPID3R_CACHE_DRIVER=database` needs no code change.

**Verified:** a raw DB insert does NOT appear (the cache is genuinely
serving), a version bump makes it appear, and a service write is visible
immediately (`test_catalog_cache`).

### 3. Image loading optimisation

All storefront `<img>` elements (home, catalog, product gallery) now carry
`loading="lazy"` and `decoding="async"` — off-screen product images no
longer block first paint (verified by `test_lazy_loading`).

### 4. Static asset caching (already present, verified)

Static responses send `Cache-Control: no-cache` in development (edits show
up immediately) and `public, max-age=3600` in production.

### 5. Background jobs and the email queue (already present)

Emails never run inline: password reset, email verification, order
confirmation and support acknowledgements are queued (`routes/queue.matrix`)
and drained by `spid3r magic queue:work` with the database driver — the
request path has no SMTP dependency. SMS goes through the same queue.

### 6. Efficient inventory updates (already present)

Stock changes are single atomic conditional UPDATEs
(`UPDATE … WHERE quantity >= ?`) inside the checkout transaction — no
read-modify-write races, no extra round trips.

---

## Runtime capabilities, stated honestly

| Requirement | Status |
|---|---|
| Connection reuse | ✅ `DatabaseManager.connection()` holds ONE connection per process and reuses it for every query. |
| Connection pooling (multi-connection) | ⛔ Not possible yet — the runtime is single-threaded per server process and its DB clients expose no pool. One reused connection is the correct ceiling today; revisit when the runtime adds concurrency. |
| Redis caching | ⛔ Not possible yet — the installed runtime does not ship the Redis stdlib module (`import "redis"` does not resolve), and inventing APIs is prohibited. The cache abstraction is driver-swappable, so a Redis driver is a drop-in `CacheStore` implementation the moment the runtime provides the native. The shared-cache role is covered today by `SPID3R_CACHE_DRIVER=database`. |
| Memory profiling | ⛔ No heap profiler is exposed by the runtime. The load probe reports latency-based regressions instead. |
| Runtime benchmarking | ✅ `benchmarks/bench.matrix` (framework hot paths, tree vs VM) and `tools/store_load.matrix` (storefront endpoints), both run in CI on the SQLite leg. |
| Load testing | ✅ Application-layer probe (above). Full network-level load testing (wrk/k6 against a listening server) belongs to deployment, not CI. |

---

## Tests

`tests/test_store_performance.matrix` — 4 checks, registered in both runners
and the CI bytecode-VM leg:

| Test | Verifies |
|---|---|
| `test_performance_indexes` | All six Phase 13 indexes exist — checked dialect-aware (sqlite_master / pg_indexes / information_schema). |
| `test_catalog_cache` | Cache serves (raw inserts stay hidden), version bumps invalidate, service writes are visible immediately. |
| `test_lazy_loading` | Product images carry `loading="lazy"` and `decoding="async"`. |
| `test_load_probe_available` | The load-probe harness ships with the repo (and runs in CI). |

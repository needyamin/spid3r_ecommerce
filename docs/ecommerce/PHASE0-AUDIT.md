# Phase 0 — Repository Audit & Compatibility Report

**Status:** COMPLETE — verified against source, not assumed.
**Scope:** Spid3r language (`spid3r/`), Spid3r Web framework (`spid3r_web/`), mapped against the e-commerce requirements (Phases 1–16 of the project brief).
**Conclusion:** 🟢 GO — every core e-commerce capability is buildable on the current stack. Payment gateways run over the language's outbound HTTP client; email/SMS have documented runtime limitations with working degradation paths.

---

## 1. Spid3r Language — verified capabilities (from source)

| Area | Verified capability |
|---|---|
| Syntax | Classes (single inheritance, interfaces, visibility), enums + `match`, closures, `spawn`/`await` + `mutex`, `try/catch/finally`, string interpolation, named/default args, nullable & union types |
| Execution | Interpreter (default), bytecode VM (`--engine vm`, 1.4–2.1× faster on framework work), LLVM AOT (available; `super` unsupported there — VM is the deployment target) |
| Networking | TCP client/server, HTTP/1.1 framing + client (`http_fetch` — **outbound HTTPS/HTTP, the payment-gateway transport**), WebSocket RFC 6455 (server + client, unmasked server frames after the 2026-11-06 runtime fix) |
| Database | Native **SQLite**, **MySQL/MariaDB**, **PostgreSQL** (md5/trust auth), **Redis** clients — all prepared-statement based |
| Crypto | bcrypt (passwords), SHA-256 + HMAC-SHA256 (**gateway signature verification**), CSPRNG `random_bytes` |
| Files | Full filesystem API, traversal guards; `multipart` parsing in stdlib (**file uploads**) |
| Serialization | JSON write/parse, TOML, CSV, XML, YAML |
| Concurrency | Thread-pool scheduler (`spawn`), mutex, channels — background workers are ordinary tasks |
| Testing | `magic test` runner (16 framework suites), `assert` builtin, exit-code CI contract |

## 2. Spid3r Web — capability matrix vs e-commerce needs

| E-commerce requirement | Framework support | Status |
|---|---|---|
| HTTP kernel, routing, `:params`, groups | `Application`, `Route.*`, groups (prefix+middleware), 405s, fallback | ✅ |
| Layered architecture (controllers/services/repos) | Plain classes + module imports; `app/` scaffolding | ✅ build |
| AuthN: register/login/logout, sessions, bcrypt | `Auth.attempt/login/logout`, `Hash.make/check`, CSPRNG session tokens, DB-backed sessions, sliding TTL | ✅ |
| AuthZ: roles/permissions for customer/staff/admin | DB tables + per-request `req.auth` + custom middleware aliases (`app.middleware(...)`) | ✅ build |
| Rate limiting (login, checkout) | `throttle:N,M` middleware alias, cache-backed | ✅ |
| Validation | `req.validate(rules)` — required/min/max/min_value/max_value/numeric/integer/email/in/confirmed/same/boolean/alpha/alpha_num/nullable | ✅ |
| Templates, layouts, SEO | SpiderBD (layouts/sections/auto-escape), SEO-friendly route conventions, `sitemap.xml`/`robots.txt` patterns | ✅ |
| Cart/orders/pricing correctness | Transactions (`DB.transaction`), row-level inventory guards inside transactions, model events with veto | ✅ build |
| Product catalog performance | QueryBuilder + eager loading (`load_has_many`) + `paginate()` (hard 100 cap) + Cache facade (memory/file/**Redis**) | ✅ |
| File uploads (product images) | Stdlib `multipart` parsing + `Storage` facade (traversal-guarded, local/public disks) | ✅ build |
| Emails (verification, order confirmations) | `Mail` facade with **log driver working**; SMTP blocked on runtime outbound TCP (documented limitation) → orders queue emails via `Queue`, log driver renders them until SMTP lands | 🟡 degraded-but-functional |
| SMS notifications | Requires outbound TCP beyond HTTP → **out of scope until runtime support**; schema + job scaffolding prepared, driver logs instead | 🟡 deferred |
| Payment gateways (bKash/Nagad/SSLCommerz/Stripe/COD) | `http_fetch` for gateway API calls; `hmac_sha256`/`sha256` for webhook signature verification; `DB.transaction` + idempotency tables for duplicate-callback protection; **never trust client-side success — server-to-server verify only** | ✅ build |
| Admin dashboard | Server-rendered SpiderBD views behind `admin` middleware alias; aggregate queries via QueryBuilder | ✅ build |
| Background jobs (emails, inventory sync) | `Queue` (database + sync drivers), `magic queue:work`, handler registry in `routes/queue.matrix` | ✅ |
| Testing | 16 framework suites stay green; store suites follow the same pattern (`tests/` + both runner lists) | ✅ |
| CI/CD | Existing workflow (lint + SQLite/MySQL/PostgreSQL matrix + VM-engine runs) extended for the store | ✅ |
| Audit logging | `audit_logs` table written in service layer inside the same transaction as the action | ✅ build |

## 3. Key architectural decisions

1. **Money = integer minor units.** All monetary columns store integers in the smallest currency unit (poisha for BDT, cents for USD). SQLite has no DECIMAL and float money is a correctness bug; integer minor units are the exact-numeric equivalent the brief allows. Currency formatting happens at the view edge.
2. **Primary DB: PostgreSQL.** All schema goes through the dialect-aware `Schema` builder so the suite also runs on SQLite (dev/CI) and MySQL (CI matrix). Postgres auth caveat: runtime client speaks md5/trust — production `pg_hba.conf` must set `password_encryption = 'md5'` for the app role (documented in deploy notes).
3. **Inventory correctness:** stock deduction happens inside `DB.transaction` with a conditional `UPDATE ... SET qty = qty - ? WHERE id = ? AND qty >= ?` (atomic; rowcount 0 → out-of-stock rollback). No read-then-write races.
4. **Payments are isolated from orders** (separate services + `payments`/`refunds` tables). Gateway adapters implement a common shape: initiate → redirect/collect → **server-to-server verify** → idempotent mark-paid. COD is the reference adapter.
5. **Prices are historical:** `order_items` snapshots unit price at purchase time; later catalog changes never mutate past orders.
6. **Guest carts** live in a `carts` row keyed by a cart cookie; login merges the guest cart into the user cart in one transaction.
7. **No language changes.** The 2026-11-06 runtime fixes (WS writer split, unmasked server frames) are already in `main` — this project needs no further runtime modifications.
8. **Framework extensions** go in the framework only if ≥2 app modules need them; otherwise they live in `app/Support/`.

## 4. Layered architecture (per the brief)

```
routes/*.matrix          HTTP registration only
app/Middleware/          access control, rate limits (framework aliases + app aliases)
app/Controllers/         HTTP in/out — delegates to services, no business logic
app/Validators/          rule maps + rule messages per form/use-case
app/Services/            business logic (Cart, Checkout, Order, Payment, Inventory, ...)
app/Repositories/        ALL database access (QueryBuilders), one per aggregate
app/Models/              domain entities extending framework Model
app/Events/ + app/Jobs/  event listeners + queue handlers
app/Policies/            authorization rules consulted by controllers/middleware
app/Support/             money formatting, slugify, address helpers
```

Rules honored: services never touch `req`; repositories centralize queries; payment ⟂ order logic; inventory ops transactional; secrets only via env.

## 5. Phase plan (mapping brief → milestones)

| Phase | Scope | Depends on |
|---|---|---|
| 0 | This audit | — |
| 1 | Project skeleton, bootstrap, config, README | 0 |
| 2 | Schema: all 24 tables + indexes/constraints + seeders | 1 |
| 3 | AuthN/AuthZ (customers, staff, admin; RBAC; login throttle) | 2 |
| 4 | Products/categories/brands/variants/images/inventory | 3 |
| 5 | Storefront (listing, search, filters, product pages, SEO) | 4 |
| 6 | Cart (guest + authed, merge, server-side totals) | 4 |
| 7 | Checkout + orders + statuses + invoices | 6 |
| 8 | Payments (COD reference adapter, then bKash/Nagad/SSLCommerz) | 7 |
| 9 | Admin dashboard | 4 |
| 10 | Reviews/wishlist/coupons/loyalty | 7 |
| 11 | Shipping & delivery | 7 |
| 12 | Security review pass | 3–11 |
| 13 | Performance pass (indexes, cache, queue workers) | 5–11 |
| 14 | Test suites (unit/integration/security/E2E) | 3–11 |
| 15 | CI/CD + deploy hardening | 14 |
| 16 | Docs | all |

Each phase lands with tests green and is pushed to `eCommerce` before the next begins.

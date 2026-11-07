# Spid3r Store 🛒

A complete, production-grade **e-commerce application** built on the
[Spid3r language](https://github.com/needyamin/spid3r) and the
**Spid3rWeb v2.0 Modern MVC framework** — 16 build phases, from repository
audit to documentation, residing in [`needyamin/spid3r_ecommerce`](https://github.com/needyamin/spid3r_ecommerce).

[![CI](https://github.com/needyamin/spid3r_ecommerce/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/needyamin/spid3r_ecommerce/actions/workflows/ci.yml)

Built on the Spid3r language and the Spid3rWeb v2.0 Modern MVC framework. Built for selling: catalog, cart, checkout, payments, shipping, fulfilment, returns, marketing and a full 8-module Admin SPA panel &mdash; 16 build phases, verified by **35 test suites** across both execution engines (tree-walk interpreter &amp; bytecode VM) and three database engines.

**Documentation:** <a href="docs/ecommerce/developer.html"><strong>Developer guide</strong></a> (the complete single-page guide: stack, Spid3rWeb v2.0 Modern MVC architecture, subsystems, guidelines) &middot; <a href="docs/ARCHITECTURE.md">Framework architecture</a> &middot; <a href="docs/ecommerce/API.md">API reference</a> &middot; <a href="docs/ecommerce/USER-GUIDE.md">User guide</a> &middot; <a href="docs/ecommerce/README.md">Docs index</a>

---

## Features

| Area | Highlights |
|---|---|
| **Catalog** | Products with variants/SKUs, nested categories, brands, galleries with cover/sort reordering, compare-at pricing, publication status, SEO metadata, tax rates & weight |
| **Storefront** | Daraz-inspired Bootstrap 5 storefront, homepage, catalog with filters/sorting/pagination, category/brand/product pages, search, related products, safe image placeholders, `sitemap.xml` + `robots.txt` |
| **Cart & checkout** | Guest cart (cookie) that merges on sign-in, server-side prices, volume discounts, coupons, gift cards, promotional campaigns, tax, zone-aware shipping with delivery estimates, atomic order placement |
| **Payments** | Cash-on-delivery fully wired; bKash / Nagad / SSLCommerz / Stripe adapters (config-driven, server-to-server verification, signed webhooks, idempotency, refunds, reconciliation) |
| **Fulfilment** | Shipment lifecycle with tracking numbers and delivery confirmation, multiple shipments per order, returns & exchanges with restock and refund ledger |
| **Customers** | Accounts, addresses, order history, invoices, order tracking, wishlist, verified-purchase reviews and ratings, loyalty points, referral program, support tickets |
| **Admin SPA & Panel** | Unified 8-module Admin SPA shell (`/admin` + `/admin/api/module/:module` for overview, orders, products, categories, brands, inventory, customers, settings, staff, roles, coupons), revenue reports, review moderation, returns queue, audit log, CSV/JSON export |
| **Platform & v2.0 MVC** | Single-import barrel (`framework/Web`), `req.validate_or_fail()` with type coercion, true Onion `(req, next)` middleware, SpiderBD v2 directives (`@elif`, `@csrf`, `@method`, `loop.*`), zero-boilerplate `model()` ORM, multi-currency display (integer FX), multi-language catalog, queued email & SMS, RBAC with permissions |

Non-negotiables enforced throughout: money is stored as **integer minor
units** (never floats); inventory changes are **transactional with atomic
conditional updates**; payment success is **never trusted from the client**
(server-to-server verification + idempotency); secrets live in the
environment only.

---

## Quick Start

**Requirements:** the [Spid3r runtime](https://github.com/needyamin/spid3r)
(≥ 1.0) and one of SQLite (default), PostgreSQL 16, MySQL 8.0 or MariaDB.

```bash
git clone https://github.com/needyamin/spid3r_ecommerce.git
cd spid3r_ecommerce

spid3r magic migrate      # create the schema (20 migrations)
spid3r magic db:seed      # settings, roles, permissions, currencies, translations
spid3r magic serve        # → http://localhost:8000
```

Or run the full stack in Docker (MySQL 8.0 + phpMyAdmin + Spid3r Store):

```bash
docker compose -f deploy/docker-compose.yml up -d --build
# Storefront:  http://localhost:8090
# phpMyAdmin:  http://localhost:8091
```

### Create the first admin

The seeder creates roles and permissions (`customer`, `staff`, `admin`) but **no users** (never ship default credentials). Register an account at `/register`, then promote it:

```sql
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.email = 'you@example.test' AND r.slug = 'admin';
```

Sign in again and `/admin` unlocks. Staff accounts with narrower
permissions are then manageable at `/admin/staff` and `/admin/roles`.

---

## Verification

```bash
# Static type & semantic verification:
spid3r check server.matrix
spid3r check magic

# Full suite (35 suites, auto-discovered by TestRunner) against a fresh database:
rm -f database/database.sqlite*
spid3r magic migrate && spid3r magic db:seed
SPID3R_DB_DRIVER=sqlite spid3r magic test
SPID3R_DB_DRIVER=sqlite spid3r magic test --engine=vm

# Real-server verification: boots the engine in Docker, migrates, seeds,
# starts the actual HTTP server and smoke-tests it over TCP.
./deploy/docker-smoke.sh mysql
```

CI runs the full 35-suite test runner on **SQLite, PostgreSQL and MySQL**, plus the
bytecode-VM engine (`--engine=vm`), an application-layer load probe, and a live
`magic serve` HTTP smoke — see
[docs/ecommerce/DEPLOYMENT.md](docs/ecommerce/DEPLOYMENT.md).

---

## Project structure

```
server.matrix / magic      v2.0 entrypoints (`import "framework/Web"; let app = web();`)
framework/                 Spid3rWeb v2.0 Modern MVC core (Web barrel, Router, Request,
                           Response, Middleware, Validator, BD v2, Model/DB, Session, Jwt,
                           Cache, Queue, Mail, Storage, TestClient, ConsoleKernel)
config/*.matrix            10 environment-driven config modules (`{ ... }` map literals)
routes/*.matrix            route registration only using `req => ...` arrow closures
                           (store, storefront, catalog, cart, auth, checkout, payments,
                           shipping, advanced, admin, queue, web, api)
app/Controllers/           HTTP in/out — `req.validate_or_fail()`, delegate, respond
app/Validators/            declarative rule maps per use-case
app/Services/              business logic (Cart, Checkout,Order, Payment, Shipping,
                           Fulfillment, Return, GiftCard, Campaign, Coupon, Currency,
                           Locale, AdvancedStore, Admin, Product, Category, Brand,
                           Inventory, Image, Auth, plus Gateway/PaymentGateway & SmsGateway)
app/Repositories/          ALL database access (Product, Catalog, Inventory, Cart,
                           Checkout, Order, Payment, User)
app/Support/               Money (integer minor units), Fx, Slug, StoreChrome,
                           CatalogCache, CartIdentity, DbErrors, Images
app/Providers/             service wiring (store settings, cache TTLs)
database/migrations/       001–020, dialect-aware, auto-registered
database/seeders/          settings, roles/permissions, currencies, translations
resources/views/           SpiderBD v2 templates (store, account, admin SPA, checkout, ...)
tests/                     35 auto-discovered suites (`test_*.matrix`) + `run_all.matrix`
tools/, benchmarks/, deploy/, examples/task-api/, docs/
```

---

## Configuration

Copy `.env.example` to `.env` — everything is environment-driven:

| Variable | Purpose |
|---|---|
| `SPID3R_DB_DRIVER` | `sqlite` (default) · `postgres` · `mysql` · `mariadb` |
| `SPID3R_CACHE_DRIVER` | `memory` (default, per-process) · `file` · `database` (shared) |
| `APP_ENV` / `SPID3R_ENV` | `production` hardens cookies and disables debug output; `dev` shows demo hints |
| `SPID3R_HSTS`, `SPID3R_COOKIE_SECURE` | opt-in TLS hardening |
| `SMS_DRIVER`, `SMS_SEND_URL`, `SMS_API_KEY` | SMS delivery (`log` = dev driver) |
| `{PROVIDER}_INIT_URL` / `_VERIFY_URL` / `_REFUND_URL` / `_API_KEY` / `_WEBHOOK_SECRET` | payment gateway adapters (unconfigured gateways fail fast; COD needs nothing) |

---

## Documentation

Everything lives in [`docs/`](docs/) and [`docs/ecommerce/`](docs/ecommerce/):

| Document | Contents |
|---|---|
| [developer.html](docs/ecommerce/developer.html) | **the complete developer guide** — stack, Spid3rWeb v2.0 Modern MVC architecture, subsystems, guidelines (single-page HTML) |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Spid3rWeb v2.0 framework architecture, request lifecycle, ORM, SpiderBD v2, security defaults |
| [DATABASE.md](docs/ecommerce/DATABASE.md) | 35+ tables, FKs, indexes, integer money, dialect handling |
| [BACKUP.md](docs/ecommerce/BACKUP.md) | backup & restore procedures |
| [AUTH.md](docs/ecommerce/AUTH.md) | registration, sessions, RBAC, throttling |
| [PRODUCTS.md](docs/ecommerce/PRODUCTS.md) | catalog, variants, galleries, safe uploads |
| [STOREFRONT.md](docs/ecommerce/STOREFRONT.md) | listing, filters, SEO URLs |
| [CART.md](docs/ecommerce/CART.md) | guest/auth cart, merge-on-login |
| [CHECKOUT.md](docs/ecommerce/CHECKOUT.md) | quotes, addresses, coupons, atomic placement |
| [PAYMENTS.md](docs/ecommerce/PAYMENTS.md) | COD + gateway adapters, webhooks, refunds |
| [ADMIN.md](docs/ecommerce/ADMIN.md) | 8-module Admin SPA dashboard, management pages, audit, export |
| [ADVANCED.md](docs/ecommerce/ADVANCED.md) | wishlist, reviews, loyalty, referrals, gift cards, campaigns, tracking, support, currency & language |
| [SHIPPING.md](docs/ecommerce/SHIPPING.md) | zones, rates, fulfilment lifecycle, returns |
| [SECURITY.md](docs/ecommerce/SECURITY.md) | the full security review matrix |
| [PERFORMANCE.md](docs/ecommerce/PERFORMANCE.md) | indexes, caching, load probe, runtime limits |
| [DEPLOYMENT.md](docs/ecommerce/DEPLOYMENT.md) | CI pipeline, Docker verification, deployment model |
| [API.md](docs/ecommerce/API.md) | HTTP API reference |
| [USER-GUIDE.md](docs/ecommerce/USER-GUIDE.md) | shopper & merchant guide |
| [PHASE0-AUDIT.md](docs/ecommerce/PHASE0-AUDIT.md) | the starting-point audit |

Contributing? Read [CONTRIBUTING.md](CONTRIBUTING.md) — the branch rules,
the architecture layers and the testing bar.

---

## Status

| Phase | Scope | State |
|---|---|---|
| 0–5 | Audit · skeleton · database · auth/RBAC · catalog · storefront | ✅ |
| 6–9 | Cart · checkout/orders · payments · 8-module Admin SPA & dashboard | ✅ |
| 10–13 | Advanced features · shipping & delivery · security · performance | ✅ |
| 14–16 | Automated testing · CI/CD & deployment · documentation · Spid3rWeb v2.0 Modern MVC upgrade | ✅ |

All 16 phases + the Spid3rWeb v2.0 Modern MVC upgrade are complete. **35/35 test suites green** on both the tree-walk interpreter and bytecode VM across SQLite, PostgreSQL and MySQL; every push is verified by CI on all engines plus a live-server smoke.

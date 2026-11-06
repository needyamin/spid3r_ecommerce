# Spid3r Store 🛒

A complete, production-grade **e-commerce application** built on the
[Spid3r language](https://github.com/needyamin/spid3r) and the
**Spid3rWeb MVC framework** — 16 phases, from repository audit to
documentation, developed on the `eCommerce` branch.

[![CI](https://github.com/needyamin/spid3r_web/actions/workflows/ci.yml/badge.svg?branch=eCommerce)](https://github.com/needyamin/spid3r_web/actions/workflows/ci.yml)

Built on the Spid3r language and the Spid3rWeb MVC framework. Built for selling: catalog, cart, checkout, payments, shipping, fulfilment, returns, marketing and a full admin panel &mdash; 16 build phases, verified by 31 test suites on three database engines.

**Documentation:** <a href="docs/ecommerce/developer.html"><strong>Developer guide</strong></a> (the complete single-page guide: stack, architecture, subsystems, guidelines) &middot; <a href="docs/ecommerce/API.md">API reference</a> &middot; <a href="docs/ecommerce/USER-GUIDE.md">User guide</a> &middot; <a href="docs/ecommerce/README.md">Docs index</a>

---

## Features

| Area | Highlights |
|---|---|
| **Catalog** | Products with variants/SKUs, nested categories, brands, galleries, compare-at pricing, publication status, SEO metadata |
| **Storefront** | Homepage, catalog with filters/sorting/pagination, category/brand/product pages, search, related products, `sitemap.xml` + `robots.txt` |
| **Cart & checkout** | Guest cart (cookie) that merges on sign-in, server-side prices, volume discounts, coupons, gift cards, promotional campaigns, tax, zone-aware shipping with delivery estimates, atomic order placement |
| **Payments** | Cash-on-delivery fully wired; bKash / Nagad / SSLCommerz / Stripe adapters (config-driven, server-to-server verification, signed webhooks, idempotency, refunds, reconciliation) |
| **Fulfilment** | Shipment lifecycle with tracking numbers and delivery confirmation, multiple shipments per order, returns & exchanges with restock and refund ledger |
| **Customers** | Accounts, addresses, order history, invoices, order tracking, wishlist, verified-purchase reviews and ratings, loyalty points, referral program, support tickets |
| **Admin** | Dashboard, revenue reports, product/category/brand/inventory/customer/staff/role/coupon/shipping/payment/settings management, review moderation, returns queue, audit log, CSV/JSON export |
| **Platform** | Multi-currency display (one canonical price list, integer FX), multi-language (translation catalog + fallback chain), queued email & SMS, RBAC with permissions, audit logging |

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
git clone -b eCommerce https://github.com/needyamin/spid3r_web.git
cd spid3r_web

spid3r magic migrate      # create the schema (20 migrations)
spid3r magic db:seed      # settings, roles, permissions, currencies, translations
spid3r magic serve        # → http://localhost:8000
```

### Create the first admin

The seeder creates roles and permissions but **no users** (never ship
default credentials). Register an account at `/register`, then promote it:

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
# Full suite (31 suites) against a fresh database — this is what CI runs:
rm -f database/database.sqlite*
spid3r magic migrate && spid3r magic db:seed
SPID3R_DB_DRIVER=sqlite spid3r magic test

# Real-server verification: boots the engine in Docker, migrates, seeds,
# starts the actual HTTP server and smoke-tests it over TCP.
./deploy/docker-smoke.sh postgres        # or: mysql
```

CI runs the full suite on **SQLite, PostgreSQL and MySQL**, plus the
bytecode-VM engine, an application-layer load probe, and a live
`magic serve` HTTP smoke — see
[docs/ecommerce/DEPLOYMENT.md](docs/ecommerce/DEPLOYMENT.md).

---

## Project structure

```
routes/*.matrix            route registration only (store, auth, checkout,
                           payments, admin, advanced, shipping, queue)
app/Controllers/           HTTP in/out — no business logic
app/Validators/            rule maps per use-case
app/Services/              business logic (Cart, Checkout, Payment, Shipping,
                           Fulfillment, Returns, GiftCard, Campaign, Currency,
                           Locale, Advanced, Admin, Image, ...)
app/Repositories/          ALL database access
app/Support/               Money (integer minor units), Fx, Slug, StoreChrome,
                           CatalogCache, CartIdentity
app/Providers/             service wiring (store settings, cache TTLs)
database/migrations/       001–020, dialect-aware, auto-registered
database/seeders/          settings, roles/permissions, currencies, translations
resources/views/           SpiderBD templates (store, account, admin, checkout, ...)
tests/                     31 suites, registered in BOTH runners
tools/, benchmarks/, deploy/, examples/, docs/
```

---

## Configuration

Copy `.env.example` to `.env` — everything is environment-driven:

| Variable | Purpose |
|---|---|
| `SPID3R_DB_DRIVER` | `sqlite` (default) · `postgres` · `mysql` · `mariadb` |
| `SPID3R_CACHE_DRIVER` | `memory` (default, per-process) · `file` · `database` (shared) |
| `APP_ENV` | `production` hardens cookies and disables debug output |
| `SPID3R_HSTS`, `SPID3R_COOKIE_SECURE` | opt-in TLS hardening |
| `SMS_DRIVER`, `SMS_SEND_URL`, `SMS_API_KEY` | SMS delivery (`log` = dev driver) |
| `{PROVIDER}_INIT_URL` / `_VERIFY_URL` / `_REFUND_URL` / `_API_KEY` / `_WEBHOOK_SECRET` | payment gateway adapters (unconfigured gateways fail fast; COD needs nothing) |

---

## Documentation

Everything lives in [`docs/ecommerce/`](docs/ecommerce/):

| Document | Contents |
|---|---|
| [developer.html](docs/ecommerce/developer.html) | **the complete developer guide** — stack, architecture, subsystems, guidelines (single-page HTML) |
| [DATABASE.md](docs/ecommerce/DATABASE.md) | 30+ tables, FKs, indexes, integer money, dialect handling |
| [BACKUP.md](docs/ecommerce/BACKUP.md) | backup & restore procedures |
| [AUTH.md](docs/ecommerce/AUTH.md) | registration, sessions, RBAC, throttling |
| [PRODUCTS.md](docs/ecommerce/PRODUCTS.md) | catalog, variants, galleries, safe uploads |
| [STOREFRONT.md](docs/ecommerce/STOREFRONT.md) | listing, filters, SEO URLs |
| [CART.md](docs/ecommerce/CART.md) | guest/auth cart, merge-on-login |
| [CHECKOUT.md](docs/ecommerce/CHECKOUT.md) | quotes, addresses, coupons, atomic placement |
| [PAYMENTS.md](docs/ecommerce/PAYMENTS.md) | COD + gateway adapters, webhooks, refunds |
| [ADMIN.md](docs/ecommerce/ADMIN.md) | dashboard, management pages, audit, export |
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
| 6–9 | Cart · checkout/orders · payments · admin dashboard | ✅ |
| 10–13 | Advanced features · shipping & delivery · security · performance | ✅ |
| 14–16 | Automated testing · CI/CD & deployment · documentation | ✅ |

All 16 phases complete. **31 test suites green** on SQLite, PostgreSQL and
MySQL; every push verified by CI on all engines plus a live-server smoke.

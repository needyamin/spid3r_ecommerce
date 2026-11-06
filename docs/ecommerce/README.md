# Spid3r Store — Documentation Index & Phase Tracker

**Project README:** [`/README.md`](../../README.md) · **Contribution guide:**
[`/CONTRIBUTING.md`](../../CONTRIBUTING.md) · **Developer guide (HTML):**
[`developer.html`](developer.html) · **API:** [`API.md`](API.md) ·
**User guide:** [`USER-GUIDE.md`](USER-GUIDE.md)

All 16 phases of `docs/task.txt` are **complete**. This file tracks the
phase history and indexes the documentation set.

---

## Phase history

| Phase | Scope | State |
|---|---|---|
| 0 | Repository audit + compatibility report | ✅ [PHASE0-AUDIT.md](PHASE0-AUDIT.md) |
| 1 | Project skeleton: bootstrap, config, routes, storefront shell, Money support | ✅ |
| 2 | Database architecture: 30+ tables (FKs, indexes, uniques, integer money), seeders, repositories, transactions, backup | ✅ [DATABASE.md](DATABASE.md) · [BACKUP.md](BACKUP.md) |
| 3 | AuthN/AuthZ: registration, login/logout, password reset, email verification, RBAC policies, login throttle | ✅ [AUTH.md](AUTH.md) |
| 4 | Product Management: CRUD, nested categories, brands, variants/SKU, image uploads, pricing/discounts, inventory, publication status, SEO | ✅ [PRODUCTS.md](PRODUCTS.md) |
| 5 | Storefront: homepage, catalog, category/brand/product pages, search/filters/sorting/pagination, related products, responsive, SEO URLs, sitemap/robots | ✅ [STOREFRONT.md](STOREFRONT.md) |
| 6 | Shopping Cart: guest/auth cart, add/update/remove, availability, server-side prices, persistence, merge-on-login, subtotal/discount/shipping | ✅ [CART.md](CART.md) |
| 7 | Checkout & Order Management: addresses, shipping/fees, coupons, tax, atomic order creation + stock deduction, confirmation/cancellation/history/status/invoice | ✅ [CHECKOUT.md](CHECKOUT.md) |
| 8 | Payment Integration: COD + config-driven bKash/Nagad/SSLCommerz/Stripe adapters, server-to-server verification, signed webhooks, idempotency, refunds, history, reconciliation | ✅ [PAYMENTS.md](PAYMENTS.md) |
| 9 | Admin Dashboard: overview, reports, full management pages/APIs, audit logs, CSV/JSON export | ✅ [ADMIN.md](ADMIN.md) |
| 10 | Advanced E-commerce Features: wishlist, verified-purchase reviews + ratings, recommendations, recently viewed, campaigns, loyalty points, referrals, gift cards, email/SMS notifications, order tracking, customer support, multi-currency, multi-language | ✅ [ADVANCED.md](ADVANCED.md) |
| 11 | Shipping & Delivery: zones, per-zone tiered rates, delivery estimates, shipment creation/tracking/status lifecycle, delivery confirmation, courier integration point, returns & exchanges | ✅ [SHIPPING.md](SHIPPING.md) |
| 12 | Security: CSP + full header set on every response, XSS/SQLi/CSRF/authorization/rate-limit/upload/error-disclosure verified by an executable suite | ✅ [SECURITY.md](SECURITY.md) |
| 13 | Performance: hot-path indexes, generation-based catalog cache, lazy images, load probe, honest runtime-capability statement | ✅ [PERFORMANCE.md](PERFORMANCE.md) |
| 14 | Automated Testing: unit suite, 35-step end-to-end customer journey (caught and fixed unwired loyalty/referral rewards) | ✅ `tests/test_store_unit.matrix` · `tests/test_store_journey.matrix` |
| 15 | CI/CD & Deployment: real-server smoke in CI, one-command Docker verification (PostgreSQL + MySQL verified against the live server) | ✅ [DEPLOYMENT.md](DEPLOYMENT.md) |
| 16 | Documentation: rewritten README, API reference, user guide, contribution guide, deployment guide, this index | ✅ you are here |

**Verification state:** 31 test suites green on SQLite, PostgreSQL and
MySQL; CI additionally runs the bytecode VM, an application-layer load
probe, benchmarks and a live-server HTTP smoke on every push.

---

## Documentation set

| Audience | Documents |
|---|---|
| **Shoppers & staff** | [USER-GUIDE.md](USER-GUIDE.md) |
| **Integrators** | [API.md](API.md) · [PAYMENTS.md](PAYMENTS.md) (webhooks) |
| **Operators** | [DEPLOYMENT.md](DEPLOYMENT.md) · [BACKUP.md](BACKUP.md) · [SECURITY.md](SECURITY.md) · [PERFORMANCE.md](PERFORMANCE.md) |
| **Developers** | [developer.html](developer.html) (single-page guide) · [DATABASE.md](DATABASE.md) · [AUTH.md](AUTH.md) · [PRODUCTS.md](PRODUCTS.md) · [STOREFRONT.md](STOREFRONT.md) · [CART.md](CART.md) · [CHECKOUT.md](CHECKOUT.md) · [ADMIN.md](ADMIN.md) · [ADVANCED.md](ADVANCED.md) · [SHIPPING.md](SHIPPING.md) · [CONTRIBUTING.md](../../CONTRIBUTING.md) |
| **History** | [PHASE0-AUDIT.md](PHASE0-AUDIT.md) · the phase-by-phase commit history on `eCommerce` |

---

## The non-negotiables (enforced by tests, not by hope)

* Money is stored as **integer minor units** — never floats.
* Inventory changes are **transactional with atomic conditional updates**.
* Payment success is **never trusted from the client** — server-to-server
  verification + idempotency.
* Order line items **snapshot historical prices**.
* Secrets live in the **environment only**.
* Every claim in these documents is checked by the test suite on every push.

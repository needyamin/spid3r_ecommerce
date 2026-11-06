# HTTP API Reference

Spid3r Store serves **server-rendered HTML first** (every page works without
JavaScript); the same controllers answer JSON when a client adds
`format=json` to a write request or calls a dedicated JSON endpoint. This
document lists every HTTP endpoint with its authentication requirement.

**Conventions**

* Auth: 🌐 public · 👤 signed-in customer · 🔑 staff role `admin` · 🛡️ named permission (e.g. `catalog.manage`).
* State-changing requests from a browser session require the per-session
  `_csrf` token (missing → `419`); a foreign `Origin` header → `403`.
* JSON success shapes: single resource `{"data": {...}}`, lists
  `{"data": [...]}`; creation returns `201`.
* Errors: `401` unauthenticated (API/JSON) · `403` forbidden · `404` not
  found · `419` CSRF · `422` validation (`{"status","message","errors":{field:msg}}`)
  · `429` throttled · `500` generic (never leaks internals).

---

## Storefront (public)

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Homepage with featured products. |
| GET | `/health` | Liveness JSON. |
| GET | `/catalog` · `/search` | Listing; query: `q`, `category`, `brand`, `min_price`, `max_price`, `sort` (`newest\|price_asc\|price_desc\|name`), `page`. |
| GET | `/category/:slug` · `/brand/:slug` | Same filters, scoped. |
| GET | `/product/:slug` | Product detail (reviews, rating, recommendations, recently viewed). |
| GET | `/sitemap.xml` · `/robots.txt` | SEO endpoints. |
| POST | `/shipping/estimate` 🌐 (throttle 30/min) | JSON delivery quote: `method`, `order_value_minor`, `country`, `district`/`city`. |
| POST | `/gift-card/balance` 🌐 (throttle 20/min) | Balance of a gift-card code. |

## Cart & checkout

| Method | Path | Auth |
|---|---|---|
| GET | `/cart` · `/cart/summary` | 🌐 (guest cart via `cart` cookie) |
| POST | `/cart/items` | 🌐 |
| POST | `/cart/items/:id/quantity` · `/cart/items/:id/remove` · DELETE `/cart/items/:id` | 🌐 |
| GET | `/checkout` · `/checkout/quote` | 🌐 — quote accepts `shipping_method`, `coupon_code`, `gift_card_code`, address fields |
| POST | `/checkout` | 🌐 — places the order (atomic); JSON returns the order number |
| GET | `/checkout/confirmation/:number` | 🌐 |
| POST | `/shipping/estimate` | 🌐 |

## Accounts & orders (customer)

| Method | Path | Auth |
|---|---|---|
| GET/POST | `/login` · `/register` · `/forgot-password` · `/reset-password` · `/logout` · `/verify-email/:token` | 🌐 (login/register throttled 5/min) |
| GET | `/account` · POST `/account/profile` | 👤 |
| POST | `/account/addresses` | 👤 |
| GET | `/orders` · `/orders/:number` · `/orders/:number/invoice` | 👤 (ownership enforced) |
| POST | `/orders/:number/cancel` | 👤 (pre-shipment only) |
| GET | `/orders/:number/payments` | 👤 |
| GET/POST | `/orders/:number/return` | 👤 (delivered orders, 14-day window) |
| GET | `/returns` | 👤 |
| GET/POST | `/wishlist` · `/wishlist/add` · `/wishlist/remove` | 👤 |
| POST | `/reviews` | 👤 (verified purchase) |
| GET | `/reviews/:product_id` | 🌐 (approved reviews + rating JSON) |
| GET | `/recommendations/:product_id` · `/recently-viewed` | 🌐 (JSON) |
| GET | `/account/rewards` · POST `/account/rewards/redeem` · POST `/account/referral` | 👤 |
| POST | `/locale` | 🌐 — stores the `store_currency` / `store_locale` cookies |
| GET/POST | `/support` | 🌐 (POST throttled 5/min) |
| GET/POST | `/track` | 🌐 — order number + account email or address phone |

## Payments

| Method | Path | Auth |
|---|---|---|
| GET | `/payment/:order_number` | 🌐 |
| POST | `/payment/initiate` | 🌐 — `order_number`, `provider` (`cod\|bkash\|nagad\|sslcommerz\|stripe`) |
| GET | `/payment/:order_number/return` | 🌐 — never trusts client-side success |
| POST | `/webhooks/payments/:provider` | 🌐 — HMAC-SHA256 over the raw body |

## Administration

Pages under `/admin/*` require the `admin` **role**; JSON APIs require the
named **permission** shown in brackets.

| Area | Endpoints | Permission |
|---|---|---|
| Catalog | GET/POST `/admin/api/products`, GET/PUT/DELETE `/admin/api/products/:id`, POST `/:id/publish` · `/:id/unpublish` | `catalog.manage` |
| Inventory | GET `/:id/inventory`, POST `/:id/inventory/restock`, GET `/:id/inventory/history`, GET `/:id/availability` | `inventory.manage` |
| Categories · brands | GET/POST `/admin/api/categories`, PUT/DELETE `/:id`; same for `/admin/api/brands` | `catalog.manage` |
| Variants · images | GET/POST `/admin/api/products/:id/variants`; GET/POST `/admin/api/products/:id/images`, DELETE `/admin/api/images/:id` | `catalog.manage` |
| Orders | GET `/admin/api/orders`, PUT `/admin/api/orders/:id/status` | `orders.manage` |
| Payments | POST `/admin/api/payments/:id/verify` · `/:id/refund`, GET `/admin/api/payments/reconciliation` | `payments.manage` |
| Customers | GET `/admin/api/customers`, POST `/:id/status` | `customers.manage` |
| Staff · roles | GET/POST `/admin/api/staff/role`, GET `/admin/api/roles`, POST `/:id/permissions` | `staff.manage` |
| Coupons | GET/POST `/admin/api/coupons`, PUT/DELETE `/:id` | `catalog.manage` |
| Settings | GET/PUT/POST `/admin/api/settings` | `settings.manage` |
| Audit · reports | GET `/admin/api/audit`; GET `/admin/reports`, GET `/admin/reports/export` (`csv\|json`) | `reports.view` |
| Reviews | GET `/admin/reviews` (role admin), POST `/admin/reviews/:id` (`approved\|rejected`) | `catalog.manage` |
| Campaigns | GET/POST `/admin/api/campaigns` | `catalog.manage` |
| Currencies · translations | GET/POST `/admin/api/currencies` · `/admin/api/translations` | `settings.manage` |
| Gift cards | GET/POST `/admin/api/gift-cards` (POST issues; the raw code is returned once) | `settings.manage` |
| Support | GET `/admin/api/support-tickets`, POST `/:id` (`open\|resolved\|closed`) | `customers.manage` |
| Shipping | GET/POST `/admin/api/shipping/zones`, POST `/:id/deactivate`; GET/POST `/admin/api/shipping/rates`, POST `/:id/deactivate` | `settings.manage` |
| Fulfilment | GET/POST `/admin/api/orders/:order_id/shipments`, POST `/admin/api/shipments/:id/status` (`preparing\|shipped\|in_transit\|delivered\|failed`), POST `/:id/deliver` | `orders.manage` |
| Returns | GET `/admin/api/returns`, POST `/admin/api/returns/:id` (`approved\|rejected\|received\|refunded`) | `orders.manage` |

---

## Money conventions

Every amount in a request or response is an **integer number of minor units**
(`5000` = 50.00 in a 2-decimal currency) — floats are never used. Display
strings (`*_display`) are server-formatted in the transaction currency.

## Further reading

* [USER-GUIDE.md](USER-GUIDE.md) — what each feature does for shoppers and staff.
* [SECURITY.md](SECURITY.md) — auth, CSRF, headers, rate limits.
* [DEPLOYMENT.md](DEPLOYMENT.md) — verification and deployment.

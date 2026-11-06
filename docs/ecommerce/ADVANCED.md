# Phase 10 — Advanced E-commerce Features

Wishlist, product reviews and ratings, recommendations, recently viewed,
coupons & promotional campaigns, loyalty points, referrals, gift cards,
email/SMS notifications, order tracking, customer support, multi-currency
and multi-language.

**Deliverable:** advanced e-commerce functionality — complete, tested, and
wired into the real checkout flow (not a parallel, decorative path).

---

## Feature map

| Capability | Where | Notes |
|---|---|---|
| Wishlist | `app/Services/AdvancedStoreService.matrix` | Signed-in customers only; a product can appear once. |
| Product reviews | `app/Services/AdvancedStoreService.matrix` | Verified purchase only; one review per product per customer; moderated. |
| Product ratings | same | Average + per-star breakdown, integer-scaled (no floats). |
| Recommendations | same | Same category, current product excluded. |
| Recently viewed | same | Per anonymous session, capped at 20, server-side (no JS). |
| Promotional campaigns | `app/Services/CampaignService.matrix` | Time-boxed, usage-capped; applied at checkout. |
| Loyalty points | `app/Services/AdvancedStoreService.matrix` | 1 point per 100 minor units of a settled order; ledger + balance. |
| Referral system | same | One code per customer; both sides rewarded after settlement. |
| Gift cards | `app/Services/GiftCardService.matrix` | Raw code shown once, only a SHA-256 hash is stored. |
| Email notifications | `routes/queue.matrix` | `store.order_confirmation`, `store.support_ticket`. |
| SMS notifications | `app/Services/Gateway/SmsGateway.matrix` | Config-driven; fails fast when unconfigured. |
| Order tracking | `app/Services/AdvancedStoreService.matrix` | Order number **plus** proof of identity. |
| Customer support | `app/Services/AdvancedStoreService.matrix` | Ticket queue, customer list, admin resolution. |
| Multi-currency | `app/Services/CurrencyService.matrix`, `app/Support/Fx.matrix` | Display conversion only — one canonical price list. |
| Multi-language | `app/Services/LocaleService.matrix` | Locale → namespace → key → value, with fallback chain. |

---

## Database

`database/migrations/018_advanced_features.matrix` adds:

| Table | Purpose |
|---|---|
| `recently_viewed` | `(session_key, product_id)` unique, indexed for the "most recent first" read. |
| `loyalty_ledger` | Append-only ledger: every point is earned or redeemed, with a reason. |
| `referrals` | One row per referrer; `referred_user_id` is unique (one referral per customer). |
| `gift_cards` | `code_hash` (SHA-256, unique), `initial_minor`, `balance_minor`, `status`. |
| `gift_card_transactions` | Issue/redeem ledger; a redemption can be linked to an order. |
| `support_tickets` | Customer support queue with status and priority. |
| `campaigns` | Time-boxed discounts: percent (bps) or fixed, minimum order, usage cap. |
| `translations` | `(locale, namespace, translation_key)` unique. |
| `currencies` | Display currencies with `rate_to_base_bps` and `minor_digits`. |

`wishlists` and `reviews` already existed from Phase 2 — migration 018 does
not recreate them.

---

## Rules that are never broken

### Money
Every amount is an **integer number of minor units**. A gift card worth
"100.00" is `10000`, never `100.0`. Conversions use integer arithmetic
throughout (`app/Support/Fx.matrix`): major units are scaled by 10⁴ so every
step stays integral, and only the final step rounds.

### Secrets
A gift-card code is shown to the purchaser **exactly once**. The database
stores only `sha256(code)` — a database leak cannot yield a usable card.
The same rule already applies to password-reset and email-verification
tokens (Phase 3).

### Concurrency
Redemption uses an **atomic conditional decrement**
(`WHERE balance_minor >= amount`). If two checkouts race, the second one
changes zero rows and applies nothing — the balance can never go negative.

### Verified purchases
A review requires an order line belonging to the customer whose order is
`paid` or `delivered`. Reviews start as `pending` and are invisible to
shoppers until an administrator approves them.

### Order tracking privacy
Looking up an order needs the order number **and** proof of identity: the
account email, or the phone number captured on the shipping address. The
signed-in owner always sees their own orders. A wrong proof returns 404
(not 403) so the endpoint cannot be used to probe for order numbers.

### Loyalty
Points are awarded **once per order** — the ledger has a uniqueness check, so
a replayed payment callback cannot mint points twice.

---

## Gift cards and checkout

Gift cards are a real discount path, not a stored balance:

```
quote()      gift_card_value(code, still_payable)   → preview, no mutation
place_order  gift_cards.redeem(code, amount, order)  → inside the order transaction
```

The redemption happens **inside** the order transaction. If the balance can no
longer cover the quoted discount, the whole order is rolled back (no order,
no stock movement, no coupon usage) and the customer is asked to retry — they
are never charged more than the quote they accepted.

Discount stacking order at checkout:

```
volume discount → coupon → campaign → gift card → tax → shipping
```

The most valuable incentive is applied last, and no discount can ever exceed
the subtotal.

---

## Multi-currency

The store keeps **one canonical price list**: integer minor units in the base
currency (`store.currency`, default BDT). Alternate currencies are *display*
currencies derived from `rate_to_base_bps` (basis points of base currency per
one major unit of that currency).

* The customer's choice lives in the `store_currency` cookie.
* An unknown or inactive code silently falls back to the base currency — a
  tampered cookie can never produce a nonsense price.
* Price **filters** are entered in the display currency and converted back to
  the base currency before the query, so filtering stays correct.
* The cart, checkout, orders and payments remain in the **base** currency,
  because that is the amount actually recorded and billed. The footer states
  both: *"Prices in USD · Billed in BDT"*.

Example (base BDT, USD rate 12100 bps → 1 USD = 1.21 BDT):

```
100000 minor BDT  →  82645 minor USD  →  "$826.45"
82645 minor USD   →  100000 minor BDT
```

---

## Multi-language

Translations live in `translations` as `(locale, namespace, key, value)`.
Lookup order:

```
requested locale → default locale → supplied fallback → the key itself
```

A missing translation therefore degrades to readable English, never to an
empty string. The customer's choice lives in the `store_locale` cookie;
`?lang=` also works for shareable links. The store ships English and Bengali
(`bn`) navigation strings.

---

## Notifications

| Job | Trigger |
|---|---|
| `store.order_confirmation` | Order placed — emailed with the order number. |
| `store.support_ticket` | Support ticket opened — acknowledgement to the customer. |
| `store.sms_notification` | Any SMS (phone order updates, campaigns). |

All of them are **queued**, never inline: the request path never depends on
an SMTP or carrier round trip.

The SMS gateway is config-driven:

| Variable | Meaning |
|---|---|
| `SMS_DRIVER` | `log` (development: writes to the application log) or `http`. |
| `SMS_SEND_URL` | Provider endpoint (required for `http`). |
| `SMS_API_KEY` | Provider credential (required for `http`). |
| `SMS_SENDER_ID` | Sender identifier shown to the customer. |

An unconfigured gateway **fails fast** with a 400 — it never reports a
message as sent when it was not.

---

## Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/wishlist` | customer | Wishlist page. |
| POST | `/wishlist/add` · `/wishlist/remove` | customer | Add / remove a product. |
| POST | `/reviews` | customer | Submit a review (verified purchase). |
| GET | `/reviews/:product_id` | public | Approved reviews + rating summary (JSON). |
| GET | `/recommendations/:product_id` | public | Same-category recommendations (JSON). |
| GET | `/recently-viewed` | public | Recently viewed products (JSON). |
| GET | `/account/rewards` | customer | Loyalty balance, history, referral code. |
| POST | `/account/rewards/redeem` | customer | Redeem points. |
| POST | `/account/referral` | customer | Apply a referral code. |
| POST | `/gift-card/balance` | public | Balance of a gift-card code. |
| GET · POST | `/support` | public | Support form and ticket submission. |
| GET · POST | `/track` | public | Order tracking lookup. |
| POST | `/locale` | public | Store the currency / language preference. |
| GET | `/admin/reviews` | admin | Review moderation queue. |
| POST | `/admin/reviews/:id` | `catalog.manage` | Approve or reject a review. |
| GET · POST | `/admin/api/campaigns` | `catalog.manage` | Campaign list / save. |
| GET · POST | `/admin/api/currencies` | `settings.manage` | Currency list / save. |
| GET · POST | `/admin/api/translations` | `settings.manage` | Translation bundle / save. |
| GET · POST | `/admin/api/gift-cards` | `settings.manage` | Gift-card list / issue. |
| GET · POST | `/admin/api/support-tickets` | `customers.manage` | Ticket list / resolve. |

JSON clients add `format=json`; browsers keep working with plain forms
(progressive enhancement — no JavaScript required). Every state-changing
route is CSRF-protected for signed-in customers.

---

## Tests

`tests/test_store_advanced.matrix` — 13 checks:

| Test | Verifies |
|---|---|
| `test_wishlist` | Add, duplicate is a no-op, list, remove, authentication required. |
| `test_reviews` | Purchase required, one per product, rating range, pending hidden, moderation, admin-only, rating summary. |
| `test_recommendations` | Same category only, current product excluded. |
| `test_recently_viewed` | Tracking, most-recent-first order, 20-entry cap. |
| `test_loyalty` | Award from the order total, idempotency, redemption, insufficient balance refused. |
| `test_referrals` | Stable code, self-referral refused, code applied, both sides rewarded once. |
| `test_gift_cards` | Hash-only storage, balance, partial redemption, exhaustion, unknown code refused. |
| `test_gift_card_checkout` | Gift card as a real discount, order persistence, ledger link, balance spent. |
| `test_campaigns` | Inactive ignored, activation, percentage discount, reaches the quote, expiry ignored. |
| `test_support` | Ticket creation, validation, customer list, admin resolution. |
| `test_tracking` | Lookup with proof, wrong proof refused, unknown order refused. |
| `test_currency` | Integer conversion, round-trip, formatting, tampered cookie, filter conversion. |
| `test_locale` | Translation lookup, fallback chain, rendered navigation, rejected language. |

The suite is registered in **both** `tests/run_all.matrix` and
`framework/Console/TestRunner.matrix`.

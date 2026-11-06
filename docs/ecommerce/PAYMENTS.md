# Spid3r Store — Payment Integration (Phase 8)

## Delivered

| Requirement | Implementation |
|---|---|
| Payment methods | `cod` (fully wired), `bkash`, `nagad`, `sslcommerz`, `stripe` (config-driven HTTPS adapters) |
| Initiation | `POST /payment/initiate` → one `payments` row per order+provider (`idempotency_key`), adapter call, redirect to gateway |
| Server-to-server verification | `POST /admin/api/payments/:id/verify` (permission `payments.manage`) — re-queries the gateway, checks status **and exact amount** before settling; COD is confirmed by an authenticated staff action |
| Transaction tracking | `payments.gateway_transaction_id`, `payload_json`, `verified_at`, `status` |
| Status management | `initiated → pending / pending_cod → paid → refunded` (+ `failed` handling via typed 400s) |
| Gateway callbacks | `GET /payment/:order_number/return` — display only, **never** proof of payment |
| Webhooks | `POST /webhooks/payments/:provider` — HMAC-SHA256 over the RAW body, then amount/provider/status checks, **then a second server-to-server verification** |
| Duplicate callback protection | status-guarded `mark_verified` + unique `idempotency_key` + `already_initiated` guard (never calls a gateway twice for one payment) |
| Failure handling | gateway HTTP errors / non-2xx / invalid JSON / amount mismatch → typed 400; invalid signature → 401; nothing is settled |
| Refunds | `POST /admin/api/payments/:id/refund` → adapter refund, `refunds` ledger row, payment + order set to `refunded` (stock returned), duplicate refunds are no-ops |
| Payment history | `GET /orders/:number/payments` (owner) + admin reconciliation |
| Reconciliation | `GET /admin/api/payments/reconciliation` — detects paid payments with missing orders, amount mismatches, or unsettled order statuses |
| Never store raw card data | no card fields exist anywhere; gateways receive only order id, amount, currency, idempotency key |

## Gateway configuration

Upstream gateway APIs differ per merchant contract, so the HTTPS adapter is **config-driven** — no invented upstream endpoints or fake successes. Set per provider in the environment (`.env.example` documents them):

```
{PROVIDER}_INIT_URL       POST { order_number, amount_minor, currency, payment_id,
                                 idempotency_key, callback_url }
                          → { redirect_url, transaction_id }
{PROVIDER}_VERIFY_URL     POST { payment_id, idempotency_key, gateway_transaction_id }
                          → { status: "paid"|"success"|"completed", amount_minor, transaction_id }
{PROVIDER}_REFUND_URL     POST { payment_id, amount_minor, gateway_transaction_id }
                          → { status: "ok", refund_id }
{PROVIDER}_API_KEY        Bearer token (server-side only)
{PROVIDER}_WEBHOOK_SECRET HMAC key (env always overrides the seeded dev value)
COD_WEBHOOK_SECRET        optional; COD works out of the box
STORE_URL                 public base URL for webhook callbacks / sitemap
```

`{PROVIDER}` = `BKASH | NAGAD | SSLCOMMERZ | STRIPE`. **An unconfigured gateway fails fast with 400** — it never pretends to process a payment. The seeded `payments.webhook_secret` is a DEV-ONLY value; production must override it via env. All calls use the runtime's real `http_fetch`; signatures use the native `hmac_sha256`.

## Architecture

```
routes/payments.matrix                    registration + permission gates
app/Controllers/PaymentController         HTTP in/out, raw webhook body
app/Services/PaymentService               orchestration (isolated from orders)
app/Services/Gateway/PaymentGateway       CodGateway + HttpsGateway + Registry
app/Repositories/PaymentRepository        ALL payment queries, status-guarded settlement
app/Services/OrderService                 reused to settle/release stock on paid/refunded
resources/views/payment/*.bd.html
```

## Verification

`tests/test_store_payment.matrix` — 5 HTTP-level cases without external network: COD initiation + idempotency + untrusted return page, admin verification (with 401 for anonymous, duplicate no-op), signed webhooks (bad/missing signature 401, valid settles, duplicate no-op, provider mismatch rejected), refunds (+ duplicate no-op), and reconciliation mismatch detection. Registered in both runner lists and the CI VM leg.

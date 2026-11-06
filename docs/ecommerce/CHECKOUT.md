# Spid3r Store — Checkout & Order Management (Phase 7)

## Delivered

| Requirement | Implementation |
|---|---|
| Checkout page | `GET /checkout` — cart lines, address form, shipping/coupon selection, live totals |
| Address selection | saved addresses for signed-in customers (`address_id`), inline address for guests |
| Address creation | `POST /account/addresses` (auth, validated, saved to `addresses`) |
| Shipping method / fee | `standard` (flat fee, free above `shipping.free_threshold_minor`) and `express` (`shipping.express_minor`) — whitelisted server-side |
| Coupon validation | `CouponService` re-checks code, active flag, start/end dates, usage cap, minimum order, and computes fixed or basis-point discounts server-side |
| Tax calculation | `store.tax_rate_bps` applied to `subtotal − discounts` (integer minor units) |
| Order summary | `GET /checkout/quote` (JSON) + the checkout page — volume discount + coupon discount + shipping + tax + total |
| Order creation | `POST /checkout` — **one transaction** covering everything below |
| Inventory deduction | `InventoryRepository.reserve` atomic conditional decrement per line; failure rolls back the entire order |
| Order confirmation | `GET /checkout/confirmation/{order_number}` |
| Cancellation | `POST /orders/{number}/cancel` — returns stock, closes order (not allowed after packed/shipped/delivered) |
| Order history / details | `GET /orders`, `GET /orders/{number}` (ownership enforced) |
| Status management | `PUT /admin/api/orders/:id/status` (`permission:orders.manage`), whitelist of the nine statuses below; shipping creates a tracking row, cancel/refund releases stock once |
| Invoice | `GET /orders/{number}/invoice` — printable HTML invoice with immutable line snapshots and totals |
| Order statuses | `pending`, `awaiting_payment`, `paid`, `processing`, `packed`, `shipped`, `delivered`, `cancelled`, `refunded` |

## The atomic order transaction

```
quote (fresh DB prices, availability, coupon, shipping, tax)
  → resolve address (saved or inline, validated)
  → per line: atomic stock decrement + stock_movements row
  → orders + order_items (immutable name/SKU/price snapshots)
  → coupon_usages + coupons.uses++
  → clear cart_items
```

A failure at **any** step rolls everything back. The cart is emptied inside the same transaction, so a double submit cannot create a second order. `order_items` snapshot prices so later catalog edits never mutate history. Payment logic stays completely out of this phase (Phase 8).

## Architecture

```
routes/checkout.matrix                     registration + gates
app/Controllers/{Checkout,Order}Controller HTTP in/out
app/Validators/CheckoutValidators           rule maps
app/Services/{Checkout,Coupon,Order}Service business logic (no req objects)
app/Repositories/{Order,Checkout,Cart,Inventory}  ALL queries
app/Support/CartIdentity                   shared cookie→identity extraction
resources/views/{checkout,orders}/*.bd.html
```

`OrderRepository` was extended to compute totals with **order-level** discount and tax (`order_discount_minor` / `order_tax_minor` inputs are calculation-only, never columns) plus shipping.

## Verification

`tests/test_store_checkout.matrix` — 4 HTTP-level cases: quote math (express shipping + coupon + total) and invalid-coupon 422; atomic placement (status, snapshots, stock, movement, coupon usage, cart cleared, double-submit 422, confirmation page); authenticated order history/detail/invoice/cancel with stock return and CSRF; admin status transitions (paid→shipped creates shipment, invalid status 422, customer 403). Fixtures are cleaned best-effort in a `finally` block. Registered in both runner lists and the CI VM leg.

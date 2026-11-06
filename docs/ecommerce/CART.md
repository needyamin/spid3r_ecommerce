# Spid3r Store — Shopping Cart (Phase 6)

## Delivered

| Requirement | Implementation |
|---|---|
| Guest cart | `cart` cookie (30 days) with CSPRNG key; cart row keyed by `session_key` with `user_id IS NULL` |
| Authenticated cart | cart row keyed by `user_id`; `req.auth` identifies the owner server-side |
| Add / update / remove | `POST /cart/items`, `PUT|POST /cart/items/:id`, `DELETE|POST /cart/items/:id` (POST equivalents keep plain HTML forms working) |
| Availability validation | product must be published; inventory `quantity >= qty` (including existing lines); qty 1–99; failures → 422 |
| Server-side prices | every add stores the **current DB price**, and every summary **recalculates from the catalog** — client prices are never trusted |
| Persistence | cart rows survive requests/sessions; cookie keeps the key for 30 days |
| Merge on login | `AuthController.login` → `CartService.merge_on_login` → `CartRepository.merge_guest_into_user` in one transaction; guest cart deleted afterwards |
| Subtotal | Σ fresh `price_minor × quantity` (integer minor units) |
| Discounts | configurable volume discount: `cart.discount_threshold_minor` + `cart.discount_bps` settings (default 5% from 1000.00) |
| Shipping estimate | `shipping.flat_minor` fee, waived when `subtotal − discount ≥ shipping.free_threshold_minor` |

## Routes

```
GET  /cart                         HTML cart page
GET  /cart/summary                 JSON snapshot (for AJAX / Phase 7 checkout)
POST /cart/items                   add (product_id, variant_id?, quantity)
PUT  /cart/items/:id               set quantity; POST /cart/items/:id/quantity for forms
DELETE /cart/items/:id             remove; POST /cart/items/:id/remove for forms
```

`format=json` returns a JSON ack; otherwise a redirect back to `/cart`. Authenticated mutations require the per-session `_csrf` token (forms include it automatically).

## Architecture

```
routes/cart.matrix                   registration only
app/Controllers/CartController       cookie identity + HTTP in/out
app/Services/CartService             ALL business logic (plain identity map, no req)
app/Repositories/CartRepository      ALL queries
app/Repositories/{Product,Inventory} catalog/stock lookups
resources/views/cart/index.bd.html   SpiderBD view
```

**Fixes in this phase:** guest lookups now require `user_id IS NULL` (a merged user cart can share the same cookie key), and the guest cart picked up by merge must also have `user_id IS NULL`. Configurable discount/shipping settings were added to the idempotent seeder.

## Verification

`tests/test_store_cart.matrix` — 5 HTTP-level cases: guest cart lifecycle (cookie, add, update, remove), server-side price recalculation after a catalog price change, availability warnings + 422 on out-of-stock/oversized adds, persistent cart row + discount/shipping math, and guest→user merge on login with CSRF enforcement. Fixtures are purged and cleaned in a `finally` block. Registered in both runner lists and the CI VM leg.

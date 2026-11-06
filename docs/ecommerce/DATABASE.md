# Spid3r Store — Database Architecture (Phase 2)

**Primary database:** PostgreSQL. All DDL goes through the dialect-aware `Schema` builder, so the identical migrations also run on SQLite (local dev + CI) and MySQL/MariaDB (CI matrix). PostgreSQL runtime client speaks **md5/trust auth** — set `password_encryption = 'md5'` for the app role in production.

## Money rule (non-negotiable)

Every `*_minor` column is an **integer in the smallest currency unit** (poisha for BDT, cents for USD). No floats, no DECIMAL columns in SQLite. `app/Support/Money.matrix` converts at the UI edge only. `app/Support/Money` is imported with `as Money` so `Money.to_minor(...)` works.

## Tables (25 store tables + framework `users`/`sessions`/`jobs`/`migrations`/`cache`)

| Group | Tables | Notes |
|---|---|---|
| Identity (010) | `roles`, `permissions`, `user_roles`, `role_permissions`, `addresses` | `users` extended with phone/status/email_verified_at/last_login_at/loyalty_points via ALTER; RBAC pivots have composite UNIQUE |
| Catalog (011) | `categories` (nested via self-FK `parent_id`), `brands`, `products`, `product_variants`, `product_images` | unique slugs/SKUs, SEO meta fields, `price_minor`, `compare_at_minor`, `status`, indexes on category/brand/status |
| Inventory (012) | `inventory`, `stock_movements` | composite UNIQUE (product, variant), atomic conditional stock updates, full movement ledger |
| Cart (013) | `carts`, `cart_items`, `wishlists` | guest carts keyed by `session_key`; cart item composite UNIQUE; wishlist composite UNIQUE |
| Orders (014) | `orders`, `order_items`, `payments`, `refunds`, `shipments` | `order_number` + `idempotency_key` UNIQUE; order_items snapshot name/SKU/price (history never mutates); payments isolated from orders |
| Marketing (015) | `coupons`, `coupon_usages`, `reviews` | coupon usage UNIQUE (coupon, order); review UNIQUE (product, user) |
| System (016) | `audit_logs`, `settings` | `setting_key` UNIQUE; audit indexes on entity/action |

Portability note: avoided reserved SQL identifiers (`group` → `setting_group`, `key` → `setting_key`).

## Constraints & indexes

- **Foreign keys** on every relationship, with explicit `ON DELETE / ON UPDATE` actions (CASCADE for owned rows, RESTRICT for financial history, SET NULL for optional links).
- **Indexes** on all high-traffic lookups: slug, SKU, category/brand, status, user+status, order/payment linkage, tracking, audit entity.
- **Composite UNIQUE** for pivots, cart items, wishlists, inventory variants, coupon usages, reviews.
- All of the above are produced by the extended framework `Schema` builder (`foreign()`, `unique_columns()`, `index()`, `bigint()`, `decimal()`) — added on this branch, additive to the existing API.

## Transactions & correctness

| Operation | Guarantee |
|---|---|
| Inventory reservation | single atomic `UPDATE ... WHERE quantity >= ?` via conditional `decrement()`; `changes == 0` → out of stock, nothing written; movement row in same transaction |
| Order creation | order + all items + totals computed in ONE `DB.transaction`; `order_items` snapshots immutable prices |
| Payment verification | status-guarded transition + UNIQUE `idempotency_key`; replayed callbacks are no-ops |
| Cart merge (login) | guest items merged into user cart, guest cart deleted, one transaction |
| Seeders | every row existence-checked → `db:seed` is idempotent |

## Repositories (all DB access lives here)

`app/Repositories/`: `ProductRepository` (search/filter/sort/paginate), `InventoryRepository` (available/reserve/release/restock/movements), `CartRepository` (cart_for/items/upsert/merge), `OrderRepository` (create/find/items/for_user/set_status), `PaymentRepository` (initiate/mark_verified/for_order), `UserRepository` (customers + RBAC lookups). `app/Support/DbErrors.matrix` logs real DB errors server-side and returns sanitized 500s — no SQL/schema leakage.

## Backup

See [BACKUP.md](BACKUP.md) and `tools/backup_store.matrix` — portable JSON dump through the DB facade (no engine-specific binaries), write-and-verify, conservative restore into empty tables only.

## Verification

`tests/test_store_schema.matrix` — 11 integration tests: all 25 tables exist, seeder idempotency, UNIQUE enforcement, product repository filters, atomic inventory (including oversell refusal), order snapshots/totals, payment idempotency, cart upsert/merge, RBAC, backup dump/verify, money conversion. Run with `spid3r magic test` (18 suites on this branch).

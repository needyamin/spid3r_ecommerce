# Spid3r Store — Admin Dashboard (Phase 9)

## Delivered

| Requirement | Implementation |
|---|---|
| Admin authentication | `role:admin` on all pages; APIs additionally gated by seeded permissions |
| Dashboard overview | `GET /admin/` and `/admin/dashboard` — revenue from **settled** orders, order/customer/product counts, awaiting-payment, low-stock, recent orders |
| Sales statistics / revenue | `AdminService.dashboard()` + `/admin/reports` page; settled statuses only (cancelled/refunded/pending excluded) |
| Order management | `/admin/orders` page + Phase 7 `/admin/api/orders` and status endpoint |
| Product / category / brand / inventory | `/admin/products`, `/admin/categories`, `/admin/brands`, `/admin/inventory` pages + Phase 4 admin APIs |
| Customer management | `/admin/customers`, `GET /admin/api/customers?q=`, `POST /admin/api/customers/:id/status` (active/suspended, audited) |
| Staff management | `/admin/staff`, `GET /admin/api/staff`, `POST /admin/api/staff/role` (assign staff/admin) |
| Role management | `/admin/roles`, `GET /admin/api/roles` (roles + permissions), `POST /admin/api/roles/:id/permissions` (grant/revoke) |
| Coupon management | `/admin/coupons` with creation form + full `GET/POST/PUT/DELETE /admin/api/coupons` (code uniqueness, type/value validation, used coupons cannot be deleted) |
| Shipping / payment config | `/admin/shipping`, `/admin/payments` — settings filtered by group |
| Store settings | `/admin/settings` with update form + `GET/PUT|POST /admin/api/settings` (upsert by key, audited) |
| Audit logs | `AdminService.log()` records every customer-status, staff-role, role-permission, coupon and settings mutation; `/admin/audit` + `GET /admin/api/audit` |
| Report export | `GET /admin/reports/export?format=csv` (downloadable `text/csv`) and `?format=json` — settled orders with totals |

## Architecture

```
routes/admin.matrix                    page + API registration and gates
app/Controllers/AdminController        thin HTTP layer, generic table builder
app/Services/AdminService              stats, management data, audit, CSV/JSON export
app/Repositories/{Order,Catalog}       queries reused from earlier phases
resources/views/admin/*.bd.html        dashboard, generic table, reports
```

Uses the framework's REST resource envelopes, typed exceptions, CSRF tokens on all forms, and the Phase 8 `payments.manage` / `reports.view` permissions. Pages use one self-contained stylesheet (no CSS framework, no build step).

## Verification

`tests/test_store_admin.matrix` — 5 HTTP-level cases: all 14 management pages render (plus anonymous 401), customer suspension + invalid status 422 + audit entry, staff promotion + roles/permissions toggle, coupon CRUD + duplicate 422, settings upsert + listing, and CSV/JSON report export with content-type/content checks. Registered in both runner lists and the CI VM leg.

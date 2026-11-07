# Project: Spid3r E-Commerce Production Admin Panel

## Architecture
- **Language**: Spid3r 1.0.0 (`.matrix` files, Rust host runtime).
- **Framework**: `Spid3rWeb` MVC with Active Record ORM (`framework/Database/Model.matrix`), QueryBuilder, and SpiderBD template engine (`.bd.html`).
- **Database**: MySQL 8.0 running in Docker (`spid3rweb-mysql` on port 3306) with 44 relational tables.
- **Frontend Architecture**: Modern responsive Bootstrap 5.3.3 SPA backed by `public/js/admin.js`, custom styling with Daraz orange accents in `public/css/admin.css`, and embedded vector SVG icons.
- **Data Flow**: Browser Client SPA (`public/js/admin.js`) <-> REST/AJAX JSON APIs (`/admin/api/...`) & SSR fallback (`/admin/...`) <-> `AdminController` & `AdminCatalogController` <-> Active Record Models / QueryBuilder <-> MySQL Database.
- **Security**: Gated by role (`role:admin`) and granular permissions (`catalog.manage`, `customers.manage`, `settings.manage`, `reports.view`). State-changing requests enforce session CSRF validation (`_csrf`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Overview KPI Metrics | Real-time aggregated stats (revenue, order counts, customer counts, low stock alerts) | M1 | Survey |
| 2 | Overview SSR Dashboard Shell | Responsive cards, fulfillment pipeline progress bar, quick shortcuts | M1 | Survey |
| 3 | Orders Listing & Pagination | Paginated list of customer orders with totals, customer names, status badges | M1 | Survey |
| 4 | Orders Status Filter | Filter orders by lifecycle state (`pending`, `paid`, `processing`, etc.) | M1 | Survey |
| 5 | Order Detail Modal & View | Line items breakdown, snapshot SKUs, address cards, payment totals via AJAX | M1 | Survey |
| 6 | Order Status Transitions | Update fulfillment status via `/admin/api/order/:id/status` & `/admin/api/orders/:id/status` | M1 | Survey |
| 7 | Product Creation via AJAX | Create product with name, SKU, price, stock, category, brand, and SEO fields | M1 | Survey |
| 8 | Product Search & Filtering | Filter by status (`draft`, `published`, `archived`) and search by name/SKU | M1 | Survey |
| 9 | Full Product Management | Retrieve product graph: inventory, images, variants, category/brand options | M1 | Survey |
| 10 | Product In-Place Editor | Tabbed editor for product details, gallery, variants, and SEO without page reload | M1 | Survey |
| 11 | Product Featured Toggle | AJAX toggle for `is_featured` flag | M1 | Survey |
| 12 | Product Publish / Unpublish | AJAX toggle between `published` and `draft` status | M1 | Survey |
| 13 | Product Safe Deletion | AJAX deletion with confirmation modal and foreign key protection | M1 | Survey |
| 14 | Product Gallery & Primary Image | Upload base64 image, assign primary cover, reorder items, delete image via AJAX | M1 | Survey |
| 15 | Product Variants Management | Add, update, and delete product variants sharing SKU namespace | M1 | Survey |
| 16 | Category Creation Modal | Create category with parent selector and auto-generated slug | M1 | Survey |
| 17 | Category Listing & Search | Paginated category list with live search and dynamically calculated product counts | M1 | Survey |
| 18 | Category Update Modal | Edit category name and description without page reload | M1 | Survey |
| 19 | Category Safe Deletion | AJAX deletion with child subcategory and attached product protection | M1 | Survey |
| 20 | Brand Creation Modal | Create brand with name and description | M1 | Survey |
| 21 | Brand Listing & Search | Paginated brand list with live search and dynamic product count | M1 | Survey |
| 22 | Brand Update Modal | Edit brand name and description without page reload | M1 | Survey |
| 23 | Brand Safe Deletion | AJAX deletion with attached product protection | M1 | Survey |
| 24 | Inventory Stock Overview | On-hand, available, reserved, and low stock threshold calculation | M1 | Survey |
| 25 | Inventory Restock Modal | AJAX modal to add units to on-hand inventory with stock movement logging | M1 | Survey |
| 26 | Inventory Set Stock Modal | AJAX modal to set exact stock quantity and low stock threshold | M1 | Survey |
| 27 | Inventory Low Stock Filter | Filter inventory to items where `quantity <= low_stock_threshold` | M1 | Survey |
| 28 | Customer Accounts Listing | List registered customer accounts with name, email, status, registration date | M1 | Survey |
| 29 | Customer Status Transitions | AJAX modal/confirmation to suspend or activate customer accounts | M1 | Survey |
| 30 | Settings Key-Value Store | AJAX tabbed editor for General, Shipping, and Payment configuration | M1 | Survey |
| 31 | Pure AJAX Non-Reload Verification | Ensure zero full-page reloads across all CRUD actions (eliminate fallback reloads) | M1 | Survey |
| 32 | Container Synchronization | Sync host codebase modifications into running Docker container `spid3rweb-app` | M2 | Survey |
| 33 | E2E Matrix Test Verification | Run and pass `spid3r run tests/test_admin_e2e.matrix` against live container | M2 | Survey |
| 34 | Store Admin Test Verification | Run and pass `spid3r magic test --filter=store_admin` against live container | M2 | Survey |
| 35 | Full Magic Test Suite Pass | Run and pass `spid3r magic test` across all registered test suites | M2 | Survey |
| 36 | Database Schema Preservation Verification | Verify 44 tables, columns, constraints remain strictly unchanged (R3) | M3 | Survey |
| 37 | Adversarial Edge Case Verification | Verify HTTP 422 validations, uniqueness constraints, CSRF protection, RBAC gates | M3 | Survey |
| 38 | Forensic Integrity Audit | Independent static and runtime verification ensuring zero hardcoded/mock data | M3 | Survey |
| 39 | Verification & Test Reporting | Compile and deliver comprehensive, honest test report (R5) | M3 | Survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Admin UI, Modals & Pure AJAX Refinements | Refine `public/js/admin.js` to eliminate page reload fallbacks, verify dedicated modal support for all CRUD operations across all 8 modules, ensure responsive Bootstrap 5 styling and SVG icons | none | IN_PROGRESS |
| M2 | Docker Synchronization & E2E Test Suite Pass | Synchronize codebase into running Docker container `spid3rweb-app` (http://localhost:8090) and execute `spid3r run tests/test_admin_e2e.matrix` and `spid3r magic test` to verify 100% pass | M1 | PLANNED |
| M3 | Adversarial Hardening & Forensic Integrity Audit | Verify edge cases, validate schema preservation, run independent forensic auditor verification (no cheating, no mock data), compile honest test report | M2 | PLANNED |

## Interface Contracts
### Client SPA (`admin.js`) <-> Admin API (`AdminController.matrix`)
- **Headers**: `Accept: application/json`, `X-Requested-With: XMLHttpRequest` (or body `format: "json"`).
- **CSRF**: `_csrf` token required on all state-changing POST, PUT, DELETE requests.
- **Response Format**: JSON `{"data": {...}}` or `{"errors": [...]}`. HTTP 200/201 on success, 422 on validation error, 419 on CSRF mismatch, 401 on unauthenticated, 403 on unauthorized.
- **Currency Convention**: Inputs accept standard major decimal units (e.g. `350.00`), backend transforms and persists as integer minor units (`price_minor: 35000`).

## Code Layout
- `public/js/admin.js`: SPA client framework, modal controllers, AJAX event handlers.
- `public/css/admin.css`: Bootstrap 5 custom styling, card layouts, embedded SVG icons.
- `resources/views/layouts/admin.bd.html`: Admin base layout, modal host container (`#adminModal`), CSRF meta tags.
- `resources/views/admin/`: Module-specific templates (`dashboard.bd.html`, `table.bd.html`, `product.bd.html`, `order.bd.html`).
- `app/Controllers/AdminController.matrix`: Admin module routes and JSON APIs.
- `app/Controllers/AdminCatalogController.matrix`: Catalog CRUD and inventory handlers.
- `tests/test_admin_e2e.matrix`: Authoritative 8-module E2E test matrix.
- `tests/test_store_admin.matrix`: Store admin integration test suite.

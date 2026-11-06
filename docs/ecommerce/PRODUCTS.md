# Spid3r Store — Product Management (Phase 4)

## Delivered

| Requirement | Where |
|---|---|
| Product CRUD | `ProductService` (create/update/publish/delete) + `/admin/api/products` REST endpoints |
| Category CRUD / nested categories | `CategoryService` (self-referencing parent, cycle guard, full `tree()`), `/admin/api/categories` |
| Brand management | `BrandService` + `/admin/api/brands` |
| Variants / SKU | `VariantRepository` (global SKU namespace across products **and** variants), `/admin/api/products/:id/variants` |
| Image uploads / galleries | `ImageService` (base64 JSON uploads, magic-byte validation, public disk, primary image, delete) + `/admin/api/products/:id/images` |
| Descriptions, SEO metadata | `short_description`, `description`, `meta_title`, `meta_description`, auto-generated slugs via `app/Support/Slug.matrix` |
| Pricing / discount pricing | `price_minor`, `compare_at_minor` (must be > sale price), all integer minor units |
| Availability | `ProductService.availability()` = `status == published` **and** stock on hand |
| Inventory / stock movement history | `InventoryService` (restock/adjust/status/history) over the Phase 2 atomic repository |
| Publication status | `draft → published → archived` with validation; `publish`/`unpublish` endpoints |
| Authorization | every admin route gated by `permission:catalog.manage`; CSRF on all state-changing calls |

## Portability fix: boolean columns

The runtime's SQL binder rejects `bool` parameters on every engine, while the framework Schema declared PostgreSQL `BOOLEAN` — so any `is_active`/`is_primary` insert failed on PG. On this branch boolean columns are now **INTEGER/TINYINT(1) with 1/0 defaults on every dialect**, and all admin payloads normalize flags to integers. Verified on the SQLite, MySQL and PostgreSQL CI legs.

## API (all `/admin/api/...`, `permission:catalog.manage`)

```
GET|POST /products                 GET|PUT|DELETE /products/:id
POST /products/:id/publish         POST /products/:id/unpublish
GET /products/:id/availability
GET /products/:id/inventory        POST /products/:id/inventory/restock
GET /products/:id/inventory/history
GET|POST /categories               PUT|DELETE /categories/:id   (GET = nested tree)
GET|POST /brands                   PUT|DELETE /brands/:id
GET|POST /products/:id/variants
GET|POST /products/:id/images      DELETE /images/:id
```

Responses use the framework's REST resource envelopes (`{"data": ..., "meta": ...}`); failures are typed exceptions (404/422/403). Cookie-session admin clients include `_csrf` on POST/PUT/DELETE.

## Framework capability note — image uploads

The framework's `Request.parse_multipart` **intentionally skips file parts** (binary bodies are not supported by its text-mode parser). Instead of modifying the language runtime, the admin API accepts **base64-encoded image payloads in JSON**:

```json
{ "image": "iVBORw0KGgo...", "alt_text": "Front view", "is_primary": 1 }
```

Files are validated by **magic bytes** (PNG/JPEG/GIF/WEBP), capped at 2 MiB, given random names under `public/uploads/products/<id>/`, and written with the runtime's binary `write_bytes` native. Client-supplied extensions/MIME types are never trusted. This is a real, production-viable upload path for API-driven admin clients; multipart form uploads would require a language-runtime change (documented, deferred).

## Architecture

```
routes/catalog.matrix                 registration + permission gate only
app/Controllers/AdminCatalogController  HTTP in/out + validation calls
app/Validators/CatalogValidators        rule maps
app/Services/{Product,Category,Brand,Inventory,Image}  business logic
app/Repositories/{Product,Catalog,Inventory}          ALL queries
app/Support/Slug                       SEO-friendly deterministic slugs
```

Controllers contain no business logic; services never see `req`; money stays integer minor units; every product gets an inventory row at creation; deleting a product cascades its images/variants/inventory/movements in one transaction.

## Verification

`tests/test_store_catalog.matrix` — 6 HTTP-level integration cases: product CRUD + validation + SKU uniqueness + SEO + publish/availability, nested category tree + cycle guard, brand guards, variants (SKU namespace), inventory restock/history, gallery upload (valid PNG accepted, fake magic bytes rejected, file on disk, delete), and customer 403 gate. Registered in both runner lists and the CI VM leg.

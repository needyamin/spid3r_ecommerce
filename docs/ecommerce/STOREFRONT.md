# Spid3r Store — Storefront (Phase 5)

## Delivered

| Requirement | Implementation |
|---|---|
| Homepage | `GET /` — hero, trust features, **real featured products** from the DB |
| Product listing | `GET /catalog` — published products, 12 per page, image/price/compare-at |
| Category pages | `GET /category/{slug}` — nested category-aware filtering, category SEO description |
| Brand pages | `GET /brand/{slug}` — brand-scoped listing + brand description |
| Product detail | `GET /product/{slug}` — gallery, price/discount, SKU, stock badge, variants, description, related products |
| Search | `q` (name LIKE), also `GET /search` |
| Category / price / brand filters | `category` / `brand` slugs and `min_price` / `max_price` in **major units** (converted to minor units via `Money.to_minor`) |
| Sorting | `newest` (default), `price_asc`, `price_desc`, `name` — whitelisted server-side |
| Pagination | `page` + `per_page` capped at 100 by the framework; prev/next links preserve every filter via encoded query strings |
| Related products | same-category published products (excluding self), one query |
| Responsive design | single self-contained `public/css/store.css`, mobile-first grid, 44px touch targets |
| SEO URLs | `/product/{slug}`, `/category/{slug}`, `/brand/{slug}` — no raw IDs in public links |
| Meta titles/descriptions | per-page `@section('title', ...)`/`@section('meta_description', ...)`; catalog/category/brand/product all supply real descriptions |
| Sitemap / robots | `GET /sitemap.xml` (dynamic: home, catalog, all categories/brands, **published** products only), `GET /robots.txt` (disallows `/admin/`, `/account/`, login/register; points at sitemap) |

## Architecture

```
routes/storefront.matrix          registration only (static paths before :slug)
app/Controllers/StorefrontController   HTTP in/out only
app/Services/StorefrontService        filter parsing, display maps, one-query
                                      image hydration, sitemap/robots
app/Repositories/{Product,Catalog}   ALL queries
resources/views/store/*.bd.html      SpiderBD views (layout inheritance)
```

**No N+1:** listing images are hydrated with a single `whereIn(product_id, ids)` query. **No drafts leak:** every public query restricts `status = 'published'`; unknown/unpublished slugs return 404. Base URL for the sitemap comes from `STORE_URL` (defaults to `http://localhost:8000`).

## SpiderBD syntax note (verified)

Directives require `@if(cond)` / `@foreach(item in list)` — **no space** after the directive name, each on its own line. One-line sections use the two-argument form: `@section('title', product.name)`. Inline `@section("title")...@endsection` and `@if (cond)` with a space are NOT parsed and leak into the HTML. All Phase 5 views follow the verified syntax.

## Verification

`tests/test_store_storefront.matrix` — 5 HTTP-level integration cases (14 products across two categories + a brand + a draft): homepage featured products + SEO URL, catalog filters (search, price, sort, pagination, hidden drafts, gallery image), category/brand pages + 404s, product detail (meta, SKU, stock, description, related, gallery) + 404s, sitemap.xml/robots.txt content & content-type. The suite purges stale rows and cleans up in a `finally` block so aborted runs never poison later ones. Registered in both runner lists and the CI VM leg.

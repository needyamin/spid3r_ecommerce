# Spid3r Store — User Guide

How the store works for **shoppers** and for **merchant staff**. Technical
detail lives in the phase documents (see the [README](README.md) index).

---

## For shoppers

### Browsing

* **Home** shows featured products; **Catalog** lists everything with
  filtering by category, brand and price range, sorting (newest, price,
  name) and pagination.
* Every product has its own page (`/product/<slug>`) with the gallery,
  price, stock badge, options, related products and — once purchased and
  reviewed — customer reviews with an average rating.
* Prices can be viewed in **another currency** with the Currency switcher in
  the header. This changes what you *see* only: the cart, checkout and
  receipt are always in the store's base currency, which is what you are
  actually billed in (the footer states both).
* The **Language** switcher translates the store navigation (English and
  Bengali ship by default; staff can add more).
* Recently viewed products are remembered on the product page — no cookies
  beyond an anonymous identifier, no JavaScript required.

### Cart & checkout

1. **Add to cart** — works as a guest; the cart survives on your device via
   a cookie and merges into your account the moment you sign in.
2. **Apply a coupon** (if you have a code) and a **gift card** — both
   discounts are validated server-side and shown in the quote.
3. Choose **standard or express** delivery. The fee and the estimated
   delivery window come from the store's shipping zones; the estimate is
   always shown before you confirm.
4. Enter the **delivery address** (or pick a saved one). Placement is
   atomic: stock is reserved, the order and every line are snapshotted, and
   the cart is emptied in a single transaction — a double submit cannot
   create two orders.
5. **Pay** — cash on delivery (staff confirm collection) or an online
   gateway. Online payments are verified server-to-server; a "success"
   screen alone never marks an order paid.

### After the order

* **Track** any parcel at `/track` with the order number plus the account
  e-mail or the phone number used at checkout — no sign-in required.
* **Order history** (`/orders`) shows statuses, payments and a printable
  **invoice**.
* **Cancel** yourself while the order is still pre-shipment; after that,
  contact support.
* **Review** a product once your order is paid or delivered — reviews are
  checked by staff before they appear.
* **Return or exchange** within the return window (14 days by default,
  counted from delivery): pick the item, say what went wrong, and staff
  take it through approved → received → refunded. Refunds are capped at
  what you paid for the item and the stock goes back exactly once.
* **Wishlist** saves products for later.

### Rewards

* **Loyalty points**: 1 point per 100 minor units of every paid order,
  granted exactly once. Redeem them from `/account/rewards`.
* **Referrals**: share your personal `REF-…` code; when a friend's first
  order is paid, you both get points.
* **Support**: `/support` opens a ticket and e-mails you an
  acknowledgement; staff reply to that address.

---

## For merchant staff

Sign in and open `/admin` (the `admin` role unlocks everything; staff see
only what their role's permissions allow).

### Catalog

* **Products** (`/admin/products`): create with name, SKU, category, price
  and description; edit anytime (identity fields — slug/SKU — are immutable
  so old links never break); publish/unpublish; availability is
  published + stock.
* **Variants and images**: per-product SKUs and a gallery. Uploads are
  validated by file content (magic bytes), capped at 2 MiB and stored under
  random names — a renamed `.exe` cannot sneak in as a `.png`.
* **Categories** nest (a child cannot become its own ancestor); **brands**
  are flat.
* **Inventory** (`/admin/inventory`): restock or make signed corrections;
  every movement is recorded with its reason, and the listing cache is
  refreshed immediately (shoppers never see stale stock).

### Orders & fulfilment

* **Orders** (`/admin/orders`): list, inspect, and move through the status
  pipeline. Cancelling or refunding returns stock automatically.
* **Payments**: verify COD collection, issue refunds (recorded in the
  payment ledger), and check the reconciliation report.
* **Shipments**: create one or more per order (partial fulfilment) with the
  carrier and tracking number, walk them through
  `preparing → shipped → in_transit → delivered`, and confirm delivery —
  which settles the order automatically. The shipment row is the hook a
  courier integration would fill.
* **Returns** (`/admin/returns`): approve or reject, mark received, then
  refund — restocking happens with the refund.

### Pricing & promotions

* **Coupons** (`/admin/coupons`): fixed or percentage, minimum order, usage
  caps, active window.
* **Campaigns**: time-boxed store-wide promotions (percentage or fixed),
  stacked after coupons.
* **Gift cards**: issue a card and hand the customer the code — it is shown
  once and only a hash is stored. Cards are redeemed at checkout like a
  discount.

### Shipping

* **Zones** (`/admin/shipping`): match countries (and optionally a
  comma-separated district list — the most specific zone wins).
* **Rates**: per zone and method, tiered by order value, each with a
  delivery estimate. Addresses that match no zone fall back to the flat
  fee configured in Settings.

### Customers & staffing

* **Customers** (`/admin/customers`): list, review, and block/unblock.
* **Staff & roles**: create staff accounts and shape roles from individual
  permissions (catalog, orders, payments, customers, settings, reports,
  staff). Every admin mutation is written to the **audit log**
  (`/admin/audit`).
* **Reports** (`/admin/reports`): revenue and settled-order figures with
  CSV/JSON export.
* **Settings** (`/admin/settings`): store name, currency, tax, shipping
  fees, free-shipping threshold, return window.

### Content & localisation

* **Review moderation** (`/admin/reviews`): nothing goes live unapproved.
* **Currencies & translations**: manage display currencies with their
  rates, and translation strings per locale — the storefront navigation
  follows the customer's language choice.

---

## Where to look when something seems wrong

| Symptom | Explanation |
|---|---|
| "Prices in USD · Billed in BDT" in the footer | Deliberate: browsing currency is display-only, billing is the base currency. |
| A gateway is "not configured" | Gateway endpoints/keys are env-only; unconfigured gateways fail fast instead of pretending to work. COD always works. |
| A review isn't visible yet | Reviews wait for staff approval. |
| Return refused | Only delivered orders, inside the window, with a quantity you actually bought. |
| 429 response | Rate limit hit (login attempts, support form, public estimate endpoints). Wait a minute. |

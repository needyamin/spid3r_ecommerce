# Phase 11 — Shipping and Delivery

Shipping zones, per-zone delivery rates, delivery estimates, shipment
fulfilment (creation, tracking numbers, status updates, delivery
confirmation), courier integration architecture and returns/exchanges.

**Deliverable:** shipping and delivery management — wired into the real
checkout, not a parallel configuration screen.

---

## Feature map

| Capability | Where | Notes |
|---|---|---|
| Shipping zones | `app/Services/ShippingService.matrix` | Country + district list; the most specific match wins. |
| Shipping methods | same | `standard` and `express`. |
| Delivery fee configuration | same | Per zone, per method, tiered by order value. |
| Delivery estimates | same | `estimated_days_min/max` per rate; defaults for the flat fee. |
| Shipment creation | `app/Services/FulfillmentService.matrix` | Several shipments per order (partial fulfilment). |
| Tracking numbers | same | Staff-supplied courier reference, or a generated internal one. |
| Shipment status updates | same | Guarded lifecycle, illegal transitions refused. |
| Courier integration | same + `SmsGateway` | Staff-supplied carrier/tracking today; the shipment row is the integration point. |
| Delivery confirmation | same | Stamps `delivered_at` and settles the order. |
| Returns & exchanges | `app/Services/ReturnService.matrix` | Window-checked, admin-resolved, restocks on refund. |

---

## Database

`database/migrations/019_shipping_returns.matrix` adds:

| Table | Purpose |
|---|---|
| `shipping_zones` | `name`, `country`, `districts` (comma separated; empty = whole country), `is_active`. |
| `shipping_rates` | `zone_id`, `method`, value window (`min_order_minor`…`max_order_minor`), `fee_minor`, `estimated_days_min/max`, `is_active`. |
| `returns` | `order_id`, `user_id`, `order_item_id`, `quantity`, `kind` (return/exchange), `reason`, `status`, `refund_minor`, `resolved_at`. |
| `shipments` (extended) | Adds `method`, `zone_id`, `estimated_at`, `notes` to the Phase 2 table. |

---

## Zone matching

```
zone_for_address(address)
  1. skip zones whose country is set and differs from the address country
  2. a zone whose district list NAMES the address district wins immediately
  3. otherwise the first zone with an EMPTY district list (country-wide)
     is the fallback
  4. no zone at all -> the flat settings fee
```

Matching is case-insensitive. `city` is used when `district` is absent, so a
plain checkout address works without a separate district field.

### Fee resolution

```
quote(address, method, order_value)
  zone rate whose value window contains the order value  ->  zone rate
  otherwise                                              ->  flat fee
```

The flat fee is the Phase 7 behaviour, unchanged: express is a fixed setting,
standard is free above `shipping.free_threshold_minor` and otherwise
`shipping.flat_minor`. **An unconfigured store behaves exactly as it did in
Phase 7** — zones are opt-in.

Discount stacking at checkout is unchanged (volume → coupon → campaign →
gift card), and the delivery fee is computed on the discounted value.

---

## Shipment lifecycle

```
preparing ──▶ shipped ──▶ in_transit ──▶ delivered
     │            │            │
     └────────────┴────────────┴──▶ failed ──▶ shipped (retry)
```

* Illegal transitions are refused with 422 (`preparing → delivered` cannot
  skip steps).
* `shipped` stamps `shipped_at`; `delivered` stamps `delivered_at`.
* Confirming delivery also moves the **order** to `delivered` — unless the
  order is cancelled, refunded or already delivered.
* A closed order (cancelled/refunded/delivered) cannot receive a new
  shipment.
* The tracking number is the courier's reference. When staff omit it, an
  internal reference (`SP-<order>-<random>`) is generated so the store can
  still track the parcel before the courier assigns a real one.

**Courier integration architecture:** the shipment row *is* the integration
point. It carries the carrier, the courier's tracking number, the method and
the zone — so wiring a courier API later means filling those fields from the
courier's response and pushing status changes from their webhooks, with no
schema change. Customer-visible SMS updates go through the Phase 10
`store.sms_notification` queue job.

---

## Returns and exchanges

```
requested ──▶ approved ──▶ received ──▶ refunded
     │
     └──▶ rejected
```

* Only **delivered** orders belonging to the customer can be returned.
* The window (default **14 days**, setting `returns.window_days`) is measured
  from the latest shipment's `delivered_at`, or the order's `updated_at` when
  nothing was ever shipped.
* The quantity can never exceed what was bought.
* `refunded` restocks the items **exactly once** and records the refund:
  the return row stores the amount, and when a payment exists (non-COD) a
  `refunds` ledger row is created for the payment reconciliation flow. COD
  orders have no payment row — staff settle those offline.
* The refund amount defaults to the historical line value
  (`unit_price_minor × quantity`) and is **capped** there: staff may lower
  it, never raise it.
* Every state change is a guarded transition; a refunded return is terminal.

---

## Routes

| Method | Path | Gate | Purpose |
|---|---|---|---|
| GET | `/admin/shipping` | `role:admin` | Zones + rate tiers management page. |
| GET · POST | `/admin/api/shipping/zones` | `settings.manage` | Zone list / save. |
| POST | `/admin/api/shipping/zones/:id/deactivate` | `settings.manage` | Deactivate a zone. |
| GET · POST | `/admin/api/shipping/rates` | `settings.manage` | Rate list / save. |
| POST | `/admin/api/shipping/rates/:id/deactivate` | `settings.manage` | Deactivate a rate tier. |
| GET · POST | `/admin/api/orders/:order_id/shipments` | `orders.manage` | Shipment list / create. |
| POST | `/admin/api/shipments/:id/status` | `orders.manage` | Lifecycle transition. |
| POST | `/admin/api/shipments/:id/deliver` | `orders.manage` | Delivery confirmation. |
| GET | `/admin/returns` | `role:admin` | Returns queue with decisions. |
| GET · POST | `/admin/api/returns` · `/:id` | `orders.manage` | Return list / resolve. |
| GET | `/returns` | customer | The customer's own returns. |
| GET · POST | `/orders/:number/return` | customer | Request a return/exchange. |
| POST | `/shipping/estimate` | public | Read-only delivery quote (JSON). |

---

## Tests

`tests/test_store_shipping.matrix` — 4 checks:

| Test | Verifies |
|---|---|
| `test_zone_rates` | Specific zone wins, country-wide fallback, case-insensitive districts, tiered value windows, flat fallback, unknown method refused. |
| `test_checkout_zone_fee` | The checkout quote and the placed order use the zone rate, the estimate is carried, no address falls back to the flat fee, the public estimate endpoint works, a deactivated zone stops applying. |
| `test_fulfillment` | Closed orders cannot ship, tracking number stored, lifecycle guards, `shipped_at`/`delivered_at` stamps, delivery settles the order, customers are refused. |
| `test_returns` | Non-delivered refused, foreign orders invisible, request stored, guarded transitions, restock on refund, refund equals the historical line value, terminal state, window expiry. |

The suite is registered in **both** `tests/run_all.matrix` and
`framework/Console/TestRunner.matrix`, and runs in the CI bytecode-VM leg.

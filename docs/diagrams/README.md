# docs/diagrams — Architecture Diagrams (Mermaid)

All diagrams are Mermaid sources (`.mmd`). They are rendered live inside
[`../developer-docs.html`](../developer-docs.html), or you can preview any file in
the VS Code Mermaid extension / [mermaid.live](https://mermaid.live).

| File | Shows |
|------|-------|
| `architecture-overview.mmd` | Full-stack map: browser SPAs → middleware → routes → controllers → services → ORM → database |
| `request-lifecycle.mmd` | Sequence of one HTTP request through global pipeline, router, route middleware and controller |
| `mvc-orm-flow.mmd` | MVC + Active-Record data flow (QueryBuilder → DB → controller → SpiderBD view) |
| `auth-flow.mmd` | Register/login (bcrypt, sessions, throttling) and RBAC gate checks |
| `cart-checkout-flow.mmd` | Guest cart → login merge → checkout → order → stock reservation → confirmation |
| `payments-flow.mmd` | PaymentService handing off to gateways (SSLCommerz / Stripe / bKash / Nagad / simulator), callbacks, refunds |
| `admin-panel-map.mmd` | Admin modules: dashboard, catalog, inventory, orders, staff/roles, shipping, payments, coupons, audit, reports |
| `deployment.mmd` | Development (SQLite, `spid3r run`) vs production (AOT `dist/server.exe`, MySQL Docker, Caddy/nginx) |

To re-render an SVG from a source file, paste its contents into https://mermaid.live and export.

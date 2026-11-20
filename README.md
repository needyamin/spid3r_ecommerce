# Spid3r Store 🕷️

A full e-commerce platform — **storefront + admin panel** — built with the
[Spid3r](https://github.com/needyamin/spid3r_web) language and the **Spid3rWeb 1.1.1** MVC framework.

---

## ⚡ Quick Start

```bash
cp .env.example .env            # then edit DB / app settings
spid3r magic key:generate       # create APP_KEY (required)
spid3r magic migrate            # create all 44 tables
spid3r run server.matrix --port 8000
# → http://127.0.0.1:8000  (health check: /health)
```

> Tests need: `APP_ENV=testing SPID3R_PATH=. spid3r magic test`

## ✨ Features

**Storefront** — featured-product home, catalog filters, product pages with gallery &
variants, category/brand pages, guest cart that survives login (auto-merge), checkout with
shipping zones, coupons & gift cards, order tracking, invoices, returns, support tickets.

**Admin panel** — pure-AJAX SPA (zero page reloads): dashboard KPIs, product manager
(images / variants / SEO), inventory restock & low-stock alerts, order pipeline, customers,
staff & roles, coupons, shipping zones, payment gateway lab, audit log, reports.

**Payments** — SSLCommerz, Stripe, bKash, Nagad (sandbox) + a local simulator.

**Security** — bcrypt passwords, session cookies (HttpOnly / SameSite), CSRF tokens,
RBAC via `role:` / `permission:` middleware, rate-limited login, CSP & hardened headers.

**Platform** — 44 relational tables (MySQL in prod, SQLite in dev), queued e-mail/SMS
jobs, money stored in minor units (৳), audit logging.

## 🗂️ Project Structure (short)

```
framework/    Spid3rWeb 1.1.1 (Http/, Foundation/, Database/, View/, …)
app/          Controllers · Services · Repositories · Middleware · Validators
routes/       web (→ store) · api · queue + per-domain route files
resources/    SpiderBD templates (.bd.html)
public/       Bootstrap 5.3.3, admin.js & store.js SPAs, css, images
database/     migrations 001–020 (44 tables)
tests/        44 suites — unit, integration, E2E, adversarial
docs/         developer-docs.html + diagrams/ (Mermaid)
deploy/       Dockerfile, docker-compose.yml, Caddyfile, nginx.conf
```

## 📚 Documentation

- **[docs/developer-docs.html](docs/developer-docs.html)** — how the site works:
  architecture, request lifecycle, database, security, payments, testing, deployment.
- **[docs/diagrams/](docs/diagrams/)** — 8 Mermaid architecture diagrams.

## 🛠️ CLI Cheatsheet

| Command | Purpose |
|---------|---------|
| `spid3r magic serve --port 8000` | Run the app |
| `spid3r magic build` | Compile AOT binary → `dist/server.exe` |
| `spid3r magic test` | Run all test suites |
| `spid3r magic migrate` / `db:seed` | Migrate / seed the database |
| `spid3r magic key:generate` | Generate `APP_KEY` |
| `spid3r magic route:list` | List all routes |

## 🚀 Production

Set `APP_ENV=production` + MySQL credentials in `.env`, migrate, then
`spid3r magic build` and run `dist/server.exe` behind `deploy/Caddyfile` or
`deploy/nginx.conf` (or use `deploy/docker-compose.yml`).

---

*Built on [Spid3rWeb](https://github.com/needyamin/spid3r_web) — a modern MVC framework for the Spid3r programming language.*

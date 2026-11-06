# Contributing to Spid3r Store

Thanks for helping build the store. This document covers the rules that keep
the project shippable: where work happens, how code is structured, and the
testing bar every change must clear.

---

## Branch rules (non-negotiable)

* **All store work happens on the `eCommerce` branch.**
* **Never push store code to `main`** — `main` stays at the clean-framework
  state unless a framework-level correction is genuinely required.
* Push to `origin/eCommerce` only; CI runs on every push.

```bash
git checkout eCommerce
git pull origin eCommerce
# ...work, test, commit...
git push origin eCommerce
```

---

## Architecture (enforced)

Requests flow one way — do not skip layers:

```
routes/*.matrix        registration only (no logic)
app/Controllers/       HTTP in/out — validate, delegate, answer
app/Validators/        rule maps per use-case
app/Services/          business logic (the only place it lives)
app/Repositories/      ALL database access
app/Support/           pure helpers (Money, Fx, Slug, CatalogCache, ...)
resources/views/       SpiderBD templates
```

Rules that must never be broken:

1. **Money is integer minor units** — never floats, anywhere.
2. **Inventory changes are transactional with atomic conditional updates**
   (`UPDATE … WHERE quantity >= ?`).
3. **Payment success is never trusted from the client** — server-to-server
   verification, signed webhooks, idempotency keys.
4. **Secrets come from the environment only** — never from requests, never
   committed.
5. **No business logic in controllers or templates.**

### Spid3r language gotchas

These bite everyone once — learn them here instead:

* `public` (and other keywords) cannot be used as identifiers; there is no
  ternary `?:`.
* `let i` cannot be redeclared in the same function scope — reuse or rename.
* Module functions need the import alias: `CatalogCache.bump()`, not a bare
  `bump()`.
* Class symbols are not transitive across imports — import declaring
  modules explicitly.
* String literals interpolate `{var}` — never write a literal `{word}` in a
  `.matrix` string.
* `for x in list` iterates **copies** — mutate via indexed access `l[i]`.
* Order numbers embed lowercase hex — never case-fold them for lookups.

---

## Testing bar

Every change must pass, on a **fresh database** (leftovers mask bugs that
CI will catch):

```bash
rm -f database/database.sqlite*
spid3r magic migrate && spid3r magic db:seed
SPID3R_DB_DRIVER=sqlite spid3r magic test
```

Checklist before pushing:

1. **New behaviour needs a test** in the matching suite (or a new one).
2. **New suites are registered in BOTH** `tests/run_all.matrix` AND
   `framework/Console/TestRunner.matrix` (and added to the CI VM list in
   `.github/workflows/ci.yml`).
3. **Fixtures clean up after themselves**, honouring FK order:
   `coupon_usages` before `coupons`, `cart_items` before `carts`, `refunds`
   (by `payment_id`) before `payments`, child rows before their order.
4. **Performance-sensitive?** The catalog cache invalidates on every write
   that changes what shoppers see — if you add a catalog write path, call
   `CatalogCache.bump_catalog_version()` (see `app/Support/CatalogCache.matrix`).
5. **Security-sensitive?** Add the check to `tests/test_store_security.matrix`.

CI runs the suite on SQLite, PostgreSQL and MySQL plus the bytecode VM, a
load probe, benchmarks and a live-server smoke — green there is the bar, not
just green locally.

---

## Verification tools

```bash
./deploy/docker-smoke.sh           # real engine in Docker + real HTTP server (MySQL)
LOAD_ITERS=150 spid3r run tools/store_load.matrix   # application-layer load probe
spid3r magic route:list              # every registered route
```

---

## Commit style

One phase/feature per commit, imperative subject with the area and branch
tag, body explaining the *what* and the *why* (the existing history is the
reference: `git log --oneline origin/eCommerce`).

```
feat(store): Phase 11 — shipping & delivery (eCommerce)
fix(store): security suite must not assume a cache table (eCommerce)
```

---

## Documentation

User-facing behaviour changes update the matching document in
`docs/ecommerce/` (`USER-GUIDE.md` for behaviour, `API.md` for endpoints,
the phase document for internals). The README feature table should always
match reality.

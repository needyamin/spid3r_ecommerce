# AGENTS.md — standing instructions for AI sessions in this workspace

## Core framework bug policy (STANDING RULE — always apply)

This project (`spid3r_ecommerce`) vendors a copy of the Spid3rWeb core
framework under `framework/`. The canonical framework repo lives in TWO
places:

1. **Local dev repo:** `C:\Users\needyamin\OneDrive\Desktop\spid3r\spid3r_web`
   (origin: https://github.com/needyamin/spid3r_web — branch `main`)

**When working in this project, if you find or fix a bug in the core
framework (`framework/` files), you MUST apply the same fix to the local
framework repo above, not only to the vendored copy.** Both copies must stay
in sync (byte-identical `framework/` unless the project deliberately
customizes a file). Committing there is the owner's call — leave changes
uncommitted unless asked.

## Framework bugs found & fixed (log)

### 2026-11-21 — Cache `increment()` froze TTLs forever (FIXED in both copies)
- **Files:** `framework/Cache/Cache.matrix` (facade `increment`),
  `framework/Cache/CacheStore.matrix` (added `seconds_left()` to
  `FileCacheStore` + `DatabaseCacheStore`).
- **Bug:** for non-memory drivers, `Cache.increment()` did
  `put(key, next, 0)` — ttl 0 means "never expires" — so any counter seeded
  by `Cache.add(key, 0, ttl)` (e.g. the login throttle `throttle:5,60`)
  became immortal on first increment. Clients were permanently locked out
  after `max_attempts`, surviving server restarts and long silences.
- **Fix:** facade `increment()` now preserves the entry's remaining TTL via
  `store.seconds_left(key)`; stores expose remaining-seconds (0 when
  missing/expired/forever). Verified: framework `test_cache` suite passes;
  throttle entries now carry real `expires_at`.

### Known framework gap (observed, NOT yet fixed upstream)
- `framework/Auth/Hash.matrix` `check()` can only verify hashes in its own
  hex-salt argon2id format; standard PHC **base64**-salt argon2id hashes
  (produced by the Rust runtime's own hashing or external tools) always fail
  verification. This caused the demo-account login incident on 2026-11-21
  (re-hashing the rows via `tools/fix_demo_passwords.matrix` worked around
  it). A robustness upgrade for `Hash.check()` (accept PHC base64 salts) is
  a candidate upstream improvement.

### 2026-11-21 — slow startup root cause (toolchain-level, NOT a .matrix bug)
- Measured & cross-verified 4 ways: `spid3r run`/`magic serve` ≈ 21.3s,
  `spid3r compile` ≈ 21s, `spid3r exec` of precompiled bytecode ≈ **1s**,
  tiny framework skeleton ≈ 2s. Same on non-OneDrive disk (filesystem not
  the cause). ~95% of startup is `.matrix` compilation, redone per boot —
  the Rust runtime has **no persistent module-compile cache**. That lives in
  the runtime binary, not in `framework/*.matrix`, so it cannot be fixed
  from project code. Fix shipped at app level: `tools/serve_fast.sh`
  (rebuilds `dist/server.matrixc` when any `.matrix` is newer, then boots via
  `spid3r exec` ≈ 1s; `server.matrix` gained a `SPID3R_PORT` env fallback
  because `spid3r exec` cannot pass CLI args). Upstream feature request:
  hash-keyed module compile cache in the runtime.

### 2026-11-21 — security audit results (store hardening, no core changes)
- **Verified solid (no action needed):** cookies (HttpOnly + SameSite=Lax +
  Secure), HSTS handling, CSP + full security-header set, trusted-proxy
  X-Forwarded-Proto/Host handling (spoof-safe), uploads (content-sniffed,
  size-capped, PNG/JPEG/GIF/WEBP whitelist), RBAC middleware on admin
  routes, session fixation (fresh 192-bit token per login), login/register
  route throttle (5/60s).
- **CSRF layer verified working as designed:** logged-in cookie-session
  mutations without a token → 419; with token → pass; cross-origin → 403.
  Guest requests have NO session, hence no token, so their only CSRF
  defense is the pipeline's Origin check — accepted residual risk (login
  CSRF possible from no-Origin clients); mitigated below.
- **Hardening added (app-level):** global `MutationThrottle` middleware
  (registered in `bootstrap/app.matrix`; 60/min mutations, 120/min /admin,
  20/min checkout/payment/account/returns), per-email login lockout
  (10 failures / 15 min, in `AuthService`), password policy (letter+digit
  required via regex rules in `AuthValidators`), CSP fix for the payment
  simulator (inline onclick + inline script replaced with data-attributes +
  `public/js/payment_simulator.js` — inline handlers were silently dead
  under `script-src 'self'`).

## CI / deployment notes (2026-11-21)

- **Framework CI enforces a 500-line limit per .matrix file** (and fmt +
  `--deny-warnings` lint). Any framework edit must stay under 500 lines
  per file and use `let _ = self;` for unused self — the store's vendored
  copy is subject to the same rules via its own CI.
- **A UI-only commit (31be11f) reworded page copy without updating the
  test suites** and was never CI-verified; the full suite then failed on
  every leg (stale assertions: Featured products, Apply filters, SKU
  label/value, Related products, Delivery address). Lesson: UI rewordings
  must go together with test-expectation updates; run `spid3r magic test`
  on a fresh migrated+seeded DB before pushing.
- Both repos green: spid3r_web@9297b7b, spid3r_ecommerce@5a243ea+.
- Mimosa deep scan clean (0 findings) after the seeder parameterization.
- Docker deploy audited: pinned+checksummed runtime, unprivileged user,
  migrate-on-boot, .dockerignore keeps secrets/DB out; container cold boot
  compiles for ~16-21s → Dockerfile HEALTHCHECK start-period raised to
  60s to avoid restart loops.

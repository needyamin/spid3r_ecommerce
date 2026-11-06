# Phase 12 — Security Review

The security posture of the store, as verified by an executable suite
(`tests/test_store_security.matrix`) rather than by assertion. Every claim
below is checked on every CI run.

**Deliverable:** security-reviewed application.

---

## Review matrix

| Requirement | Status | Where / how |
|---|---|---|
| Input validation | ✅ | Rule maps per use-case (`app/Validators/*`) on every write path; numeric money parsing rejects garbage (see hardening below). |
| SQL injection | ✅ | ALL queries go through the QueryBuilder with bound parameters. Exactly one raw statement exists (session revocation, fully bound). Search/filter/sort inputs are identifiers/bounds, never concatenated. |
| XSS | ✅ | SpiderBD escapes `{{ }}` by default; the codebase contains **zero** `{!! !!}` raw-output sites. Stored `<script>`/`<img onerror>` payloads are entity-escaped (tested). |
| CSRF | ✅ | Layer 1: same-origin `Origin` check on all state-changing methods (foreign Origin → 403). Layer 2: per-session token required for cookie-session POSTs without an Origin header (missing/invalid → 419). |
| Secure session management | ✅ | CSPRNG `sess_` tokens (24 random bytes), DB-backed, sliding TTL, revoked on logout, `HttpOnly` + `SameSite=Lax`, `Secure` opt-in (`SPID3R_COOKIE_SECURE=1` or production). |
| Password hashing | ✅ | bcrypt via the runtime native (`Hash.make`/`Auth.attempt`). Reset and verification tokens are stored hashed and are single-use. |
| Rate limiting | ✅ | Cache-backed throttle: login/register/password-reset 5/min; support form 5/min; gift-card balance 20/min; delivery estimate 30/min. Beyond the limit → 429. |
| Authorization checks | ✅ | Every admin page is `role:admin`; every admin API is `permission:*`; customer surfaces are ownership-checked in services (orders, returns, addresses). Tested with anonymous + customer probes. |
| Secure HTTP headers | ✅ | On EVERY response (HTML, JSON, static, errors) via the framework `Response` defaults — see below. |
| File upload validation | ✅ | Magic-byte inspection only (never client MIME/extension), 2 MiB cap, random names, extension derived from content, binary-safe write. Non-image and sub-8-byte payloads are refused and store nothing (tested). |
| File type and size restrictions | ✅ | PNG / JPEG / GIF / WEBP only, 2 MiB max, per-upload. |
| Secret management | ✅ | `.env` is git-ignored; gateway/SMS credentials come from the environment only; the only seeded secret is a DEV-ONLY webhook secret that env overrides in production. |
| Audit logging | ✅ | Admin mutations (customer status, staff roles, permissions, coupons, settings) are written to `audit_logs` (Phase 9). |
| Dependency security checks | ✅ | Zero third-party runtime dependencies: the interpreter is a self-contained Rust binary and the framework composes language stdlib only — there is no dependency supply chain to audit. CI builds from source and runs the full suite on every push. |
| Error disclosure | ✅ | 500s render a GENERIC message — driver errors can never leak SQL fragments; typed exceptions render only their own message; 404s carry no paths or traces (tested). |

---

## Security headers

Set by the framework `Response` defaults, so no controller can forget them:

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `X-Permitted-Cross-Domain-Policies` | `none` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` — opt-in via `SPID3R_HSTS=1` for TLS deployments |

CSP notes:

* **`script-src 'self'` is strict** — the app ships no inline JavaScript. The
  invoice print button was moved from an inline `onclick` to
  `public/js/print.js` (progressive enhancement: without JS the customer uses
  the browser's own print action).
* `style-src` keeps `'unsafe-inline'` because the framework's standalone
  error pages must render even when no static assets are reachable. Styles
  are not an execution vector; scripts are, and those are locked down.
* `form-action 'self'` is safe because payment initiation is
  server-to-server (`http_fetch`) — the browser is only ever redirected.

## Hardening done in this phase

1. **CSP + Permissions-Policy added** to the framework response defaults —
   previously missing entirely.
2. **Three edge responses** (cross-origin 403, favicon 204, empty 200) were
   built with raw responses and therefore bypassed the defaults — they now go
   through `Response` and carry every header.
3. **`Money.to_minor` hardened**: it previously crashed on non-numeric input
   (`int('0OR1=1')` → 500). It now validates character-by-character and
   yields 0 for anything that is not recognisably an amount, so a filter
   bound to garbage simply does not apply. Found BY the new security suite.
4. **Invoice print button** de-inlined for strict `script-src`.
5. **Throttles added** to the public write-heavy endpoints (support,
   gift-card balance, delivery estimate).

## What is deliberately NOT done

* **SCRAM auth for PostgreSQL** — the runtime client speaks md5/trust
  (documented in `.env.example`); the fix belongs in the language repo.
* **Outbound SMTP with TLS** — the mail driver is `log` until the runtime
  exposes outbound TCP (documented in `.env.example` and PHASE0-AUDIT.md).
* **Multipart file uploads** — the text-mode parser skips binary parts, so
  uploads are base64-in-JSON with full server-side validation (documented in
  PRODUCTS.md). Revisit if the runtime gains binary body parsing.

## Tests

`tests/test_store_security.matrix` — 8 checks, registered in both runners
and the CI bytecode-VM leg:

| Test | Verifies |
|---|---|
| `test_security_headers` | Headers + CSP on HTML, JSON, static assets and error pages. |
| `test_cookie_flags` | `HttpOnly`/`SameSite`/`Secure` flags and opt-in HSTS. |
| `test_xss_escaping` | Stored script/event-handler payloads are entity-escaped on the product page and in listings. |
| `test_sql_injection_resistance` | Classic payloads against search, price filter and login — no error, no leak, no widened result. |
| `test_csrf_and_authorization` | 419 without token, valid token accepted, 403 for customers on admin surfaces, 401/redirect anonymous, foreign `Origin` → 403. |
| `test_rate_limiting` | 429 beyond the throttle on a public endpoint. |
| `test_upload_validation` | Non-image and undersized payloads refused; nothing stored. |
| `test_error_disclosure` | 404 pages leak no paths, exceptions or SQL. |

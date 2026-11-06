# Spid3r Store — Authentication & Authorization (Phase 3)

## What shipped

| Requirement | Implementation |
|---|---|
| Registration | `POST /register` → `AuthController.register` → `AuthService.register` → `UserRepository.create_customer` (bcrypt + customer role) |
| Login / logout | `POST /login` / `POST /logout`; session token in `spid3r_session` cookie (HttpOnly, SameSite=Lax, Secure in production) |
| Secure password hashing | `Hash.make` / `Auth.attempt` (bcrypt, framework natives) |
| Password reset | `password_resets` table: **bcrypt-hashed** single-use tokens, 1-hour expiry, reset link emailed via a queued job |
| Email verification | `email_verifications` table: hashed single-use tokens, 24-hour expiry, `users.email_verified_at` stamped on success |
| Session management | framework `AuthManager` — CSPRNG 192-bit tokens, DB-backed sessions, sliding TTL; per-request `req.auth` (no cross-connection leakage) |
| Secure cookies | `Response.cookie()` — HttpOnly + SameSite=Lax + automatic `Secure` under `APP_ENV=production` / `SPID3R_COOKIE_SECURE=1` |
| RBAC | seeded `roles`/`permissions`/`user_roles`/`role_permissions`; `AccessPolicy` + `UserRepository.has_role/has_permission` |
| Customer / staff / admin | aliases `role:customer`, `role:staff`, `role:admin`; admin inherits all permissions |
| Permission management | alias `permission:catalog.manage` (and every seeded slug) via `RequirePermissionMiddleware` |
| Account status | `users.status` (active/suspended/...); suspended accounts cannot authenticate; `AuthService.set_status` for admins |
| Login rate limiting | `throttle:5,60` on login/register/forgot POSTs (cache-backed, per client) |
| Profile update | `POST /account/profile` behind `auth` — also the CSRF reference flow |

## Routes

```
GET  /login · POST /login                 (throttle:5,60)
GET  /register · POST /register           (throttle:5,60)
POST /logout
GET  /forgot-password · POST /forgot-password
GET  /reset-password · POST /reset-password
GET  /verify-email/:token
GET  /account · POST /account/profile     (auth)
GET  /admin/ · GET /admin/catalog         (role:admin / permission:catalog.manage)
```

## Layers (per the brief)

```
routes/auth.matrix                  registration only
app/Middleware/StoreMiddleware     role/permission gates (named aliases)
app/Controllers/AuthController     HTTP in/out only
app/Validators/AuthValidators      rule maps
app/Services/AuthService           all business logic (no req objects)
app/Repositories/UserRepository    all user/role queries
app/Policies/AccessPolicy          authorization rules
```

Middleware aliases are registered by `register_store_middleware(app)` from **both** entry points (`server.matrix` and `ConsoleKernel`'s serve command) — a new `Application` needs its own alias registry.

## Security decisions

- **Tokens are never stored raw.** bcrypt hashes only; `Hash.check(raw, hash)` verifies. A DB leak cannot yield usable reset links.
- **No account enumeration.** Forgot-password always renders the same message; unknown emails simply skip the queued job.
- **Emails are queued** (`store.password_reset`, `store.email_verification` in `routes/queue.matrix`), never sent inline. The log driver records them in `storage/logs/` until runtime SMTP lands.
- **CSRF:** authenticated POSTs carry `_csrf` = `req.auth.csrf()` (per-session token). `/logout` is framework-exempt by design; `/account/profile` is the guarded reference.
- **Framework fix on this branch:** typed HTTP exceptions thrown by route middleware are now caught by `Application.handle_request` and rendered (401/403/…) instead of escaping the kernel.
- **Rate limiting:** 5 attempts/60s on login/register/forgot; keys include client identity + method + path.

## Verification

`tests/test_store_auth.matrix` — 6 integration cases: registration + validation errors + duplicate email + login/logout + cookie flags + CSRF, password reset (hashing/single-use/login with new password), email verification, account suspension + admin promotion + RBAC routes, customer 401/403 blocks, and login throttling (429). Registered in both runner lists and the CI VM leg.

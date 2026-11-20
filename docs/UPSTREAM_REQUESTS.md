# Upstream Spid3r Runtime Feature Requests

**Target Repository:** `needyamin/spid3r`  
**Observed Toolchain:** `spid3r 1.1.1`  
**Context:** Items identified while hardening and modernizing `spid3r_web` that cannot be implemented cleanly in user-space framework code without language runtime changes.

---

## 1. Dynamic Module Loading for Migration Auto-Discovery (Option D)

- **Area:** Module loader / VM / CLI runtime
- **Problem:** `import "..."` statements are resolved statically before execution, with no `load_module(path)` native. As a result, Spid3rWeb generates git-ignored `storage/framework/migrations.matrix` (Option A) and wraps function-based migrations (`public fn up()` / `public fn down()`) via aliased imports (Option C).
- **Requested Feature:**
  - Expose a sandboxed `load_module(path: string) -> Result<map, string>` native subject to `[security] basedir`, `[modules] allow_wasm` / `allow_host`, and `[modules] disable`.
  - Return exported symbols (`up`, `down`, classes) from dynamic modules when running interpreted (`tree`/`vm`), while allowing `spid3r build` AOT to continue pre-bundling static entrypoints or registered registries.
- **Payoff:** Once `load_module()` lands in Spid3r, Spid3rWeb can eliminate `storage/framework/migrations.matrix` generation entirely in favor of pure runtime discovery like Laravel.

---

## 2. PostgreSQL `SCRAM-SHA-256` & TLS Wire Client Support

- **Area:** Database stdlib (`pg_connect`)
- **Problem:** Managed PostgreSQL 14+ providers (AWS RDS, Google Cloud SQL, Neon, Supabase) default to `SCRAM-SHA-256` authentication and require TLS (`sslmode=require`). Spid3r v1.1.1's built-in `pg_connect` only supports `md5`/`trust` over unencrypted sockets.
- **Requested Feature:**
  - Add SASL `SCRAM-SHA-256` authentication exchange and `sslmode` / TLS stream negotiation to `pg_connect`.
- **Current Workaround in Spid3rWeb:** `ServerConnections.matrix` (`enhance_db_auth_error`) intercepts auth errors and prints explicit `password_encryption = 'md5'` / PgBouncer remediation steps (see `docs/DRIVERS.md`).

---

## 3. MySQL 8 `caching_sha2_password` & TLS Support

- **Area:** Database stdlib (`mysql_connect`)
- **Problem:** MySQL 8.0+ defaults to `caching_sha2_password`, and empty passwords on `root` are mishandled in `mysql_connect`. Managed MySQL clouds also mandate TLS connections.
- **Requested Feature:**
  - Add `caching_sha2_password` (RSA / TLS fast-path) negotiation, TLS socket support, and clean empty-password packet handling in `mysql_connect`.
- **Current Workaround in Spid3rWeb:** `ServerConnections.matrix` (`enhance_db_auth_error`) surfaces explicit `ALTER USER ... IDENTIFIED WITH mysql_native_password BY '...'` instructions; CI and `deploy/docker-compose.yml` configure `mysql_native_password` automatically.

---

## 4. Semantic Checker & Package Manifest Ergonomics

- **Area:** `src/semantic/mod.rs` & `src/pkg/mod.rs` (`spider.toml`)
- **Requests:**
  1. **Implicit `self` in static/interface/empty methods:** Do not emit `warning[semantic]: unused variable 'self'` for `static fn` methods (which have no runtime `self` object), empty constructors, or concrete overrides of abstract/interface contracts.
  2. **`spider.toml` `min_spid3r` manifest field:** Allow an optional `[package] min_spid3r = ">=1.1.1"` key in `spider.toml` (currently rejected by strict TOML manifest parsing; Spid3rWeb validates `MIN_SPID3R_VERSION` in `framework/Foundation/RuntimeVersion.matrix` instead).

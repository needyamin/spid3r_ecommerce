# Spid3rWeb Driver Support Matrix

**Runtime baseline:** Spid3r `v1.1.1+` · **Framework modules:** `framework/Database/{Driver,Connection,ServerConnections,ConnectionPool,DatabaseManager,Schema}.matrix` · **Config:** `config/database.matrix`

Spid3rWeb routes all database queries and migrations through the uniform `Driver` interface (`quote_identifier`, `placeholder`, `limit_sql`, `begin_sql`/`commit_sql`/`rollback_sql`, `ping`, `query`, `run`, `exec`, `statement`, `close`).

---

## 1. Engine Capabilities & Compatibility

| Capability | SQLite 3 (Default) | PostgreSQL (14–16+) | MySQL (8.0+) | MariaDB (10.6+) |
|---|---|---|---|---|
| **Env driver value** | `sqlite` | `postgres` (`postgresql`, `pg`) | `mysql` | `mariadb` (MySQL wire) |
| **Native bindings** | Dynamic `sqlite3` (`db_open`) | Native wire (`pg_connect`) | Native wire (`mysql_connect`) | Native wire (`mysql_connect`) |
| **Supported auth** | Local file permissions | `md5`, `trust` (**no SCRAM-SHA-256**) | `mysql_native_password` (**no `caching_sha2_password`**) | `mysql_native_password` (default) |
| **Empty password** | n/a | Supported under `trust` | Quirk on `root` with empty pass; always set a non-empty app password | Set a non-empty app user password |
| **TLS to DB socket** | Local file only | **Not exposed** (use localhost / WireGuard / stunnel / Docker internal network) | **Not exposed** (use private VPC / Docker internal network / stunnel) | **Not exposed** (use private VPC / Docker internal network / stunnel) |
| **Identifier quoting** | `"ident"` | `"ident"` | `` `ident` `` | `` `ident` `` |
| **Placeholder syntax** | `?` | `$1, $2, ...` | `?` | `?` |
| **Last insert ID** | `last_insert_rowid()` | `INSERT ... RETURNING id` | `SELECT LAST_INSERT_ID()` | `SELECT LAST_INSERT_ID()` |
| **Transactional DDL** | Yes (`BEGIN`/`COMMIT`) | Yes (`BEGIN`/`COMMIT`) | No (DDL implicitly commits) | No (DDL implicitly commits) |
| **1-shot reconnect** | Not applicable | Yes, outside active tx on transient disconnect | Yes, outside active tx on transient disconnect | Yes, outside active tx on transient disconnect |
| **Connection pool** | `pool_size = 1` (`ConnectionPool` mutex) | `pool_size = 4` (`ConnectionPool` mutex + `ping()`) | `pool_size = 4` (`ConnectionPool` mutex + `ping()`) | `pool_size = 4` (`ConnectionPool` mutex + `ping()`) |
| **Default timeouts** | `busy_timeout = 5000` ms | `statement_timeout = 30000` ms, `lock_timeout = 10000` ms | `max_execution_time = 30000` ms | Server session default (`30000` ms where supported) |

---

## 2. Known Upstream Driver Gaps (Action Required on Managed Clouds)

Managed database providers (AWS RDS, Google Cloud SQL, Azure Database, Neon, Supabase) default to modern auth plugins that Spid3r v1.1.1's built-in wire clients do not negotiate natively:

1. **PostgreSQL `SCRAM-SHA-256` (PG 14+ default)**
   - **Symptom:** Authentication failure mentioning SCRAM / SASL (`10`).
   - **Remediation:** Configure the database role with `md5` password encryption on private networks, or terminate SCRAM/TLS through an adjacent PgBouncer/cloud-sql-proxy on loopback:
     ```sql
     SET password_encryption = 'md5';
     ALTER USER spid3r WITH PASSWORD 'your-strong-password';
     ```
2. **MySQL 8 `caching_sha2_password` (MySQL 8.0 default)**
   - **Symptom:** Auth plugin error mentioning `caching_sha2_password` or `sha256_password`.
   - **Remediation:** Create or alter the application database user with `mysql_native_password` (see `deploy/docker-compose.yml` for an automated setup):
     ```sql
     ALTER USER 'spid3r'@'%' IDENTIFIED WITH mysql_native_password BY 'your-strong-password';
     FLUSH PRIVILEGES;
     ```
   - `ServerConnections.matrix` (`enhance_db_auth_error`) intercepts both errors at `connect()` / `magic migrate` time and appends explicit plugin remediation instructions instead of a generic socket failure.

---

## 3. SQLite Pragmas, File Placement & Windows OneDrive Warning

Default new installations place the SQLite database under `storage/database/database.sqlite` (`app.paths.state_dir = "storage"`, separating runtime state from version-controlled `database/{migrations,seeders}/`, while still honoring an existing legacy `database/database.sqlite` if present). `SqliteConnection` creates parent directories automatically.

On every open, `SqliteConnection` (`framework/Database/Connection.matrix`) applies:

- `PRAGMA journal_mode = WAL;`
- `PRAGMA synchronous = NORMAL;` (configured in `config/database.matrix`)
- `PRAGMA foreign_keys = ON;`
- `PRAGMA busy_timeout = 5000;`

### OneDrive / Network Filesystem Warning (Windows & NFS)

- SQLite `WAL` (`-wal` and `-shm`) uses shared-memory locks that can corrupt or throw `database is locked` inside **OneDrive-synced** folders or over **NFS/SMB** network shares, and synced folders can upload database state or `.env` to cloud storage.
- For Windows development or heavy local writes, keep the repository outside `OneDrive`, exclude `storage/`, or relocate runtime state (`SPID3R_STATE_DIR` / `SPID3R_DB_PATH`) outside synced paths:
  ```powershell
  $env:SPID3R_STATE_DIR = "$env:LOCALAPPDATA\Spid3rWeb"
  # or pinpoint the SQLite file directly:
  $env:SPID3R_DB_PATH = "$env:LOCALAPPDATA\Spid3rWeb\dev.sqlite"
  ```
- See [Upstream Feature Requests](UPSTREAM_REQUESTS.md) for tracked language runtime improvements (`SCRAM-SHA-256`, `caching_sha2_password`, DB TLS).
- `spid3r magic doctor` detects OneDrive workspaces automatically and emits an actionable warning.

---

## 4. Housekeeping & Multi-DB Local Testing

```bash
# Check database health & SQLite permissions
spid3r magic doctor

# Online SQLite backup (`VACUUM INTO`, with checkpoint + copy fallback)
spid3r magic db:backup [storage/backups/manual.sqlite]

# Checkpoint SQLite WAL and vacuum storage (PostgreSQL runs VACUUM)
spid3r magic db:vacuum

# Start local MySQL 8 + PostgreSQL 16 test services (ports stay internal in compose, or expose locally for test runs)
docker compose -f deploy/docker-compose.yml up -d mysql postgres
```

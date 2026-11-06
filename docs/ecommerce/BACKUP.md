# Spid3r Store — Database Backup & Recovery (Phase 2)

The store ships a **portable** backup that works on PostgreSQL, MySQL/MariaDB and SQLite because it reads through the framework `DB` facade — no `pg_dump`/`mysqldump` binary needed on the app host.

## Create a backup

```bash
SPID3R_PATH=. SPID3R_DB_DRIVER=sqlite spid3r run tools/backup_store.matrix
```

Output: `storage/backups/store-<unix>-<random>.json`. The tool writes the file, reads it back, verifies the `spid3r-store-backup-v1` header and that **all 25 store tables** are present before reporting success. A failed verification throws — it never reports a broken backup as good.

## What is captured

All 25 store tables (catalog, inventory, carts, orders, payments, reviews, settings, audit logs, RBAC). Framework housekeeping tables (`sessions`, `jobs`, `cache`, `migrations`) are excluded — they are regenerable and contain transient state.

## Production procedure

1. Put the store in maintenance mode (pause checkout workers) so no order is mid-transaction.
2. Run the backup tool from a scheduled job; copy the JSON to off-host encrypted storage with a retention policy (e.g. 30 daily + 12 monthly).
3. Monitor the exit code and file size; alert on failure.
4. For PostgreSQL, keep native WAL archiving + `pg_dump` snapshots in addition — the JSON dump is a logical application-level backup, not a substitute for PITR.

## Restore (conservative)

`restore(rel_path)` in `tools/backup_store.matrix` re-inserts rows **only into empty tables** inside a single transaction. It never overwrites existing data. To restore into a fresh database:

```bash
spid3r magic migrate       # creates all tables + framework schema
spid3r magic db:seed      # baseline roles/permissions/settings
# then restore the remaining rows from the JSON dump via a small driver
# script calling restore("backups/store-....json")
```

If any table already has rows, it is skipped (reported by the returned row count). This prevents accidental double-inserts of orders or payments.

## Security

- Backups contain customer PII and payment metadata — encrypt at rest, restrict access, never commit them to Git (`storage/` is git-ignored).
- Gateway secrets are never stored in these tables; only transaction IDs and non-sensitive payloads.

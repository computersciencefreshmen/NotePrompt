# MySQL schema lifecycle

`database/migrations/*.cjs` is the only source of truth for the MySQL schema. The application never creates tables, adds columns, or backfills data while serving a request.

## Commands

The offline plan does not open a database connection:

```powershell
npm run db:plan
```

`status` and `up` require `MYSQL_HOST`, `MYSQL_DATABASE`, and a database account. The CLI prefers `MYSQL_MIGRATION_USER` / `MYSQL_MIGRATION_PASSWORD`; `MYSQL_USER` / `MYSQL_PASSWORD` remain an explicit fallback for CI and direct runner use. `MYSQL_PORT` defaults to `3306`. The npm commands load `.env.local` when it exists, while already exported process variables take precedence.

```powershell
npm run db:status
npm run db:migrate
npm run db:status
npm run test:migrations
```

Use a dedicated migration account with schema-scoped DML plus `CREATE`, `CREATE TEMPORARY TABLES`, `ALTER`, `INDEX`, and `REFERENCES`. The long-running application account must have only `SELECT`, `INSERT`, `UPDATE`, and `DELETE`; the two usernames must differ. Neither account may be `root`.

The runner:

- discovers migrations by numeric version and records each checksum in `schema_migrations`;
- refuses changed, unknown, duplicated, or gapped migration history;
- obtains a database advisory lock before applying changes;
- never creates or selects a database and never replaces the whole schema;
- makes every migration restartable because MySQL schema statements may commit independently;
- removes a legacy plaintext `api_keys.api_key` only after all rows have a SHA-256 hash and non-secret prefix.
- migrates legacy public-folder live pointers into durable prompt snapshots; explicitly publishing again is the only operation that refreshes a published folder from its private source.
- keeps curated catalog IDs, view counters, and favorites outside the business `public_prompts` AUTO_INCREMENT domain; migration `008` moves only legacy rows proven by an integrity-checked catalog manifest and retains an audit record.

The manifest used by migration `008` is part of the migration checksum. Changing either the migration source or `008_curated_catalog_manifest.json` after deployment is rejected by `status`/`up`. Add a new migration for catalog-storage changes; never edit the applied manifest, reset `public_prompts` AUTO_INCREMENT, or classify rows by an ID range.

Run migrations as a separate release step, verify `status` shows every migration as `applied`, and only then start the application. Compose enforces this ordering with a one-shot `note-prompt-migrate` service and `service_completed_successfully` dependency.

Before every production migration, take and verify a restorable database backup, record the currently deployed image/SHA, and run `status`. Do not edit an applied migration; add a new numbered migration instead.

MySQL DDL can commit implicitly. There is intentionally no automatic `down` command: an automatic code rollback cannot prove that a partially applied schema is reversible. If `up` fails, keep the application stopped, preserve the error and database state, fix only the identified cause, and rerun the idempotent migration. Restore the verified backup only through the separately rehearsed recovery procedure when the failed change is not safely resumable.

## Empty-schema smoke test

`tests/mysql-migrations.test.cjs` always runs the offline structural checks. A real empty-schema smoke test is enabled only when `MYSQL_MIGRATION_TEST_DATABASE` is explicitly set together with the normal MySQL connection variables. The test refuses any database that already contains application tables, applies the migration set twice, and leaves the test database in place for inspection.

See [SCHEMA_DEPENDENCIES.md](./SCHEMA_DEPENDENCIES.md) for the code-to-schema inventory and known application-level mismatches.

# ADR-0001: Separate curated catalog identity from user publications

## Status

Accepted

## Context

Built-in templates expose long-lived numeric links such as `900001` and `910001`. The old implementation persisted those numbers as explicit primary keys in `public_prompts`, whose primary key also owns the AUTO_INCREMENT sequence for user publications. MySQL consequently advanced the business sequence into the curated range. A compensating `id < 900000` list filter then hid every legitimate publication allocated above that threshold.

The replacement must preserve existing template links, views, favorites, imports, and tags without treating a numeric range as provenance. It must also preserve a real user publication whose AUTO_INCREMENT ID happens to equal a curated ID. MySQL foreign-key integrity, restartable forward migrations, and a DML-only runtime account remain required.

## Decision

- `public_prompts` contains user publications only and accepts every positive AUTO_INCREMENT ID.
- `curated_catalog_entries` is the stable registry and view-counter store for built-in catalog IDs. Static template content and tags remain the reviewed application catalog.
- `curated_prompt_favorites` gives curated favorites their own foreign-key-safe relation. `user_favorites` continues to reference user publications only.
- APIs return and accept a source-qualified identity: `curated:<id>` or `published:<id>`. Numeric-only requests remain backward compatible and resolve a known curated ID to the curated source.
- Migration `008` identifies an old persisted template only when exact ID, full UTF-8 content fingerprint, `is_featured`, null category, `created_at`, and `updated_at` all match the integrity-checked catalog manifest. A genuine high-ID row that fails any condition remains untouched. Verified moves are recorded in `curated_prompt_legacy_rows`.
- The migration does not reset AUTO_INCREMENT. The migration runner includes the manifest bytes in the applied checksum, and a catalog/manifest parity test prevents drift.

## Consequences

### Positive

- Curated templates can no longer advance or occupy the user-publication primary-key sequence.
- High-ID user publications remain visible, editable, favoritable, and addressable even when a curated catalog ID has the same number.
- Favorites retain foreign keys and unambiguous contribution/statistics semantics.
- Legacy migration is conservative, restartable, auditable, and does not rely on an ID range.

### Negative

- Callers that need to address a colliding user publication must include `source=published`; updated first-party clients do this automatically.
- Favorites and aggregate statistics must intentionally combine two relations when the product metric means “all saved prompts.”
- Adding or changing curated entries requires maintaining static catalog parity and, after `008` is applied, a new migration rather than editing its manifest.

### Neutral

- Built-in content remains version-controlled application data; the database stores identity, integrity metadata, views, and user relationships rather than becoming a second content-authoring system.
- Historic AUTO_INCREMENT values may stay high. This is harmless and safer than sequence rewrites.

## Alternatives considered

**Keep fixed IDs in `public_prompts` and remove the list filter.** Rejected because the domains still collide, publication ownership is fabricated, and future inserts remain coupled to curated IDs.

**Reset AUTO_INCREMENT below the curated range.** Rejected because it can reuse existing keys, does not repair collisions, and becomes unsafe under concurrent or partially migrated production data.

**Classify every `900000+` row as curated.** Rejected because a previously advanced AUTO_INCREMENT can legitimately allocate business rows in that range.

**Use one polymorphic favorites table without foreign keys.** Rejected because resource type/ID pairs lose referential integrity and make deletion semantics weaker.

## Failure and rollback considerations

MySQL DDL commits implicitly, so `008` is a forward-only, replayable migration. Take and verify a restorable backup before applying it. If the migration stops, keep the application stopped and rerun the same migration after correcting the specific failure; its table creation, registry seed, favorite copy, audit upsert, and verified-row deletion are idempotent.

Do not roll application code back to a version that writes curated IDs into `public_prompts`. If a full data rollback is required, restore the verified pre-migration backup using the rehearsed recovery procedure. Never “roll back” by resetting AUTO_INCREMENT or by copying every curated numeric ID back into the business table.

## References

- `database/migrations/008_separate_curated_catalog.cjs`
- `database/migrations/008_curated_catalog_manifest.json`
- `database/schema-requirements.json`

# MySQL dependency and gap inventory

This inventory was derived from the SQL issued by `src/lib/mysql-database.ts`, `src/lib/auth.ts`, provider configuration, profile/admin endpoints, folder APIs, and prompt version APIs. `schema-requirements.json` is the machine-readable runtime contract.

| Domain | Required storage | Previous gap | Owning migration |
| --- | --- | --- | --- |
| Identity | `users`, including email verification fields and `session_version` | `session_version` was absent; verification columns also existed in a standalone non-idempotent script | `002` |
| Account settings | `user_preferences` with locale, theme, default editor mode, and JSON preferences | Table absent | `002` |
| API credentials | `api_keys` with `api_key_hash`, non-secret `key_prefix`, ownership, status, expiry, and last-use time | Table absent from the old schema; older deployments may contain a plaintext `api_key` | `002` hashes/verifies legacy rows, then removes the plaintext column |
| AI provider credentials | `user_provider_configs` | Previously created inside request handling | `002` |
| Private prompts | `user_prompts` plus legacy `folder_id` and canonical multi-folder links | Structured editor fields and association table absent | `003` |
| Professional editor | `editor_mode`, JSON `payload`, and `schema_version` on prompts and version snapshots | Only flattened `content` and loosely defined `mode` were stored | `003` |
| Folder membership | `user_prompt_folders` | Code queried the table although the old schema did not create it | `003`, including an ownership-checked backfill from `user_prompts.folder_id` |
| Version history | `prompt_versions` | Code queried the table although the old schema did not create it | `003` |
| Public library | Source-linked user snapshots in `public_prompts`; curated identity/metrics/favorites in `curated_catalog_entries` and `curated_prompt_favorites`; tags, public folders, imported folders, and origin-attested `public_folder_prompts` snapshots | Ordinary publications lacked stable source identity and structured snapshot fields; curated fixed IDs previously advanced the business AUTO_INCREMENT; folder publications remained live pointers; historical folder snapshots did not prove whether a user or an administrator published them | `001` creates the base library; `007` materializes folder snapshots; `008` separates curated identity; `010` adds conservative prompt provenance and lifecycle; `011` adds fail-closed folder-snapshot origin identity |
| Account lifecycle | `users.is_active`, `users.email_verified`, and `users.admin_disabled_at` | Pending verification and administrator suspension previously shared `is_active=0`, so email verification could undo a suspension | `009` introduces an explicit, fail-closed administrative suspension marker |
| AI metering | `user_usage_stats` and `ai_usage_daily` | Previously created/altered/backfilled during requests | `004` |
| Account tier | `users.user_type = free/pro/admin` | Database used `premium` while TypeScript used `pro` | `005` widens the enum, converts data, then narrows it |
| Reference data | Eight default categories | Old bootstrap was not idempotent and also inserted an insecure default administrator | `006` seeds categories only; no account is created |

## Compatibility decisions

- `user_prompts.folder_id` remains during the transition because several read paths still use it. `user_prompt_folders` is the canonical multi-folder relation, and migration `003` copies valid legacy membership into it.
- `mode` remains for existing clients. `editor_mode` is the normalized `normal/professional` value; `payload` stores structured professional-editor data; `schema_version` supports future payload evolution.
- Prompt versions snapshot the three structured editor fields as well as title and composed content.
- Legacy `premium` rows are converted to `pro`; no runtime alias is required after migration `005`.
- API keys are stored only as SHA-256 hashes and display prefixes. The migration does not create or retain a plaintext key column.
- The external API resolves callers through the canonical hashed-key verifier and writes `public_prompts.author_id`.
- Curated numeric IDs remain stable API/catalog identifiers, but are never inserted into `public_prompts`. Source-qualified references (`curated:<id>` and `published:<id>`) keep a real high-ID publication addressable even when its number collides with a curated ID. Curated views and favorites use their dedicated tables; user contribution counts continue to describe user publications only.
- Migration `008` claims an old curated row only when its exact ID, full UTF-8 content fingerprint, featured/category state, and both original timestamps match the immutable catalog manifest. It records that decision in `curated_prompt_legacy_rows`. Range checks and AUTO_INCREMENT resets are forbidden because either could hide or overwrite legitimate high-ID publications.
- Publishing a folder upserts one publication per `(user_id, original_folder_id)` and atomically replaces its `public_folder_prompts` rows. Private prompt edits, membership changes, and source deletion do not mutate or delete the published copy; `source_prompt_id` and `original_folder_id` are nullable provenance only.
- Imported-folder and public/admin folder reads use the snapshot table. They never join back through `original_folder_id` to render mutable private content.
- Ordinary prompt publications keep their public primary key for URLs, favorites, views, and moderation. Migration `010` adds nullable unique `source_prompt_id`; deleting a private source sets only this provenance to NULL and preserves the public snapshot.
- Historical provenance is claimed only for exact byte-identical title and content, identical description nullness/value, the same author, and a null-safe-equal category, and only when both sides have one candidate. Ambiguous or unmatched rows stay detached. Existing dangling, cross-owner, or duplicate non-null provenance stops the migration for manual review.
- `publication_state` is limited to `published` and `withdrawn`. `editor_mode`, `payload`, and `schema_version` make an ordinary publication a complete structured snapshot; legacy and source-null external publications receive safe normal-mode defaults.
- Migration `011` adds `snapshot_origin` and stable `source_public_prompt_id` to folder snapshot rows. Every pre-existing row remains `legacy_unverified`; ownership, timestamps, or matching content are never used to guess whether the user deliberately published it.
- Only a new ownership-checked folder publication may write `folder_publication`. Moderation writes `moderated_publication` together with a public prompt identity. Reads, counts, and imports must treat `legacy_unverified`, deleted-publication references, and invalid origin/reference combinations as invisible.

## Application mismatches that a schema migration must not hide

These are code defects, not missing canonical tables. Creating duplicate compatibility tables/columns would preserve two conflicting data models:

- Some folder reads still use `user_prompts.folder_id` while newer paths use `user_prompt_folders`. New code should use the association table and update the legacy field only for transitional compatibility.
- `user_prompts.is_public` is a legacy compatibility field, not publication identity or lifecycle. Runtime cutover must derive public visibility from `public_prompts.source_prompt_id` and `publication_state`; a later contract migration may remove the legacy flag only after clients stop writing it.

The runtime validator intentionally fails when canonical storage is absent; it does not create aliases for these stale queries.

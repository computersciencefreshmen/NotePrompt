# ADR-0008: Attest public-folder snapshot origins

## Status

Accepted

## Context

`public_folder_prompts` stores durable copies, but its original schema records only a nullable private `source_prompt_id`. It does not record whether the row came from an owner deliberately publishing a folder or from an administrator copying a prompt.

The former administrator path could copy any private prompt into any public folder. Therefore author equality, content equality, timestamps, current private-folder membership, and private source identity cannot prove historical publication intent. In particular, a private prompt copied into a public folder owned by the same author is indistinguishable from a legitimate folder publication. Treating those rows as public would expose private content through anonymous reads and imports.

## Decision

- Migration 011 adds `snapshot_origin` with exactly `legacy_unverified`, `folder_publication`, and `moderated_publication`. Its non-null default marks all existing rows as unverified; only the coordinated runtime cutover makes that marker fail closed because old applications do not read it.
- Migration 011 adds nullable `source_public_prompt_id` referencing `public_prompts.id` with `ON DELETE SET NULL`, a lookup index, and a unique `(public_folder_id, source_public_prompt_id)` identity.
- No historical row is reclassified. Ownership, matching bytes, timestamps, position, and current private membership are not evidence of past consent.
- A pending Migration 011 accepts only rows with `snapshot_origin = legacy_unverified` and `source_public_prompt_id = NULL`; any pre-attested value stops the migration for manual review instead of blessing unknown history.
- Only the ownership-checked folder publication transaction may write `folder_publication`; those rows keep `source_public_prompt_id = NULL`.
- Only moderation of an already published prompt may write `moderated_publication`; it stores the selected public prompt ID and deliberately keeps private `source_prompt_id = NULL`.
- A folder-publication row is visible only when its origin is `folder_publication` and its author is the public-folder owner.
- A moderated row is visible only when its origin is `moderated_publication`, its private source is null, its public reference still exists in the `published` state, and its author, stable prompt snapshot fields, structured payload, and complete public tag set still match that publication.
- `legacy_unverified`, a moderated row whose public reference was deleted, and every invalid origin/reference combination are invisible to lists, details, counts, and imports.
- Private `source_prompt_id`, public `source_public_prompt_id`, and `snapshot_origin` are internal provenance and never enter reader DTOs.
- Schema 011 and the origin-aware runtime are one security release boundary. Until both are active, the edge must keep public-folder reads and imports blocked; deploying the schema alone does not make legacy readers safe.

## Consequences

### Positive

- Historical administrator writes cannot be mistaken for user publication consent.
- Moderation uses the stable public identity instead of inferring identity from a mutable private source.
- Deleting a private source does not hide a still-published moderated snapshot; deleting or withdrawing the public publication does.
- Every public-folder read path can reuse one fail-closed visibility policy.

### Negative

- Existing public folders temporarily contain zero trusted rows after cutover.
- Owners must explicitly republish folders, and moderators must deliberately re-add published prompts.
- The urgent security migration shifts the planned collection, import, account, AI reservation, and prompt revision migrations to 012 through 016.

### Neutral

- Migration 011 is additive and does not delete historical rows.
- `ON DELETE SET NULL` means the database cannot require every moderated row to retain a non-null public reference; runtime visibility enforces that rule.

## Alternatives considered

**Trust rows whose author matches the folder owner.** Rejected because the legacy administrator path could create exactly that row from private content.

**Infer origin from content, timestamps, position, or private-folder membership.** Rejected because each signal is mutable or can also be produced by the unsafe path.

**Encode provenance inside tags or another existing business field.** Rejected because it overloads user data, weakens constraints, and creates a second undocumented schema.

**Delete every legacy row.** Rejected because retaining it supports audit and controlled recovery; invisibility is sufficient for the security boundary.

## Failure and rollback considerations

Migration 011 performs only restartable schema expansion and exact constraint validation. MySQL DDL may commit implicitly. If any existing column, index, or foreign key has an incompatible definition, the migration stops without guessing a repair. Keep writes stopped, inspect the named incompatibility, and rerun only after a reviewed correction. Restore the verified backup if the state cannot be safely resumed.

Application cutover is allowed only after the migration is applied. Rolling application code back while unverified rows exist would restore the unsafe visibility rule, so rollback must keep the public-folder read edge blocked or restore the pre-change database and reviewed application together.

## References

- `database/migrations/007_snapshot_public_folders.cjs`
- `database/migrations/011_attest_public_folder_snapshot_origins.cjs`
- `database/schema-requirements.json`
- `docs/adr/0003-model-publications-as-source-linked-snapshots.md`
- `docs/plans/2026-07-16-sota-upgrade-plan.md`

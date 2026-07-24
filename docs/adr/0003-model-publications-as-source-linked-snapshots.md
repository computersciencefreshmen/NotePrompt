# ADR-0003: Model publications as source-linked snapshots

## Status

Accepted

## Context

A public prompt is a deliberate publication, not a live view of private content. The current public-prompt model lacks stable private-source identity and can infer sameness from mutable attributes such as author and title. That can merge distinct prompts, duplicate one source, or replace tags incorrectly. Public folder publication already follows snapshot semantics and should remain consistent with ordinary prompt publication.

Curated catalog entries and user publications are separate identity domains under ADR-0001. This decision must not move curated content back into `public_prompts` or use numeric ranges as provenance.

## Decision

- A user publication keeps its public primary key as the stable identity used by URLs, favorites, views, and moderation.
- Add nullable `public_prompts.source_prompt_id` as provenance to a private prompt, with `ON DELETE SET NULL` and a unique constraint on the non-null source ID itself. MySQL permits multiple null source values for legacy, external, or detached snapshots.
- Add `editor_mode`, `payload`, and `schema_version` to `public_prompts` so an ordinary publication can hold the same complete structured snapshot already used by public folder snapshots. Source-null external publications use the normal-mode defaults.
- Add `publication_state` with exactly `published` and `withdrawn`. Creation enters `published`; an author may withdraw `published -> withdrawn`; an explicit republish performs `withdrawn -> published` while replacing the full snapshot. Source deletion does not change the state. Moderation state is a separate concern and must not be encoded into this lifecycle field.
- The publish transaction first locks the source with `SELECT ... FROM user_prompts WHERE id = ? AND user_id = ? FOR UPDATE`. It derives `author_id` from the authenticated user, never from request input. A missing or other-user source returns the same not-found result.
- Explicitly publishing the same private source atomically updates the existing public snapshot. The transaction replaces title, content, description, editor mode, structured payload, schema version, category, and complete tag membership.
- Two private prompts with the same title remain independent publications.
- Editing a private prompt never changes a public snapshot. The author must explicitly publish again.
- Deleting the private source preserves the public snapshot and clears only its provenance.
- Historical backfill claims a source only when one private row and one public row have the same author and exact title, content, description, and category snapshot. Ambiguous candidates remain null and are reported for review. Structured fields take safe normal-mode defaults when the legacy public row has no equivalent data.
- Publication moderation reads only public snapshot content. Administrator status alone does not grant access to the private source.
- An administrator may add a prompt to a public-folder snapshot only through a currently `published` `public_prompts` primary key. The public primary key is sufficient moderation identity, so a legitimate source-null or detached publication remains selectable without exposing or reconstructing private provenance.
- ADR-0008 governs public-folder snapshot attestation. No historical folder snapshot is inferred to be safe: every legacy row remains `legacy_unverified` and is invisible to reads, counts, and imports.
- An ownership-checked folder republish creates `folder_publication` snapshots and replaces only the owner's former folder-publication rows. It preserves already attested moderated rows and their relative order.
- A moderator copy creates `moderated_publication`, stores the public publication primary key, and deliberately leaves private `source_prompt_id` null. It remains visible only while the referenced public row is published and its author, stable prompt fields, structured payload, and complete public tag set still match.
- Mutable display metadata, timestamps, and private source identity are never authorization evidence. Withdrawing or deleting the public publication, changing a stable snapshot field or tag, or producing an invalid origin/reference combination makes the moderated row fail closed.

## Consequences

### Positive

- Republishing is idempotent by stable source identity.
- Public links, favorites, views, and moderation records remain stable.
- Same-title prompts and detached legacy publications remain valid.
- Private edits and deletion cannot silently mutate already published content.
- A source cannot be associated with a second author even if an application ownership check regresses.

### Negative

- Snapshots duplicate content and may intentionally become stale.
- A detached publication cannot automatically recover its former source.
- Conservative backfill leaves some legacy rows without provenance.
- Author lifecycle and moderation require separate state rather than one overloaded flag.
- Public-folder visibility needs an explicit origin-aware policy on every list, detail, count, and import path.

### Neutral

- Curated entries continue to use `curated:<id>` and user publications use `published:<id>`.
- Public folder snapshots keep their existing explicit refresh behavior.

## Alternatives considered

**Identify a publication by author and title.** Rejected because titles are mutable and not unique.

**Render public content directly from the private prompt.** Rejected because private edits or deletion would change public promises without explicit publication.

**Create a new public row on every publish.** Rejected because it breaks stable links and duplicates engagement state for one source.

**Make every publication immutable.** Rejected because authors need an explicit republish operation while keeping the public identity and engagement history.

## Failure and rollback considerations

Migration 010 follows expand, conservative backfill, cutover, and later contract. It is restartable and does not rewrite ambiguous rows. Publishing switches to the source-aware transaction only after legacy and replay tests pass. If the migration fails, keep the application stopped, correct the specific resumable failure, and rerun. Restore the verified backup if the state cannot be safely resumed.

## References

- `docs/adr/0001-separate-curated-catalog-identity.md`
- `docs/adr/0008-attest-public-folder-snapshot-origins.md`
- `database/migrations/007_snapshot_public_folders.cjs`
- `database/SCHEMA_DEPENDENCIES.md`
- `docs/plans/2026-07-16-sota-upgrade-plan.md`

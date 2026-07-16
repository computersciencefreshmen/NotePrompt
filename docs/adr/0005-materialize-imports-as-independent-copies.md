# ADR-0005: Materialize imports as independent copies

## Status

Accepted

## Context

Users understand Import as acquiring an editable private copy. The current imported-folder relation still points to a public source and can be deleted or changed with it. That behavior is closer to a live subscription and violates the accepted product meaning.

Public collection content is already a publication snapshot. An import must copy that snapshot into user-owned assets at one point in time, then end the behavioral dependency on the source.

## Decision

- Importing a public collection creates a user-owned private collection and materialized private prompt copies in one transaction.
- Imported prompt rows store the complete title, content, description, structured payload, schema version, category snapshot, tags, and original ordering needed to reproduce the imported state.
- Public collection and public prompt identifiers may remain as nullable provenance for attribution and diagnostics. They are not render dependencies.
- Source updates, unpublishing, or deletion never mutate, delete, or make the private copy unreadable.
- The user may edit, move, publish, or delete imported prompts like any other owned prompt.
- One explicit import operation uses a user-scoped idempotency key so a retry cannot duplicate part of the collection. A later deliberate import may create another independent copy.
- A future synchronized subscription, if ever needed, must be a separately named feature and may not change Import semantics.

## Consequences

### Positive

- Imported assets remain reliable and editable for the user.
- Public authors can change or remove a source without corrupting another user's private library.
- Rendering and authorization no longer depend on a mutable public relation.
- Retry behavior can be transactionally deterministic.

### Negative

- Content and tags consume additional storage.
- Imported copies do not automatically receive upstream corrections.
- Provenance can become detached and must tolerate null or missing sources.

### Neutral

- Attribution policy remains a product and moderation concern even though rendering is independent.
- Multiple deliberate imports of the same source are allowed unless the user chooses to reuse an existing copy.

## Alternatives considered

**Keep a live pointer and rename nothing.** Rejected because it violates user expectations and makes private assets depend on public lifecycle.

**Keep a live pointer and call it Subscribe.** Rejected for the current product because synchronization, conflicts, and upstream trust are not accepted scope.

**Copy only collection metadata but render source prompts.** Rejected because deletion and content changes still leak through.

**Prevent source deletion while imports exist.** Rejected because it gives importers control over an author's publication lifecycle.

## Failure and rollback considerations

Migration 012 expands storage without deleting the old pointer relation. Backfill materializes the exact currently published snapshots and records import operation identity. Cutover reads only user-owned copies. The old projection is removed only after row counts, ownership, and content fingerprints match. A partial import transaction rolls back; a retried request uses its idempotency key.

## References

- `database/migrations/001_create_canonical_schema.cjs`
- `database/migrations/007_snapshot_public_folders.cjs`
- `database/schema-requirements.json`
- `docs/plans/2026-07-16-sota-upgrade-plan.md`

# ADR-0004: Canonicalize prompt collections

## Status

Accepted

## Context

Private prompt membership currently has two representations: `user_prompts.folder_id` and the `user_prompt_folders` association table. Reads and writes can disagree, and an ordinary prompt update can accidentally change organization state. The product decision is that one prompt may belong to several collections. The association table is already the intended canonical model, but it needs an explicit tenant key and database-enforced same-owner integrity.

The word folder implies a single tree location and reinforces the legacy column. The product needs named collections that can overlap.

## Decision

- Use the product term Collections in UI, API documentation, and new code. Physical table names may remain during migration.
- A private prompt may belong to zero or more collections owned by the same user.
- `user_prompt_folders` becomes the only membership source of truth and gains `user_id`.
- Add composite uniqueness and foreign keys so a membership can reference only a prompt and collection owned by that same user.
- New API writes accept explicit `collection_ids`. A normal prompt update does not change memberships unless that field is present.
- Reads return canonical collections and provide `folder_id` only as a one-version lossy compatibility projection. The existing valid `folder_id` remains the legacy primary while it is still a same-owner canonical membership; otherwise the mapper chooses the lowest canonical collection ID, or null when there is no membership. Extra canonical memberships are expected and deliberately invisible to a singular client.
- A new `collection_ids` write replaces the canonical membership set and updates the singular projection to the lowest normalized ID. A legacy-only `folder_id` write validates same-owner membership, inserts the requested canonical membership, and changes only the singular projection; it never deletes additional canonical memberships.
- During cutover, instrumentation verifies containment and ownership rather than impossible set equality: every non-null legacy projection has a same-user canonical membership, no legacy-only membership remains, and every canonical row joins to a prompt and collection for the recorded user.
- Drop `user_prompts.folder_id` in a later contract migration only after those invariants remain clean for the agreed observation period and no supported route, client, export, or query reads or writes the projection. Multiple canonical memberships are not a migration difference.

## Consequences

### Positive

- Multi-collection organization becomes explicit and reliable.
- Prompt content edits cannot silently clear collection membership.
- Tenant ownership is enforced in SQL and at the database boundary.
- API vocabulary matches the accepted product model.

### Negative

- Reads require joins or aggregate queries.
- Expand and cutover temporarily retain compatibility code.
- Existing clients must move from the intentionally lossy singular projection to `collection_ids`.

### Neutral

- Collections do not imply hierarchy. A future hierarchy would require a separate parent relation and product decision.
- Public collection publication remains a deliberate snapshot, not a live view of this membership relation.

## Alternatives considered

**Choose one folder per prompt.** Rejected because the accepted workflow needs overlapping project, topic, and reuse collections.

**Keep both models synchronized forever.** Rejected because two writable facts inevitably drift and complicate ownership rules.

**Store collection IDs in prompt JSON.** Rejected because it weakens referential integrity, indexing, and tenant enforcement.

**Use tags instead of collections.** Rejected because tags describe attributes while collections represent user-curated asset sets and navigation.

## Failure and rollback considerations

Migration 011 is an expand migration. Backfill joins through user ownership and records or fails on cross-tenant anomalies. Cutover keeps the legacy column readable for one version and measures the containment and same-tenant invariants above. The contract migration is forbidden while a legacy-only row or code dependency remains. If cutover fails, keep canonical data, route legacy reads through the documented projection, and investigate the measured anomaly without deleting additional memberships.

## References

- `database/migrations/003_reconcile_prompt_storage.cjs`
- `database/SCHEMA_DEPENDENCIES.md`
- `database/schema-requirements.json`
- `docs/plans/2026-07-16-sota-upgrade-plan.md`

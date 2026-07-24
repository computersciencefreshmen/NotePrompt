# Architecture Decision Records

ADRs record accepted, long-lived product and architecture semantics. They do not replace implementation plans, migrations, tests, or runbooks.

## Index

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-separate-curated-catalog-identity.md) | Separate curated catalog identity from user publications | Accepted |
| [0002](0002-adopt-a-modular-monolith.md) | Adopt a Next.js modular monolith | Accepted |
| [0003](0003-model-publications-as-source-linked-snapshots.md) | Model publications as source-linked snapshots | Accepted |
| [0004](0004-canonicalize-prompt-collections.md) | Canonicalize prompt collections as a tenant-safe many-to-many relation | Accepted |
| [0005](0005-materialize-imports-as-independent-copies.md) | Materialize imports as independent private copies | Accepted |
| [0006](0006-persist-ai-usage-reservations.md) | Persist AI usage reservations | Accepted |
| [0007](0007-operate-to-a-single-ecs-slo.md) | Operate to an honest single-ECS SLO | Accepted |
| [0008](0008-attest-public-folder-snapshot-origins.md) | Attest public-folder snapshot origins | Accepted |

## Format

Files use a four-digit sequence and kebab-case title. New records follow the established sections:

1. Status
2. Context
3. Decision
4. Consequences, split into positive, negative, and neutral
5. Alternatives considered
6. Failure and rollback considerations
7. References

Accepted ADRs are immutable historical decisions. A changed decision receives a new ADR that explicitly supersedes the old record.

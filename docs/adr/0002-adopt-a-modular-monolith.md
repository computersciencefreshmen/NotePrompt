# ADR-0002: Adopt a Next.js modular monolith

## Status

Accepted

## Context

NotePrompt is a personal production tool maintained and operated as one Next.js application on a single Alibaba Cloud ECS. Its current domain rules, route handling, authorization, and SQL are concentrated in route files and a large database class. That shape makes ownership rules inconsistent and raises the cost of safe change, but the product does not have the team size, independent scaling needs, or operational budget that justify distributed services.

The architecture must improve domain boundaries without adding network calls, distributed transactions, service discovery, extra deployables, or Kubernetes. MySQL transactions, one commit-SHA image, and a simple recovery path remain valuable constraints.

## Decision

- Keep one Next.js application, one production image, one MySQL schema, and one release lifecycle.
- Organize the application into five explicit modules: Identity and Access, Prompt Library, Publication Catalog, AI Runtime and Metering, and Platform.
- Route adapters authenticate, validate HTTP input with Zod, call one application service, and translate typed results or errors into HTTP responses. They do not contain product SQL.
- Application services own use-case orchestration and transaction boundaries.
- Repositories own SQL and return domain-shaped data. Every ordinary private-resource query carries the authenticated owner or tenant condition in the query itself.
- A module may call another module only through its public application interface. It must not import another module's repository.
- Cross-module database transactions remain allowed when one user action requires strong consistency, but the owning application service must document the transaction boundary.
- Enforce dependency direction with code layout, focused contract tests, and lint rules as modules are extracted.

## Consequences

### Positive

- Authorization and ownership rules gain one implementation point per domain.
- Existing MySQL transactions and low-latency in-process calls remain available.
- Deployment, rollback, local development, and single-ECS operations remain simple.
- Modules can be extracted incrementally from the current routes and database class.

### Negative

- All modules still deploy and scale together.
- A bad release can affect the whole product, so CI and release gates remain essential.
- Boundary enforcement requires discipline because the language runtime does not isolate modules.
- The extraction creates temporary adapters and compatibility code.

### Neutral

- A future service split would require a new ADR based on measured scale or organizational need.
- Redis remains infrastructure for limits and circuit breakers, not an event bus or a second domain source of truth.

## Alternatives considered

**Keep the current route and database-class organization.** Rejected because it preserves inconsistent authorization, duplicated semantics, and high change risk.

**Split immediately into microservices.** Rejected because independent deployment and scaling do not offset distributed consistency, observability, networking, and operational cost for this product.

**Rewrite around a new backend framework.** Rejected because it delays security and domain repairs without changing the actual product constraints.

**Adopt CQRS or event sourcing.** Rejected because the current workload does not require separate read models or an event-log source of truth.

## Failure and rollback considerations

Module extraction is performed in small commits behind existing route contracts. Each route moves only after ownership, transaction, and response tests pass. A failed refactor can restore the previous application-service adapter without reverting a schema migration. Module extraction must not be combined with a production migration or UI redesign commit.

## References

- `PRODUCT.md`
- `docs/plans/2026-07-16-sota-upgrade-plan.md`
- `src/lib/mysql-database.ts`
- `docker-compose.yml`

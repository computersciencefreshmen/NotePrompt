# ADR-0006: Persist AI usage reservations

## Status

Accepted

## Context

AI calls consume a limited personal entitlement and real provider cost. Aggregate counters and in-process compensation cannot prove what happened when a request is retried, the application crashes, a provider times out, or a response disconnects. Redis is appropriate for abuse limits and circuit breakers, but it is not the durable source of quota truth.

The product does not implement payment billing. It needs reliable usage and quota metering for free and pro plan entitlements.

## Decision

- Store every charge attempt as a MySQL reservation with a stable reservation ID and a user-scoped idempotency key.
- The state machine is:

```text
reserved -> dispatched -> committed
reserved -> refunded
reserved -> expired
dispatched -> committed with success, provider_error, client_disconnect, or timeout outcome
```

- Creating `reserved` atomically checks the account entitlement and reserves one unit for the `Asia/Shanghai` business period.
- Failures before provider dispatch transition to `refunded` and release the unit.
- The application marks `dispatched` at the irreversible provider-call boundary. Once dispatch begins, the unit is charged even if the provider fails, the client disconnects, or the response times out.
- Completing a dispatched call writes `committed` with provider, model, operation, timestamps, outcome, and non-secret provider request correlation when available.
- Compare-and-swap transitions keyed by reservation ID make retries idempotent. Invalid transitions fail closed and are audited.
- A reconciler expires stale `reserved` rows and commits stale `dispatched` rows conservatively with a timeout outcome. It never refunds an already dispatched reservation.
- Aggregate daily and monthly counters are derived or transactionally maintained projections. The reservation ledger is the authoritative evidence.
- Redis continues to enforce request-rate, concurrency, and global-cost circuit breakers. A Redis reset cannot restore spent entitlement.

## Consequences

### Positive

- Retries, crashes, and reconciliation cannot double-charge or silently restore usage.
- Usage becomes auditable by request and outcome.
- Quota behavior has one business calendar and one source of truth.
- Provider failure can be measured separately from pre-dispatch application failure.

### Negative

- Every AI request adds transactional database writes.
- A conservative dispatch boundary charges some requests that produce no useful result.
- A reconciliation job and operational alerts become mandatory.

### Neutral

- This ledger records entitlement usage, not money, invoices, or accounting revenue.
- Provider cost estimates may be attached later without changing transition semantics.

## Alternatives considered

**Increment an aggregate counter and decrement on error.** Rejected because crashes and retries make compensation ambiguous.

**Charge only after a successful response.** Rejected because provider-accepted failures still create real cost and can be abused.

**Store reservations only in Redis.** Rejected because eviction, restart, and failover weaken auditability and recovery.

**Implement a payment-grade billing ledger now.** Rejected because payments and commercial subscriptions are explicit non-goals.

## Failure and rollback considerations

Migration 015 first adds the ledger and transition constraints while existing counters remain. A shadow comparison proves reservation projections match current entitlement totals before cutover. If the new path fails before dispatch, it refunds by idempotent transition. If it fails after dispatch, reconciliation commits it. The old compensation path is removed only after retry, crash, timeout, and replay tests pass.

## References

- `database/migrations/004_reconcile_ai_usage.cjs`
- `database/SCHEMA_DEPENDENCIES.md`
- `src/lib/mysql-database.ts`
- `docs/plans/2026-07-16-sota-upgrade-plan.md`

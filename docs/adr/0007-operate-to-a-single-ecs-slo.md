# ADR-0007: Operate to an honest single-ECS SLO

## Status

Accepted

## Context

NotePrompt is a personal production tool running on one Alibaba Cloud ECS with Docker Compose. The application, edge, and currently self-managed data services share one host failure domain. Claiming multi-zone high availability or 99.9 percent without redundant infrastructure would be misleading. The product needs a measurable reliability target that matches cost and operational capacity.

## Decision

- Target 99.5 percent complete-service availability over a rolling 30-day window. Planned maintenance counts against the target.
- Target RPO 24 hours and RTO 4 hours. A maintenance-window final backup targets zero data loss for that cutover.
- Publish only ports 80 and 443. Restrict SSH to approved operator sources. MySQL 3306 and Redis 6379 remain private.
- Keep an independent ACME edge on port 80 so certificate renewal does not depend on application, database, or business Nginx health.
- Business Nginx owns port 443 and proxies the commit-SHA application image.
- Expose dependency-free `/api/live` publicly. Keep `/api/health` and `/api/v1/health-check` inside the application container; the public edge always returns 404 for both.
- Build and deploy immutable images tagged with the full Git commit SHA. Git SHA, image tag, OCI revision, and private health version must match.
- Take daily off-host backups, validate their age and integrity, and perform a documented restore exercise monthly.
- Monitor public DNS, TLS, 80, 443, liveness, homepage, and a safe real business read. Monitor private readiness, Redis, revision, host resources, restarts, and backup state separately.
- Alert on public certificate expiry at 30, 14, and 7 days and run a monthly renewal dry run.
- Require a 72-hour observation period after the deployment and network-hardening window before another product release.

## Consequences

### Positive

- Reliability claims match the actual failure domain and budget.
- Liveness, readiness, certificate renewal, and business availability have distinct signals.
- Immutable release identity and restore exercises reduce recovery ambiguity.
- Operational complexity stays appropriate for a small product.

### Negative

- Host, disk, kernel, network, and same-host database failure can cause a full outage.
- A 30-day 99.5 percent target permits roughly 3 hours and 39 minutes of error budget.
- Maintenance and restore procedures can consume most of that budget.
- RPO 24 hours accepts potential data loss outside a final release backup.

### Neutral

- The target is not described as high availability.
- Vertical ECS scaling remains the first capacity response after measured saturation.
- A future managed database or redundant host topology requires a new ADR and a revised SLO.

## Alternatives considered

**Claim 99.9 percent on the current host.** Rejected because the architecture and recovery evidence do not support it.

**Introduce Kubernetes and multiple application nodes.** Rejected because the database and host failure domain would remain, while operational cost would rise sharply.

**Add a full observability platform immediately.** Rejected because external probes, structured Nginx logs, Docker state, host metrics, and backup checks cover the initial target at lower cost.

**Operate without a stated SLO.** Rejected because incidents, release decisions, and capacity work would lack measurable priorities.

## Failure and rollback considerations

Every production change records the previous image, Git SHA, schema state, backup, and rollback boundary. A new release must become healthy within 180 seconds and pass authentication, private read, create, edit, Redis, TLS, and revision smoke checks. After a migration starts, the old image may return only when compatibility with the new schema is proven; otherwise restore the verified final backup and old stack. The ACME edge should remain running through application rollback.

## References

- `DEPLOY.md`
- `docs/operations/tls-certificate-incident.md`
- `compose.acme.yml`
- `docker-compose.yml`
- `docs/plans/2026-07-16-sota-upgrade-plan.md`

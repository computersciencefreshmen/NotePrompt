# Release Quality Gates

The workflow in [`.github/workflows/release-quality.yml`](../../.github/workflows/release-quality.yml) is the executable release contract for NotePrompt. It runs on pull requests, merge queues, `main`, `codex/**`, and manual dispatches. The stable branch-protection check is **Release Quality / Release gate**.

## Enforced checks

| Job | Evidence required |
| --- | --- |
| Node quality and production build | Node 24, locked install, type-check, ESLint, complete tests, production build, standalone runtime-config rejection, offline migration plan |
| Empty MySQL 8.4 migration replay | A pinned MySQL 8.4 LTS service starts with an empty schema; all migrations apply once, replay as a no-op, and satisfy `schema-requirements.json` |
| Production dependency audit | `npm audit --omit=dev --audit-level=high` reports no high or critical production advisory |
| Compose configuration validation | Production and independent ACME Compose projects render with non-secret placeholders |
| Full-history secret scan | Gitleaks scans every fetched branch and tag with values redacted and no baseline or allowlist |
| Source and configuration scan | Trivy rejects high or critical lockfile and infrastructure findings |
| Immutable image build and scan | The image builds from the checked-out commit, carries the full SHA as its OCI revision, and passes the high/critical OS and library scan |

`Release gate` runs even when an earlier job fails and succeeds only when every required job succeeded. Configure branch protection against that one stable check instead of selecting implementation jobs individually.

## Supply-chain policy

- Every external GitHub Action is referenced by its complete 40-character commit SHA. The adjacent version comment is informational only.
- The MySQL and Gitleaks containers are referenced by immutable multi-platform digest.
- Trivy is pinned to the post-incident `v0.36.0` commit. Never replace it with a movable version tag or `latest`; the Trivy ecosystem suffered a release-pipeline compromise in March 2026.
- Dependabot may propose pinned Action, npm, and Docker updates. An update is accepted only after reviewing the upstream release and rerunning this workflow.
- No gate uses `continue-on-error`, a secret baseline, or an unbounded vulnerability exception.

## Known credential-incident transition

The repository history predating the credential cleanup contains deleted operational scripts that were already classified as sensitive. The full-history Gitleaks job is intentionally fail-closed until the owners complete credential rotation and the coordinated Stage 1C history rewrite. Do not make CI green by printing findings, adding fingerprints to an ignore file, scanning only the working tree, or weakening `Release gate`.

The operational source of truth for that incident is [Credential exposure recovery](../operations/credential-exposure-recovery.md). A green checkout job alone cannot prove that GitHub pull-request refs, forks, cached views, Actions artifacts, or other derived stores were cleaned.

After rotation and the coordinated force-push:

1. Re-clone the repository instead of pulling the rewritten history.
2. Manually dispatch **Release Quality** against `main`.
3. Confirm the full-history Gitleaks job and every other job succeeds.
4. Require **Release Quality / Release gate** in `main` branch protection.

## Local parity

Run the checks that do not require Linux containers before every commit:

```bash
npm ci
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
npm run db:plan
```

Docker Desktop or another Linux Docker daemon is required to reproduce MySQL, Compose, image-build, Gitleaks, and Trivy jobs locally. When it is unavailable, the pushed workflow is the authoritative Linux execution; a failed job remains a release blocker.

## Updating a pinned Action

1. Read the official upstream release and security notices.
2. Resolve the release tag to its dereferenced commit, not the annotated tag object.
3. Replace the full SHA and version comment together.
4. Update the workflow contract test if the tool contract changed.
5. Run the complete workflow before merging.

Useful primary references: [GitHub secure use reference](https://docs.github.com/en/actions/reference/security/secure-use), [Gitleaks](https://github.com/gitleaks/gitleaks), [Trivy security advisory](https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23), and [MySQL 8.4 LTS release notes](https://dev.mysql.com/doc/relnotes/mysql/8.4/en/).

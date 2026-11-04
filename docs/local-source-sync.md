# Local source synchronization — 2026-11-05

This revision imports the local NotePrompt application onto remote main `ff8d3630b739d22b825347eb4254331cada643f2` in `computersciencefreshmen/NotePrompt`. The similarly named `Note_Prompt` repository is separate. The local and remote histories do not share a commit, so only a filtered source snapshot is imported; local Git history and runtime state are not pushed.

## Included behavior

- Opt-in optimizer workspace, attachment parsing, image OCR, provider settings and diagnostics, English public content, bilingual UI and the accompanying schema changes.
- Set `NEXT_PUBLIC_ENABLE_PROMPT_OPTIMIZER_V2=true` before building to include `/optimizer`.
- For Docker, pass `--build-arg NEXT_PUBLIC_ENABLE_PROMPT_OPTIMIZER_V2=true`; the default remains opt-in.
- Administrator authorization protects shared provider configuration and billable diagnostic probes. Configuration responses are private/no-store and contain masked key previews only.
- Signed-in users can parse attachments. One batch runs per Node process; concurrent batches receive 429 with Retry-After before their bodies are parsed. Each batch processes up to 12 files sequentially with the existing 10MB per-file limit. This is process-local admission control, not a distributed queue or a total upload-memory guarantee.
- PDF parsing uses `PDFTOTEXT_PATH`, the existing Windows fallback, or `pdftotext` on PATH. The container installs Poppler and carries the full locked production dependencies required by the OCR subprocess.

## Validation

Validation uses Windows Node 24 and synthetic authentication fixtures, with the new workspace enabled at build time.

- Production build passed on Next.js 15.5.29, including TypeScript validation; standalone typecheck also passed.
- Five tests passed: attachment admission/recovery, offline verification-email formatting, and patched matcher compatibility with React/import lint rules.
- Twenty local HTTP checks passed: anonymous/member/admin permission boundaries, configuration reads, rejection before body parsing, file-count limits, real TXT/JSON/XLSX/BIFF8-XLS/CSV/TSV/DOCX parsing, real PNG OCR and Next image resizing to 64px.
- No real account, production database query, paid model probe or external inference request was used.
- Full-project lint passes with zero errors and 21 existing hook-dependency warnings. Build-time lint and TypeScript validation are both enabled; no rules were disabled to obtain this result.
- Official npm audit of the complete dependency tree, including development dependencies, reports zero findings. SheetJS uses its official 0.20.3 release tarball because the old npm distribution is unmaintained. The lockfile records its integrity.
- Next remains on 15.5.29. Patched PostCSS and sharp are used throughout the tree. The lint configuration adapts the CommonJS export shape of minimatch 11 for older lint plugins while retaining the patched matcher; positive/negative React pattern tests and import path-group tests verify enforcement.

## Private material and deployment limits

Environment files, runtime provider credentials, uploads, private operations scripts and local snapshots are excluded. Credential-bearing operations scripts already present on remote main are removed from the new tree; this does not erase their historical versions. Treat the historical credentials as exposed and rotate them with their owners; their validity has not been tested.

No production deployment, DNS change, account change or purchase is included. The local working directory is preserved. Real MySQL migration, external AI access, SMTP delivery, real PDF parsing, Linux container execution and multi-application capacity remain to be verified. PNG OCR was exercised through the production HTTP API, including first-run free language-data download. Provider configuration and uploads need explicit persistent storage and backup configuration before a container rollout; the default local JSON file does not survive image replacement automatically.

The build-only JWT placeholder in the Dockerfile exists only for route collection during the build. Runtime JWT_SECRET must be supplied separately with a strong secret; the placeholder is not a production credential.

## Reproduce

Use Node 24 and a temporary JWT_SECRET for build validation. Do not copy production credentials into Git or test logs.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
NEXT_PUBLIC_ENABLE_PROMPT_OPTIMIZER_V2=true npm run build
node scripts/verify-local-sync.mjs
npm run lint
npm audit --registry=https://registry.npmjs.org
```

The HTTP verification script creates a fresh runtime JWT secret and sends application requests only to 127.0.0.1. OCR can download its free language data on the first run. The script never calls an inference service or database. Linux container behavior and general OCR/model accuracy are outside these checks.

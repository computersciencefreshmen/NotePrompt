# Local NotePrompt source synchronization

**Goal:** Publish the local application revision, including attachments and OCR, to the existing `computersciencefreshmen/NotePrompt` repository as a reviewable branch.

**Architecture:** Preserve the current Next.js/MySQL application and external AI providers. Import a filtered working-directory snapshot onto the current remote `main`; do not attach the local repository's unrelated history or copy runtime state. The similarly named `Note_Prompt` repository is a separate project.

**Tech Stack:** Next.js 15, React 18, TypeScript, MySQL, Tesseract.js, Poppler, Docker.

## Source import

- Preserve local UI, optimizer, provider catalog, English public content and schema changes.
- Keep remote-only files unless they are obsolete source backups or private operations scripts.
- Exclude environment files, provider credentials, uploads, snapshots and local deployment helpers. Remove credential-bearing operations scripts from the new tree without rewriting existing Git history.

## Release blockers

- Protect shared provider configuration with administrator authentication, and billable diagnostic probes with administrator authorization. Preserve client authentication headers.
- Authenticate attachment parsing and bound concurrent batches before reading multipart bodies. Process each batch sequentially while retaining its supported formats and limits.
- Support Linux `pdftotext`, trace the OCR worker assets, and use a supported Node runtime in the container.

## Verification

- Run TypeScript, production build, attachment-capacity recovery tests and local HTTP authorization/attachment checks with synthetic credentials.
- Run the full linter and report existing debt without weakening rules or claiming a pass.
- Inspect the final source tree and newly created commit for credentials before pushing only the reviewed branch. Open a draft PR while production/AI/database validation remains outstanding.

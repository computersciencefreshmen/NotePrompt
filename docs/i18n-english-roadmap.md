# English Version and Internationalization Roadmap

Date: 2026-05-25
Project: Note Prompt

## Current implementation

The first English version is implemented as a low-risk, frontend/API compatible layer:

- Landing page supports Chinese and English via `?lang=en`.
- The language switch updates the current URL without a full reload.
- Landing copy, navigation, pricing, V2 update copy, stats, product preview, and footer roadmap are localized.
- Public prompt library supports `?lang=en`.
- English prompt library uses curated built-in templates from `src/data/english-featured-prompts.ts`.
- The public prompt API supports `lang=en` and returns English featured prompts without changing the database schema.
- English template cards use copy behavior instead of database import, because these templates are not yet persisted as public prompt rows.

This approach gives users a usable English surface immediately while keeping production database risk low.

## Recommended rollout plan

### Phase 1: Usable English preview

Status: implemented locally.

Scope:
- URL-based locale switch: `?lang=en`.
- Localized landing page.
- Localized public prompt library shell.
- Built-in English featured prompt frameworks.
- Document language attribute updates after switching.

Why this phase matters:
- Gives a working English experience now.
- Avoids schema churn while the product direction is still changing.
- Lets us validate English copy, prompt categories, and template quality before permanent import.

### Phase 2: Persist English prompts in the database

Add fields to `public_prompts`:
- `locale VARCHAR(10) DEFAULT 'zh-CN'`
- `source_locale VARCHAR(10) NULL`
- `translation_status ENUM('original','translated','reviewed') DEFAULT 'original'`
- Optional: `canonical_prompt_id INT NULL` for linking Chinese and English versions.

Add indexes:
- `(locale, is_featured, created_at)`
- `(locale, views_count)`

Migration strategy:
- Mark existing prompts as `zh-CN`.
- Seed reviewed English prompts as `en`.
- Update public prompt API to filter by `locale` rather than static data.
- Enable import for English prompts once they are database rows.

### Phase 3: Route-level i18n

Move from query parameters to stable routes:
- `/` for Chinese default.
- `/en` for English landing.
- `/public-prompts` for Chinese prompt library.
- `/en/public-prompts` for English prompt library.

Benefits:
- Better SEO.
- Cleaner sharing links.
- Easier metadata and sitemap generation.

### Phase 4: SEO and metadata

Add localized metadata:
- English title and description.
- `hreflang` links for Chinese and English.
- Localized Open Graph metadata.
- Locale-aware sitemap entries.

Recommended English positioning:
- "Prompt asset management and optimization workspace"
- Avoid claiming enterprise readiness before team billing and permissions are fully live.

### Phase 5: Admin and content operations

Add admin tools:
- Locale filter in prompt moderation.
- Translation/review status controls.
- Featured English prompt management.
- Batch import for English prompt packs.
- Quality checklist before publishing English templates.

### Phase 6: Full app localization

Localize authenticated product surfaces:
- Header/navigation.
- Prompt editor.
- Optimizer workbench.
- Settings/provider configuration.
- Profile and usage stats.
- Toasts, validation errors, and empty states.

Implementation recommendation:
- Introduce a lightweight dictionary system first.
- Avoid adding a heavy i18n framework until route-level i18n is confirmed.
- Keep AI prompt templates language-specific rather than machine-translating every Chinese template.

## English prompt framework standard

Each English featured prompt should include:

- Clear role definition.
- Input variables wrapped as `{{variable}}`.
- Structured output sections.
- Constraints and quality rules.
- Copy-ready wording.
- Category and tags.
- No unverifiable claims, private data, or provider-specific assumptions.

Suggested categories:
- Strategy
- Product
- Engineering
- Research
- Marketing
- Operations
- Data
- Education
- Sales
- Prompt Engineering

## Deployment checklist

Before deploying English support:

- Verify `/` and `/?lang=en` visually on desktop and mobile.
- Verify `/public-prompts?lang=en` returns English templates.
- Verify Chinese public prompt library still returns existing Chinese content.
- Confirm English cards copy successfully.
- Confirm no non-public internal roadmap or payment readiness wording appears on landing.
- Decide whether Phase 1 query-parameter URLs are acceptable for the first public release or whether Phase 3 route-level i18n should happen before launch.

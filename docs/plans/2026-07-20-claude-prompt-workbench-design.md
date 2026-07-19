# Claude-Inspired Prompt Workbench Design Decision

Date: 2026-07-20

Status: Accepted for the authenticated prompt library

Scope: `/prompts`, shared authenticated product shell, and the light/dark semantic theme
Related baseline: [`DESIGN.md`](../../DESIGN.md)

## 1. Decision

NotePrompt's authenticated product will use a Claude-inspired, warm editorial workbench: quiet paper surfaces, near-black ink, restrained clay accents, serif interface typography, and low visual noise. This is an interpretation of the qualities that make a long-form knowledge tool calm and trustworthy; it is not a pixel-for-pixel copy of another product.

The current homepage structure and brand narrative remain intact. This decision changes the product experience after sign-in, beginning with `/prompts`. It does not authorize a homepage rewrite.

The prompt library becomes an asset workbench rather than a CRUD dashboard. Collections establish context, search and filters narrow the working set, and a readable asset list makes the next action obvious. Decorative KPI cards, repeated hero-sized metrics, interchangeable visual skins, and grids of identical cards are not part of the target design.

Only light and dark themes are supported. Historical `workbench`, `editorial`, `dashboard`, and `lightweight` preferences may be normalized during implementation, but they must not remain independently styled products.

## 2. Creative north star

**The Quiet Paper Workbench**

The primary scene is a researcher or developer working for hours in daylight with prompts, notes, and model output. The interface should feel like a well-made notebook laid on a desk: materially warm, typographically deliberate, and almost invisible until an action or state needs attention.

Three rules govern every screen:

1. Content carries the hierarchy. Surfaces group work; they do not compete with it.
2. Clay color communicates action or selection. It is not decorative confetti.
3. Density is earned by the task. Metadata stays compact and supporting controls appear progressively.

## 3. Semantic visual system

The user-provided theme is the source palette:

- Accent: `#da7756`
- Ink: `#141413`
- Paper surface: `#f5f4ee`
- UI family: `ui-serif, Georgia, Cambria, "Times New Roman", Times, "Noto Serif SC", serif`
- Code family: `"JetBrainsMono NFM", "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace`

These values must enter components through semantic roles, not hard-coded component colors.

### Light roles

| Role | Value | Use |
| --- | --- | --- |
| `canvas` | `#efede6` | App background and page gutters |
| `surface` | `#f5f4ee` | Primary paper work surface |
| `surface-raised` | `#fffdf8` | Menus, dialogs, and one dominant editor surface |
| `ink` | `#141413` | Primary text and high-priority icons |
| `ink-muted` | `#666159` | Supporting text after contrast verification |
| `rule` | `#d9d5cc` | Dividers, input boundaries, and inactive outlines |
| `accent` | `#da7756` | Filled actions, selected fills, and larger graphical signals |
| `accent-strong` | `#9b523a` | Links, small accent text, focus rings, and thin indicators |

`#da7756` has insufficient contrast against `#f5f4ee` for normal-sized text, so it must not be used as small text or as the sole thin focus indicator. Clay-filled buttons use dark `#141413` text. The deeper `accent-strong` role carries contrast-sensitive foreground and focus duties.

### Dark roles

| Role | Value | Use |
| --- | --- | --- |
| `canvas` | `#1c1b19` | App background and page gutters |
| `surface` | `#25231f` | Primary work surface |
| `surface-raised` | `#2f2c27` | Menus, dialogs, and selected elevated regions |
| `ink` | `#ece9df` | Primary text and icons |
| `ink-muted` | `#b7b0a4` | Supporting text |
| `rule` | `#3c3932` | Dividers and control boundaries |
| `accent` | `#e09272` | Action, selection, focus, and active state |
| `accent-strong` | `#f0ad90` | High-emphasis foreground only after contrast verification |

Light and dark use the same role names and interaction rules. Dark mode is not an inverted light screenshot and must not introduce neon accents, glass effects, or pure black surfaces.

### Typography and geometry

- The authenticated UI uses the supplied serif stack for navigation, controls, headings, and prose. Native fallbacks are mandatory because `JetBrainsMono NFM` and individual serif faces may not be installed.
- Prompt content, generated text, and long descriptions target a comfortable `1.55` to `1.7` line height and a readable line length of roughly 62 to 76 characters.
- Prompt variables, model identifiers, usage values, shortcuts, and code use the monospace stack.
- Product titles are compact rather than marketing-sized. Routine workspace headings should normally stay between `1.25rem` and `1.75rem`.
- Corners use a restrained 6px to 10px range. Persistent regions are flat and separated by tone or a one-pixel rule; shadows are reserved for temporary floating surfaces.
- Controls are at least 36px high on desktop and 44px on touch layouts.

## 4. `/prompts` information architecture

### Desktop, 1024px and wider

The authenticated shell has a stable navigation rail and a compact top command row. Within `/prompts`, the workbench uses two primary regions:

1. **Collection rail, 240px to 280px:** All prompts, recent items, favorites if backed by real behavior, and user collections. Collection counts are quiet metadata, not metric cards. A single add-collection action sits beside the section label.
2. **Asset workspace, fluid:** A page title, one sentence of context, global search, compact filter/sort controls, one primary “New prompt” action, and the prompt asset list.

The asset list is editorial and scan-friendly. Each row exposes the title, a short content excerpt, collection or tags, updated time, visibility state, and a compact overflow menu. The entire row may be a semantic link only when every nested action remains keyboard-safe; otherwise the title is the primary link and actions are explicit buttons.

The screen must not show a wall of statistic cards above the user's work. A result count may appear inline beside the title or filter summary. Prompt cards should not float independently with large shadows or repeat identical chrome.

### Tablet, 768px to 1023px

- The global navigation may collapse to an icon rail or sheet trigger.
- Collections remain a narrower rail when space permits; otherwise they open in a labeled sheet.
- Search occupies the dominant toolbar width and secondary filters wrap once without clipping.
- Asset metadata progressively reduces in priority: keep title, excerpt, updated state, and primary actions before secondary tags.

### Mobile, 320px to 767px

- Use a single-column asset list, not compressed desktop columns.
- Collections open from a 44px “Collections” control into a sheet with a clear heading, selected state, close action, and focus return.
- Search and “New prompt” remain reachable near the top; filters open in a sheet or disclosure rather than a horizontally overflowing toolbar.
- Each asset row keeps a readable title and excerpt. Metadata may wrap to a second line; it must not truncate the action name or visibility state.
- Menus and dialogs fit the viewport, respect safe-area insets, prevent background scroll, and restore focus to their trigger.

The future Studio may use mobile Editor, Optimize, and Inspector panels, but this batch does not create those panels or change draft/version semantics.

## 5. Interaction contract

### Search, filters, and loading

- Search has a persistent visible label or accessible name, exposes its current query, and uses a modest debounce without blocking typing.
- Collection, visibility, and sort state are explicit and recoverable during the current session. An active filter always has a non-color cue and a one-action reset.
- Pagination uses an explicit “Load more” control with a loading state. Infinite-scroll-only discovery is not acceptable for keyboard navigation or error recovery.
- While a request is pending, preserve existing results where safe and identify the refreshing region with `aria-busy`. Do not flash the entire page to a blank skeleton on every filter change.

### Asset actions

- Create, edit, duplicate/import, publish, move to collection, and delete have distinct labels and outcomes. Icon-only actions require accessible names and tooltips where meaning is not universal.
- Destructive actions require confirmation that names the affected asset. The default focus is never the destructive button.
- Publishing confirms that a snapshot becomes public and identifies which content is included. It must not imply that a private source becomes a live public mirror.
- Success and failure messages use an `aria-live` region, remain long enough to read, and include a recovery action when one exists.
- Disabled controls explain why when the reason is not obvious. Loading controls keep their width and prevent duplicate submission.

### Keyboard behavior

- Tab order follows the visible hierarchy: shell navigation, command row, collection context, workspace controls, then assets.
- Focus indicators use a two-pixel contrast-safe semantic ring with an offset; hover is never the only interaction signal.
- `Escape` closes the topmost non-destructive sheet, menu, or dialog and returns focus to its opener.
- List rows do not use a bare `div onClick`. Native links and buttons carry every action.
- Optional shortcuts are discoverable and never replace standard keyboard access.

## 6. Required states

Every implemented workbench region must visibly and semantically cover:

- **Initial loading:** layout-stable skeletons that resemble the list, with one announced loading state.
- **Populated:** clear collection context, result count, asset actions, and pagination status.
- **True empty library:** concise explanation plus one primary creation action; no fabricated metrics or sample data presented as user content.
- **No search/filter results:** retain the query and filters, explain that nothing matches, and offer reset without presenting the new-user empty state.
- **Recoverable error:** preserve safe content, explain which operation failed, and provide retry.
- **Offline or stale response:** distinguish last-known content from confirmed fresh content when detectable.
- **Permission or publication restriction:** state the boundary without revealing another user's private asset.

Animations are limited to state continuity in the 150ms to 220ms range and are removed or reduced under `prefers-reduced-motion`.

## 7. WCAG 2.2 AA acceptance

The following are release requirements, not optional polish:

- Text and interactive-state contrast meet WCAG 2.2 AA; automated results are supplemented by manual checks of focus, disabled, placeholder, and selected states.
- Every control has a programmatic name, and every field has a correctly associated label or equivalent accessible name.
- Information, errors, selection, and visibility never depend on color alone.
- The complete create, find, filter, open, collection, publish, and delete paths work with a keyboard.
- Focus is never obscured by sticky regions and remains visible at 200% zoom.
- Touch targets are at least 44px by 44px unless the WCAG spacing exception is deliberately satisfied and documented.
- Headings and landmarks form a meaningful outline; the page language and any mixed-language labels are correct.
- Status, loading, and validation feedback is announced without moving focus unexpectedly.
- At 320 CSS pixels wide and 400% zoom, content reflows without two-dimensional scrolling except for genuinely two-dimensional content.
- Reduced motion, high-contrast user settings, and light/dark system preferences remain usable.

## 8. Visual and behavioral verification matrix

Capture and review the populated, empty, filtered-empty, loading, error, menu, dialog, selected, focus-visible, and destructive-confirmation states in both light and dark themes.

| Width | Primary verification |
| --- | --- |
| 360px | Small-phone reflow, collection sheet, action reachability, no horizontal clipping |
| 390px | Typical-phone spacing, 44px targets, long Chinese prompt titles |
| 768px | Tablet transition, toolbar wrapping, collection access, keyboard focus order |
| 1024px | First desktop composition, rail/workspace balance, readable line length |
| 1280px | Primary desktop baseline, density, whitespace, list scanning |
| 1440px | Large-screen width cap, no stretched prose or empty decorative acreage |

Also verify 200% browser zoom at 1280px, 400% zoom/reflow at 1280px where applicable, keyboard-only operation, a screen-reader smoke path, and `prefers-reduced-motion`.

## 9. Explicit exclusions for this batch

This design decision does not change database tables, ownership rules, publication persistence, collection cardinality, prompt revision semantics, autosave conflict handling, AI reservation accounting, or provider dispatch. It does not implement `/studio` or redirect compatibility routes.

Those behaviors remain governed by the SOTA upgrade plan and require their own migrations, service contracts, tests, commits, and release gates. The `/prompts` redesign must preserve the current API contract until a separately reviewed domain batch changes it.

## 10. Implementation acceptance checklist

- The homepage retains its current structure.
- Authenticated product surfaces resolve through one Claude-inspired semantic token system with light and dark modes only.
- `/prompts` presents collections plus an editorial asset workspace and contains no KPI card wall.
- The supplied ink, paper, accent, serif, and monospace choices are represented through semantic roles with safe fallbacks.
- `accent-strong` rather than raw `accent` carries small accent text and thin focus treatment.
- Desktop, tablet, and mobile structures match this decision instead of merely shrinking the same grid.
- Loading, empty, no-results, error, menu, dialog, destructive, and focus states are verified.
- WCAG 2.2 AA keyboard, naming, target-size, contrast, reflow, and reduced-motion gates pass.
- No database, revision, Studio, or deployment behavior is silently changed by the visual batch.

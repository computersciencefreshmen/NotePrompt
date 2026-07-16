---
name: NotePrompt
description: A restrained, precise prompt production workbench for serious AI knowledge work.
colors:
  action: "light-dark(oklch(0.5109 0.0861 186.39), oklch(0.7845 0.1325 181.91))"
  action-hover: "light-dark(oklch(0.4370 0.0705 188.22), oklch(0.8549 0.1251 181.07))"
  on-action: "light-dark(oklch(0.9833 0.0025 165.08), oklch(0.1658 0.0174 181.85))"
  canvas: "light-dark(oklch(0.9833 0.0025 165.08), oklch(0.1658 0.0174 181.85))"
  surface: "light-dark(oklch(0.9687 0.0078 139.44), oklch(0.1957 0.0195 177.89))"
  surface-raised: "light-dark(oklch(0.9923 0.0025 165.08), oklch(0.2348 0.0253 178.14))"
  text: "light-dark(oklch(0.1408 0.0044 285.82), oklch(0.9836 0.0142 180.72))"
  text-muted: "light-dark(oklch(0.4419 0.0146 285.79), oklch(0.7782 0.0280 176.10))"
  border: "light-dark(oklch(0.9197 0.0040 286.32), oklch(0.3268 0.0378 179.38))"
  focus: "light-dark(oklch(0.5109 0.0861 186.39), oklch(0.7845 0.1325 181.91))"
  attention: "light-dark(oklch(0.8790 0.1534 91.61), oklch(0.8790 0.1534 91.61))"
  destructive: "light-dark(oklch(0.5771 0.2152 27.33), oklch(0.7106 0.1661 22.22))"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 900
    lineHeight: 0.98
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.12em"
rounded:
  sm: "6px"
  md: "8px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "24px"
---

# Design System: NotePrompt

## Overview

**Creative North Star: "The Precision Workbench"**

NotePrompt should feel like a calibrated instrument on a knowledge worker's desk: quiet at rest, dense only where the task demands it, and unambiguous when state changes. The existing homepage supplies the visual anchor through teal-tinted neutrals, compact eight-pixel geometry, strong sans-serif hierarchy, and a small amber signal color. The authenticated product carries that character into a predictable App Shell and Prompt Studio.

The system rejects generic AI SaaS marketing, fragmented CRUD dashboards, four interchangeable visual skins, endless identical card grids, and modal-first workflows. Light and dark are two expressions of one semantic system, not separate brands. Motion communicates state in 150 to 220 milliseconds and disappears under reduced-motion preferences.

**Key Characteristics:**

- Restrained teal accent used for action, selection, focus, and verified status.
- Tinted neutral canvases that remain comfortable during long editing sessions.
- Compact six and eight-pixel geometry with clear hierarchy instead of decoration.
- Familiar product affordances, keyboard reliability, and explicit system feedback.
- Responsive structure that changes panels and navigation, not merely type size.

## Colors

The palette is a cool, inked work surface with one teal operational voice and one amber attention signal. Every component consumes the same semantic roles in both themes. The machine-readable tokens use CSS `light-dark()` with OKLCH endpoints because a single role must not fork into light and dark component variants.

### Primary

- **Action:** Instrument Teal in light mode and Signal Teal in dark mode. The role is reserved for controls, active navigation, links, focus, and verified operational state.
- **On Action:** A theme-aware tinted neutral that preserves contrast without pure white or pure black.

### Secondary

- **Attention Amber:** A sparse semantic signal for roadmap status, warnings, and information that needs inspection. It is never decorative.

### Neutral

- **Canvas / Surface / Surface Raised:** Paper Mist resolves to layered tinted neutrals in light mode; Green Ink resolves to three dark tonal levels. The role names never change with theme.
- **Text / Text Muted:** High-contrast primary text and quieter explanatory text resolve through the same two semantic roles.
- **Border:** Quiet Rules divide controls and persistent regions; they do not frame every paragraph.

**The One Operational Voice Rule.** Teal may occupy no more than ten percent of a product screen. If everything calls for attention, the interface has lost its hierarchy.

**The Two-Theme Rule.** Only light and dark are supported. Workbench, editorial, dashboard, and lightweight skins are transitional code to remove, not styles to extend.

**The State Before Decoration Rule.** Amber and red communicate real attention or failure. They never decorate headings, pricing blocks, or empty states.

## Typography

**Display Font:** System UI sans-serif with native platform fallbacks

**Body Font:** System UI sans-serif with native platform fallbacks

**Character:** One highly legible sans family keeps the tool native, fast, and quiet. Scale, weight, spacing, and width establish hierarchy. Display treatment belongs to the retained marketing homepage; product labels remain compact and familiar.

### Hierarchy

- **Display** (900, 4.5rem, 0.98): Homepage hero only, with a smaller responsive step below desktop.
- **Headline** (800, 2.25rem, 1.1): Major marketing sections and rare product workspace titles.
- **Title** (600, 1.125rem, 1.4): Panel titles, editor sections, and collection names.
- **Body** (400, 1rem, 1.5): Product content and prose, capped at 70 characters where continuous reading matters.
- **Label** (600, 0.75rem, 1.25): Compact metadata and eyebrows. Uppercase with wide tracking is limited to marketing or diagnostic labels.

**The Quiet Hierarchy Rule.** Product UI uses fixed sizes and clear weight contrast. Display-scale typography, all-caps labels, and extra-black weights cannot spread into routine controls.

## Elevation

Tonal layering and one-pixel borders establish the normal hierarchy. A low ambient shadow is permitted for menus, command surfaces, and hover feedback. The broad lifted shadow from the homepage preview is reserved for that signature product demonstration and must not become a default card treatment.

### Shadow Vocabulary

- **Ambient Low** (`box-shadow: 0 1px 2px rgb(6 17 15 / 0.08)`): Menus, controls, and small floating surfaces.
- **Ambient Lift** (`box-shadow: 0 18px 48px rgb(15 118 110 / 0.12)`): Homepage product preview or one deliberately dominant floating work surface.

**The Flat by Default Rule.** Persistent panels and cards are flat at rest. If a screen looks like stacked floating tiles, elevation has been overused.

## Components

Components are refined and restrained. Each interactive primitive must implement default, hover, focus-visible, active, disabled, loading, and error behavior where applicable.

### Buttons

- **Shape:** Compact rounded rectangle (8px), never a decorative pill except for binary segmented choices.
- **Primary:** Instrument Teal with a 36px default height; primary mobile actions use at least 44px touch height.
- **Hover / Focus:** Darken or lighten the same teal role. Use a two-pixel focus outline with two-pixel offset and a 150ms to 220ms exponential ease-out transition.
- **Secondary / Ghost:** Neutral surfaces and borders carry secondary hierarchy. Ghost actions gain a tonal hover surface, not a shadow.

### Chips

- **Style:** Six-pixel corners, compact label typography, and a quiet border or tonal fill.
- **State:** Selection changes background, text contrast, and icon or check state. Color alone is insufficient.

### Cards / Containers

- **Corner Style:** Eight-pixel corners for asset groups and marketing modules.
- **Background:** Tinted canvas or semantic surface, never pure black or pure white.
- **Shadow Strategy:** Flat by default; use Ambient Low only when the surface must float.
- **Border:** One-pixel semantic rule where separation cannot be achieved by tone.
- **Internal Padding:** 16px for compact product regions, 24px for marketing or spacious editor regions.

### Inputs / Fields

- **Style:** 36px desktop height, eight-pixel corners, transparent or tinted surface, and a one-pixel input border.
- **Focus:** Visible two-pixel semantic outline without layout shift.
- **Error / Disabled:** Error includes text and icon; disabled retains readable contrast and explains why when the reason is not obvious.

### Navigation

- **Style:** Authenticated navigation uses a standard left rail plus a top search and quick-create bar. Active state combines teal, weight, and a semantic indicator. Mobile navigation becomes a reliable sheet or bottom-level task switcher with 44px targets.

### Prompt Studio

- **Style:** Desktop uses a collection rail, central editor and comparison surface, and contextual inspector. Mobile exposes Editor, Optimize, and Inspector as three switchable panels. Panel visibility and save state remain in the URL or durable draft state where recovery matters.

## Do's and Don'ts

### Do:

- **Do** preserve the current homepage structure and use its teal, ink, amber, compact geometry, and strong hierarchy as the brand anchor.
- **Do** use one semantic token vocabulary across light and dark themes, with reliable focus and state contrast.
- **Do** make creation, optimization, comparison, checkpoints, collections, and publication feel like one continuous workflow.
- **Do** use familiar controls, explicit labels, non-color state cues, reduced motion, and 44px mobile touch targets.
- **Do** use progressive disclosure for professional fields, model parameters, attachments, versions, and diagnostics.

### Don't:

- **Don't** introduce generic AI SaaS marketing built from purple gradients, glowing blobs, glass panels, and unsupported superlatives.
- **Don't** recreate fragmented CRUD dashboards where creation, optimization, versions, publishing, and discovery feel like unrelated products.
- **Don't** preserve four interchangeable visual skins that override one another and make component behavior unpredictable.
- **Don't** build endless identical card grids, nested cards, decorative metrics, or modal-first workflows.
- **Don't** ship controls that imply saved privacy, notification, billing, or collaboration behavior when the backend does not persist it.
- **Don't** publish product copy that sells Pro, Team, or commercial capabilities which are only roadmap ideas.
- **Don't** use colored side-stripe borders, gradient text, decorative glassmorphism, pure black, or pure white.

export type VisualStyle = 'workbench'

export type LegacyVisualStyle = 'workbench' | 'editorial' | 'dashboard' | 'lightweight'

export type VisualStyleOption = {
  value: VisualStyle
  label: string
  note: string
}

const LEGACY_VISUAL_STYLES = new Set<LegacyVisualStyle>([
  'workbench',
  'editorial',
  'dashboard',
  'lightweight',
])

export const DEFAULT_VISUAL_STYLE: VisualStyle = 'workbench'

// One product system replaces the former selectable skins. Keep the
// `workbench` wire value for one release so cached clients remain compatible.
export const visualStyleOptions: VisualStyleOption[] = [
  {
    value: 'workbench',
    label: 'Claude 风格工作台',
    note: '温暖纸张、克制陶土色与适合长时间阅读的编辑体验',
  },
]

export const visualStyleClasses: Record<VisualStyle, {
  page: string
  grid: string
  card: string
  editor: string
  softPanel: string
  primaryButton: string
  accent: string
}> = {
  workbench: {
    page: 'bg-[var(--np-canvas)]',
    grid: 'opacity-[0.035] dark:opacity-[0.04]',
    card: 'border-[var(--np-rule)] bg-[var(--np-surface)] shadow-none',
    editor: 'border-[var(--np-rule)] bg-[var(--np-surface-raised)]',
    softPanel: 'border-[var(--np-rule)] bg-[var(--np-surface-soft)]',
    primaryButton: 'bg-[var(--np-accent)] text-[var(--np-ink)] hover:bg-[var(--np-accent-hover)]',
    accent: 'bg-[var(--np-accent)] text-[var(--np-ink)] hover:bg-[var(--np-accent-hover)]',
  },
}

export function isVisualStyle(value: string): value is VisualStyle {
  return value === DEFAULT_VISUAL_STYLE
}

export function normalizeVisualStyle(value: unknown): VisualStyle {
  void value
  return DEFAULT_VISUAL_STYLE
}

export function isLegacyVisualStyle(value: unknown): value is LegacyVisualStyle {
  return typeof value === 'string' && LEGACY_VISUAL_STYLES.has(value as LegacyVisualStyle)
}

export function getVisualStyleLabel(_value: VisualStyle) {
  return visualStyleOptions[0].label
}

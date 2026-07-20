import type { EditMode } from '@/types'

export type VisualStylePreference = 'workbench'
export type ThemePreference = 'light' | 'dark' | 'system'
export type LocalePreference = 'zh-CN' | 'en-US'

const LEGACY_VISUAL_STYLES = new Set([
  'workbench',
  'editorial',
  'dashboard',
  'lightweight',
])

export type UserPreferencesDto = {
  locale: LocalePreference
  theme: ThemePreference
  defaultEditorMode: EditMode
  visualStyle: VisualStylePreference
}

export type UserPreferencesUpdate = Partial<UserPreferencesDto>

export const DEFAULT_USER_PREFERENCES: UserPreferencesDto = {
  locale: 'zh-CN',
  theme: 'light',
  defaultEditorMode: 'normal',
  visualStyle: 'workbench',
}

const ALLOWED_KEYS = new Set(['locale', 'theme', 'defaultEditorMode', 'visualStyle'])

export function normalizeUserPreferencesRow(
  row?: Record<string, unknown> | null,
): UserPreferencesDto {
  const locale = row?.locale === 'en-US' ? 'en-US' : 'zh-CN'
  const theme: ThemePreference = ['light', 'dark', 'system'].includes(String(row?.theme))
    ? row?.theme as ThemePreference
    : DEFAULT_USER_PREFERENCES.theme
  const defaultEditorMode = row?.default_editor_mode === 'professional'
    ? 'professional'
    : 'normal'
  // All historical visual styles now resolve to the single product system.
  // The wire value intentionally stays `workbench` for cached-client safety.
  const visualStyle: VisualStylePreference = 'workbench'

  return { locale, theme, defaultEditorMode, visualStyle }
}

export function parseUserPreferencesUpdate(input: unknown): UserPreferencesUpdate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('偏好设置必须是 JSON 对象')
  }

  const source = input as Record<string, unknown>
  if (Object.keys(source).some((key) => !ALLOWED_KEYS.has(key))) {
    throw new TypeError('偏好设置包含不支持的字段')
  }

  const update: UserPreferencesUpdate = {}
  if (source.locale !== undefined) {
    if (source.locale !== 'zh-CN' && source.locale !== 'en-US') {
      throw new TypeError('语言偏好无效')
    }
    update.locale = source.locale
  }
  if (source.theme !== undefined) {
    if (!['light', 'dark', 'system'].includes(String(source.theme))) {
      throw new TypeError('主题偏好无效')
    }
    // `system` remains a one-release wire compatibility marker. New clients
    // resolve it against the device and immediately rewrite light or dark.
    update.theme = source.theme as ThemePreference
  }
  if (source.defaultEditorMode !== undefined) {
    if (source.defaultEditorMode !== 'normal' && source.defaultEditorMode !== 'professional') {
      throw new TypeError('默认编辑模式无效')
    }
    update.defaultEditorMode = source.defaultEditorMode
  }
  if (source.visualStyle !== undefined) {
    if (typeof source.visualStyle !== 'string' || !LEGACY_VISUAL_STYLES.has(source.visualStyle)) {
      throw new TypeError('界面风格无效')
    }
    update.visualStyle = 'workbench'
  }

  if (Object.keys(update).length === 0) {
    throw new TypeError('没有可更新的偏好设置')
  }
  return update
}

export function mergeUserPreferences(
  current: UserPreferencesDto,
  update: UserPreferencesUpdate,
): UserPreferencesDto {
  return { ...current, ...update }
}

export function serializePreferenceExtras(preferences: UserPreferencesDto): string {
  return JSON.stringify({ visualStyle: preferences.visualStyle })
}

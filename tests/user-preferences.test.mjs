import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_USER_PREFERENCES,
  mergeUserPreferences,
  normalizeUserPreferencesRow,
  parseUserPreferencesUpdate,
  serializePreferenceExtras,
} from '../src/lib/user-preferences.ts'

test('preferences normalize legacy and malformed database values safely', () => {
  assert.deepEqual(normalizeUserPreferencesRow(), DEFAULT_USER_PREFERENCES)
  assert.deepEqual(normalizeUserPreferencesRow({
    locale: 'en-US',
    theme: 'dark',
    default_editor_mode: 'professional',
    preferences: JSON.stringify({ visualStyle: 'editorial', ignored: true }),
  }), {
    locale: 'en-US',
    theme: 'dark',
    defaultEditorMode: 'professional',
    visualStyle: 'editorial',
  })
  assert.equal(normalizeUserPreferencesRow({ preferences: '{bad-json' }).visualStyle, 'workbench')
})

test('preference updates reject unknown and invalid fields', () => {
  assert.throws(() => parseUserPreferencesUpdate({ admin: true }), /不支持/)
  assert.throws(() => parseUserPreferencesUpdate({ theme: 'midnight' }), /主题/)
  assert.throws(() => parseUserPreferencesUpdate({}), /没有可更新/)
})

test('preference updates merge and serialize only supported extras', () => {
  const update = parseUserPreferencesUpdate({
    theme: 'light',
    visualStyle: 'lightweight',
  })
  const merged = mergeUserPreferences(DEFAULT_USER_PREFERENCES, update)
  assert.equal(merged.theme, 'light')
  assert.equal(merged.visualStyle, 'lightweight')
  assert.deepEqual(JSON.parse(serializePreferenceExtras(merged)), {
    visualStyle: 'lightweight',
  })
})

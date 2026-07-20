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
    visualStyle: 'workbench',
  })
  assert.equal(normalizeUserPreferencesRow({ theme: 'system' }).theme, 'system')
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
  assert.equal(merged.visualStyle, 'workbench')
  assert.deepEqual(JSON.parse(serializePreferenceExtras(merged)), {
    visualStyle: 'workbench',
  })
})

test('cached clients may submit legacy preferences but receive the canonical product system', () => {
  for (const legacyStyle of ['workbench', 'editorial', 'dashboard', 'lightweight']) {
    assert.deepEqual(parseUserPreferencesUpdate({ visualStyle: legacyStyle }), {
      visualStyle: 'workbench',
    })
  }

  assert.deepEqual(parseUserPreferencesUpdate({ theme: 'system' }), { theme: 'system' })
  assert.throws(() => parseUserPreferencesUpdate({ visualStyle: 'claude' }), /界面风格/)
})

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  DEFAULT_VISUAL_STYLE,
  normalizeVisualStyle,
  visualStyleOptions,
} from '../src/config/visual-styles.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')

test('legacy visual styles collapse to one cached-client-safe workbench value', () => {
  assert.equal(DEFAULT_VISUAL_STYLE, 'workbench')
  assert.deepEqual(visualStyleOptions.map(option => option.value), ['workbench'])
  for (const legacyStyle of ['workbench', 'editorial', 'dashboard', 'lightweight', 'unknown']) {
    assert.equal(normalizeVisualStyle(legacyStyle), 'workbench')
  }
})

test('Claude product tokens are scoped away from the marketing homepage', () => {
  const styles = read('src/app/globals.css')
  const shell = read('src/components/AppShell.tsx')
  const homepage = read('src/app/page.tsx')

  assert.match(styles, /\.np-product-surface,\s*\nbody:has\(\.np-product-surface\) \.np-product-portal/)
  assert.match(styles, /--np-canvas: #efede6/)
  assert.match(styles, /--np-surface: #f5f4ee/)
  assert.match(styles, /--np-ink: #141413/)
  assert.match(styles, /--np-accent: #da7756/)
  assert.match(styles, /--np-accent-strong: #9b523a/)
  assert.match(styles, /ui-serif, Georgia, Cambria/)
  assert.doesNotMatch(styles, /html\[data-visual-style/)
  assert.match(shell, /productRoute \? \(/)
  assert.match(shell, /className="np-product-surface min-h-screen"/)
  assert.doesNotMatch(homepage, /np-product-surface/)
})

test('product portals and local preference migration inherit the canonical theme', () => {
  for (const file of [
    'src/components/ui/select.tsx',
    'src/components/ui/dialog.tsx',
    'src/components/ui/dropdown-menu.tsx',
    'src/components/ui/toaster.tsx',
  ]) {
    assert.match(read(file), /np-product-portal/, file)
  }

  const uiSettings = read('src/contexts/UISettingsContext.tsx')
  const toggle = read('src/components/ThemeToggle.tsx')
  const header = read('src/components/Header.tsx')
  assert.match(uiSettings, /delete document\.documentElement\.dataset\.visualStyle/)
  assert.doesNotMatch(uiSettings, /dataset\.visualStyle\s*=/)
  assert.doesNotMatch(toggle, /setTheme\('system'\)/)
  assert.doesNotMatch(header, /visualStyleOptions|界面风格|Interface Style/)
})

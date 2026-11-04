import test from 'node:test'
import assert from 'node:assert/strict'
import { ESLint } from 'eslint'
import { createRequire } from 'node:module'

test('patched matcher retains React lint enforcement and ignore patterns', async () => {
  const lint = new ESLint({ overrideConfig: { rules: {
    'react/jsx-pascal-case': ['error', { ignore: ['Allowed*'] }],
  } } })
  const [invalid] = await lint.lintText('const Bad_component = () => null; export default function View() { return <Bad_component /> }', { filePath: 'src/fixture.tsx' })
  assert.ok(invalid.messages.some(message => message.ruleId === 'react/jsx-pascal-case' && message.severity === 2))
  const [allowed] = await lint.lintText('const Allowed_component = () => null; export default function View() { return <Allowed_component /> }', { filePath: 'src/fixture.tsx' })
  assert.ok(!allowed.messages.some(message => message.ruleId === 'react/jsx-pascal-case'))
  const { Minimatch } = createRequire(import.meta.url)('minimatch')
  assert.equal(new Minimatch('src/**').match('src/fixture.tsx'), true)
})

test('patched matcher preserves import ordering path groups', async () => {
  const lint = new ESLint({ overrideConfig: { rules: {
    'import/order': ['error', {
      pathGroups: [{ pattern: '@/lib/**', group: 'internal', position: 'before' }],
      pathGroupsExcludedImportTypes: ['builtin'],
      'newlines-between': 'always',
    }],
  } } })
  const [result] = await lint.lintText("import sibling from './sibling'\nimport internal from '@/lib/value'\nexport const fixture = [sibling, internal]\n", { filePath: 'src/fixture.ts' })
  assert.ok(result.messages.some(message => message.ruleId === 'import/order' && message.severity === 2))
})

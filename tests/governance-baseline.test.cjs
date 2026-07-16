'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')

test('product baseline captures the accepted register, users, and non-goals', () => {
  const product = read('PRODUCT.md')

  assert.match(product, /## Register\s+product/)
  assert.match(product, /developers, researchers, and content or operations professionals/)
  assert.match(product, /Restrained, precise, trustworthy\./)
  assert.match(product, /does not build Team workspaces, payments, real-time collaboration, Kubernetes/)
  assert.match(product, /WCAG 2\.2 AA/)

  for (const section of [
    'Users',
    'Product Purpose',
    'Brand Personality',
    'Anti-references',
    'Design Principles',
    'Accessibility & Inclusion',
  ]) {
    assert.match(product, new RegExp(`## ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  }
})

test('design baseline exposes one two-theme system in Stitch-compatible section order', () => {
  const design = read('DESIGN.md')
  const sectionNames = [...design.matchAll(/^## (.+)$/gm)].map(match => match[1])

  assert.deepEqual(sectionNames, [
    'Overview',
    'Colors',
    'Typography',
    'Elevation',
    'Components',
    "Do's and Don'ts",
  ])
  assert.match(design, /^---\r?\nname: NotePrompt/m)
  const colorBlock = design.match(/colors:\r?\n([\s\S]*?)typography:/)?.[1]
  assert.ok(colorBlock)
  const colorEntries = [...colorBlock.matchAll(/^  ([\w-]+): "(.+)"$/gm)]
  assert.ok(colorEntries.length >= 10)
  for (const [, name, value] of colorEntries) {
    assert.doesNotMatch(name, /-(?:light|dark)$/)
    assert.match(value, /^light-dark\(oklch\(.+\), oklch\(.+\)\)$/)
  }
  assert.doesNotMatch(design, /button-primary-dark/)
  assert.match(design, /The Two-Theme Rule/)
  assert.match(design, /Only light and dark are supported/)
  assert.doesNotMatch(design, /(?:^|\s)#(?:000|000000|fff|ffffff)(?:\s|$|["'])/i)
})

test('impeccable sidecar carries extensions and interactive component states', () => {
  const sidecar = JSON.parse(read('.impeccable/design.json'))

  assert.equal(sidecar.schemaVersion, 2)
  assert.equal(sidecar.title, 'Design System: NotePrompt')
  assert.equal(sidecar.extensions.semanticContract.colorSpace, 'OKLCH')
  assert.equal(sidecar.extensions.semanticContract.themeFunction, 'light-dark()')
  assert.deepEqual(
    Object.keys(sidecar.extensions.themes.light).sort(),
    Object.keys(sidecar.extensions.themes.dark).sort(),
  )
  assert.deepEqual(
    Object.keys(sidecar.extensions.colorMeta).sort(),
    Object.keys(sidecar.extensions.themes.light).sort(),
  )
  assert.ok(Object.keys(sidecar.extensions.colorMeta).length >= 10)
  assert.ok(sidecar.extensions.motion.length >= 2)
  assert.ok(sidecar.components.length >= 5)
  for (const component of sidecar.components) {
    assert.match(component.html, /ds-/)
    assert.match(component.css, /\.ds-/)
    assert.match(component.css, /color-scheme: light dark/)
    assert.match(component.css, /light-dark\(oklch\(/)
    assert.match(component.css, /var\(--np-/)
    assert.doesNotMatch(component.css, /#[0-9a-f]{3,8}/i)
    assert.match(component.css, /:focus-visible/)
  }
})

test('SOTA plan and ADR index resolve every accepted decision record', () => {
  const readme = read('README.md')
  const plan = read('docs/plans/2026-07-16-sota-upgrade-plan.md')
  const index = read('docs/adr/README.md')

  assert.match(readme, /\[PRODUCT\.md\]\(\.\/PRODUCT\.md\)/)
  assert.match(readme, /\[DESIGN\.md\]\(\.\/DESIGN\.md\)/)
  assert.match(readme, /docs\/plans\/2026-07-16-sota-upgrade-plan\.md/)
  assert.match(readme, /docs\/adr\/README\.md/)
  assert.match(plan, /commit `c40b9d879fb61c91d650a9ba1013104ae2c69791`/)
  assert.match(plan, /Stages 1C and 3 require production authority/)
  assert.match(plan, /Migrations `001` through `009` are the applied schema history\. They are immutable\./)
  assert.match(plan, /legacy projection containment and same-tenant integrity stay clean/)
  assert.doesNotMatch(plan, /compatibility reads have zero difference/)

  for (let number = 1; number <= 7; number += 1) {
    const id = String(number).padStart(4, '0')
    const match = index.match(new RegExp(`\\[${id}\\]\\(([^)]+)\\)`))
    assert.ok(match, `ADR index must contain ${id}`)
    assert.ok(fs.existsSync(path.join(projectRoot, 'docs', 'adr', match[1])), `ADR ${id} target must exist`)
  }
})

test('publication and collection ADRs close ownership, snapshot, and compatibility semantics', () => {
  const publications = read('docs/adr/0003-model-publications-as-source-linked-snapshots.md')
  const collections = read('docs/adr/0004-canonicalize-prompt-collections.md')

  assert.match(publications, /unique constraint on the non-null source ID itself/)
  assert.match(publications, /`editor_mode`, `payload`, and `schema_version`/)
  assert.match(publications, /`publication_state` with exactly `published` and `withdrawn`/)
  assert.match(publications, /WHERE id = \? AND user_id = \? FOR UPDATE/)
  assert.match(publications, /derives `author_id` from the authenticated user/)

  assert.match(collections, /one-version lossy compatibility projection/)
  assert.match(collections, /Extra canonical memberships are expected/)
  assert.match(collections, /containment and ownership rather than impossible set equality/)
  assert.match(collections, /never deletes additional canonical memberships/)
  assert.doesNotMatch(collections, /zero-difference evidence/)
})

'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '..')
const manifestPath = path.join(
  projectRoot,
  'database',
  'migrations',
  '008_curated_catalog_manifest.json'
)
const migrationPath = path.join(
  projectRoot,
  'database',
  'migrations',
  '008_separate_curated_catalog.cjs'
)
const manifest = require(manifestPath)
const migration = require(migrationPath)
const {
  checksum,
  loadMigrations,
} = require('../scripts/lib/mysql-migration-runner.cjs')

function loadTypeScriptData(relativePath, exportName) {
  const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const loaded = { exports: {} }
  const evaluate = new Function('require', 'module', 'exports', output)
  evaluate(() => ({}), loaded, loaded.exports)
  return loaded.exports[exportName]
}

function fingerprint(prompt) {
  return crypto.createHash('sha256')
    .update(
      [prompt.title, prompt.content, prompt.description || ''].join(String.fromCharCode(31)),
      'utf8'
    )
    .digest('hex')
}

test('migration manifest exactly matches every reviewed curated prompt', () => {
  const prompts = [
    ...loadTypeScriptData(
      'src/data/english-featured-prompts.ts',
      'englishFeaturedPrompts'
    ),
    ...loadTypeScriptData(
      'src/data/chinese-featured-prompts.ts',
      'chineseFeaturedPrompts'
    ),
  ]
  assert.equal(manifest.length, prompts.length)
  assert.equal(new Set(manifest.map(entry => entry.catalogId)).size, manifest.length)

  const manifestById = new Map(manifest.map(entry => [entry.catalogId, entry]))
  for (const prompt of prompts) {
    assert.deepEqual(manifestById.get(prompt.id), {
      catalogId: prompt.id,
      contentSha256: fingerprint(prompt),
      legacyPublishedAt: prompt.created_at,
      initialViews: prompt.views_count || 0,
    })
  }
})

test('migration checksum covers the catalog manifest bytes', () => {
  const migrationSource = fs.readFileSync(migrationPath)
  const manifestSource = fs.readFileSync(manifestPath)
  const expected = checksum(Buffer.concat([
    migrationSource,
    Buffer.from('./008_curated_catalog_manifest.json'),
    manifestSource,
  ]))
  const discovered = loadMigrations().find(item => item.version === '008')
  assert.ok(discovered)
  assert.equal(discovered.checksum, expected)
  assert.notEqual(discovered.checksum, checksum(migrationSource))
})

test('legacy classifier preserves a genuine publication at a colliding high ID', () => {
  const prompts = loadTypeScriptData(
    'src/data/english-featured-prompts.ts',
    'englishFeaturedPrompts'
  )
  const prompt = prompts[0]
  const entry = manifest.find(item => item.catalogId === prompt.id)
  assert.ok(entry)

  const exactLegacyRow = {
    id: prompt.id,
    title: prompt.title,
    content: prompt.content,
    description: prompt.description,
    isFeatured: 1,
    categoryId: null,
    createdAt: prompt.created_at,
    updatedAt: prompt.updated_at,
  }
  assert.equal(migration._test.isVerifiedLegacyCuratedRow(exactLegacyRow, entry), true)

  // This models the dangerous production case: AUTO_INCREMENT allocated the same high ID
  // first, then the old upsert overwrote mutable fields but could not rewrite created_at.
  const realHighPublication = {
    ...exactLegacyRow,
    createdAt: '2026-05-24T08:30:00.000Z',
  }
  assert.equal(
    migration._test.isVerifiedLegacyCuratedRow(realHighPublication, entry),
    false
  )
  assert.equal(
    migration._test.isVerifiedLegacyCuratedRow(
      { ...exactLegacyRow, title: 'A real user publication' },
      entry
    ),
    false
  )
  assert.equal(
    migration._test.isVerifiedLegacyCuratedRow(
      { ...exactLegacyRow, id: 990001 },
      entry
    ),
    false
  )
})

test('migration SQL claims only verified rows and never resets the business sequence', async () => {
  const events = []
  const context = {
    ensureTable: async (name, sql) => events.push({ kind: 'table', name, sql }),
    exec: async (sql, parameters = []) => events.push({ kind: 'exec', sql, parameters }),
  }
  await migration.up(context)

  assert.deepEqual(
    events.filter(event => event.kind === 'table').map(event => event.name),
    [
      'curated_catalog_entries',
      'curated_prompt_favorites',
      'curated_prompt_legacy_rows',
    ]
  )
  const sql = events.map(event => event.sql || '').join('\n')
  const candidateSql = events.find(event => (
    event.kind === 'exec'
    && /INSERT INTO tmp_verified_legacy_curated_prompts/.test(event.sql)
  )).sql
  assert.match(candidateSql, /catalog\.catalog_id = publication\.id/)
  assert.match(candidateSql, /publication\.is_featured = 1/)
  assert.match(candidateSql, /publication\.category_id IS NULL/)
  assert.match(candidateSql, /publication\.created_at = catalog\.legacy_published_at/)
  assert.match(candidateSql, /publication\.created_at = publication\.updated_at/)
  assert.match(candidateSql, /DATE_ADD\(catalog\.legacy_published_at, INTERVAL 8 HOUR\)/)
  assert.match(candidateSql, /SHA2\(/)
  assert.match(sql, /JOIN tmp_verified_legacy_curated_prompts verified/)
  assert.doesNotMatch(sql, /publication\.id\s*[<>]=?\s*9\d+/)
  assert.doesNotMatch(sql, /AUTO_INCREMENT\s*=/i)
})

test('runtime uses source-qualified catalog identity without fixed public primary keys', () => {
  const curatedService = fs.readFileSync(
    path.join(projectRoot, 'src/lib/curated-public-prompts.ts'),
    'utf8'
  )
  const publicList = fs.readFileSync(
    path.join(projectRoot, 'src/app/api/v1/public-prompts/route.ts'),
    'utf8'
  )
  const favorites = fs.readFileSync(
    path.join(projectRoot, 'src/app/api/v1/favorites/route.ts'),
    'utf8'
  )
  const singleImport = fs.readFileSync(
    path.join(projectRoot, 'src/app/api/v1/prompts/[id]/import/route.ts'),
    'utf8'
  )
  const batchImport = fs.readFileSync(
    path.join(projectRoot, 'src/app/api/v1/prompts/import/route.ts'),
    'utf8'
  )
  const promptCard = fs.readFileSync(
    path.join(projectRoot, 'src/components/PromptCard.tsx'),
    'utf8'
  )

  assert.doesNotMatch(curatedService, /INSERT INTO public_prompts/i)
  assert.match(curatedService, /INSERT INTO curated_catalog_entries/)
  assert.match(curatedService, /curated_prompt_favorites/)
  assert.doesNotMatch(publicList, /pp\.id\s*<\s*900000/)
  assert.match(publicList, /source: 'published'/)
  assert.match(publicList, /mergedPaginationWindow\(offset, limit, hydratedCuratedItems\.length\)/)
  assert.doesNotMatch(publicList, /const fetchLimit = offset \+ limit/)
  assert.match(favorites, /'published' AS source/)
  assert.match(favorites, /'curated' AS source/)
  assert.match(favorites, /resolvePublicPromptSource/)
  assert.match(singleImport, /source === 'curated'/)
  assert.match(singleImport, /entitlementLimitResponse\(error\)/)
  assert.match(batchImport, /const key = `\$\{source\}:\$\{id\}`/)
  assert.match(batchImport, /reason: 'QUOTA_EXCEEDED'/)
  assert.match(batchImport, /if \(successCount === 0\) return limitResponse/)
  assert.match(batchImport, /break/)
  assert.match(promptCard, /publicPrompt\.source/)
})

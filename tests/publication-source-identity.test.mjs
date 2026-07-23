import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(testDirectory, '..')
const migrationsDirectory = path.join(projectRoot, 'database', 'migrations')

const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
const databaseSource = read('src/lib/mysql-database.ts')

function methodSource(contents, methodName) {
  const start = contents.indexOf(`  async ${methodName}`)
  assert.notEqual(start, -1, `${methodName} must exist`)
  const nextMethod = contents.indexOf('\n  async ', start + 1)
  return contents.slice(start, nextMethod === -1 ? contents.length : nextMethod)
}

function sqlLiteralContaining(contents, marker) {
  const markerIndex = contents.indexOf(marker)
  assert.notEqual(markerIndex, -1, `missing SQL marker: ${marker}`)

  const templateStart = contents.lastIndexOf('`', markerIndex)
  const templateEnd = contents.indexOf('`', markerIndex + marker.length)
  if (templateStart >= 0 && templateEnd > markerIndex) {
    return contents.slice(templateStart + 1, templateEnd)
  }

  const candidates = ["'", '"']
    .map(quote => ({ quote, start: contents.lastIndexOf(quote, markerIndex) }))
    .filter(candidate => candidate.start >= 0)
    .sort((left, right) => right.start - left.start)
  assert.ok(candidates.length > 0, `missing SQL literal around: ${marker}`)

  const { quote, start } = candidates[0]
  const end = contents.indexOf(quote, markerIndex + marker.length)
  assert.ok(end > markerIndex, `unterminated SQL literal around: ${marker}`)
  return contents.slice(start + 1, end)
}

function migration010Source() {
  const migrationFiles = fs.readdirSync(migrationsDirectory)
    .filter(fileName => /^010_.+\.cjs$/.test(fileName))
  assert.equal(
    migrationFiles.length,
    1,
    'exactly one version 010 publication source-identity migration must exist',
  )
  return read(path.join('database', 'migrations', migrationFiles[0]))
}

test('migration 010 defines durable source identity and the two-state lifecycle', () => {
  const requirements = JSON.parse(read('database/schema-requirements.json'))
  const migration = migration010Source()

  assert.ok(requirements.schemaVersion >= 10)
  assert.ok(requirements.requiredMigrations.includes('010'))
  for (const column of [
    'source_prompt_id',
    'publication_state',
    'editor_mode',
    'payload',
    'schema_version',
  ]) {
    assert.ok(
      requirements.tables.public_prompts.includes(column),
      `public_prompts.${column} must be part of the runtime schema contract`,
    )
  }

  assert.match(migration, /source_prompt_id/i)
  assert.match(migration, /publication_state/i)
  assert.match(migration, /ENUM\(\s*['"]published['"]\s*,\s*['"]withdrawn['"]\s*\)/i)
  assert.match(migration, /source_prompt_id[\s\S]*REFERENCES\s+user_prompts\s*\(\s*id\s*\)[\s\S]*ON DELETE SET NULL/i)
  assert.ok(
    /UNIQUE(?:\s+INDEX|\s+KEY)?[\s\S]{0,200}source_prompt_id/i.test(migration)
      || /ensureIndex\([\s\S]{0,240}source_prompt_id[\s\S]{0,120}(?:true|unique)/i.test(migration),
    'source_prompt_id must have a unique non-null identity constraint',
  )
})

test('publishing locks the owned source and never infers identity from author and title', () => {
  const publish = methodSource(databaseSource, 'publishOwnedUserPrompts')
  const scalarOwnedSourceLock = /WHERE\s+(?:(?:\w+\.)?id\s*=\s*\?\s+AND\s+(?:\w+\.)?user_id\s*=\s*\?|(?:\w+\.)?user_id\s*=\s*\?\s+AND\s+(?:\w+\.)?id\s*=\s*\?)[\s\S]{0,120}FOR UPDATE/i
  const batchOwnedSourceLock = /WHERE\s+(?:(?:\w+\.)?user_id\s*=\s*\?\s+AND\s+(?:\w+\.)?id\s+IN\s*\(|(?:\w+\.)?id\s+IN\s*\([\s\S]{0,120}AND\s+(?:\w+\.)?user_id\s*=\s*\?)[\s\S]{0,160}FOR UPDATE/i

  assert.doesNotMatch(
    publish,
    /WHERE\s+(?:\w+\.)?title\s*=\s*\?\s+AND\s+(?:\w+\.)?author_id\s*=\s*\?/i,
  )
  assert.ok(
    scalarOwnedSourceLock.test(publish) || batchOwnedSourceLock.test(publish),
    'publishing must lock source IDs together with the authenticated owner',
  )
  if (batchOwnedSourceLock.test(publish)) {
    assert.match(publish, /ORDER BY\s+id[\s\S]{0,80}FOR UPDATE/i)
    assert.match(publish, /hasCompleteOwnership\(/)
  }
  assert.match(
    publish,
    /FROM\s+public_prompts[\s\S]{0,240}WHERE\s+(?:\w+\.)?source_prompt_id\s*=\s*\?[\s\S]{0,120}FOR UPDATE/i,
  )
})

test('republishing replaces every snapshot field and the complete tag membership atomically', () => {
  const publish = methodSource(databaseSource, 'publishOwnedUserPrompts')
  const insertSql = sqlLiteralContaining(publish, 'INSERT INTO public_prompts')
  const updateSql = sqlLiteralContaining(publish, 'UPDATE public_prompts')
  const snapshotColumns = [
    'source_prompt_id',
    'title',
    'content',
    'description',
    'category_id',
    'editor_mode',
    'payload',
    'schema_version',
    'publication_state',
  ]

  assert.match(publish, /beginTransaction\(\)/)
  assert.match(publish, /commit\(\)/)
  assert.match(publish, /rollback\(\)/)
  for (const column of snapshotColumns) {
    assert.match(insertSql, new RegExp(`\\b${column}\\b`, 'i'))
    assert.match(updateSql, new RegExp(`\\b${column}\\b`, 'i'))
  }
  assert.match(publish, /FROM\s+user_prompt_tags/i)
  assert.doesNotMatch(publish, /INSERT IGNORE INTO public_prompt_tags/i)
  const helperReplacement = publish.indexOf('replacePublicPromptTags(connection, publicPromptId,')
  const deleteTags = publish.indexOf('DELETE FROM public_prompt_tags WHERE public_prompt_id = ?')
  const insertTags = publish.indexOf('INSERT INTO public_prompt_tags (public_prompt_id, tag_id)')
  assert.ok(
    helperReplacement >= 0 || (deleteTags >= 0 && insertTags > deleteTags),
    'publishing must replace, not merge, the complete public tag membership',
  )
  const replacementEnd = helperReplacement >= 0 ? helperReplacement : insertTags
  assert.ok(
    replacementEnd < publish.indexOf('commit()'),
    'complete tag replacement must commit with the snapshot write',
  )
})

test('republishing a withdrawn source reuses its public row and restores published state', () => {
  const publish = methodSource(databaseSource, 'publishOwnedUserPrompts')
  const publicationLock = sqlLiteralContaining(publish, 'FROM public_prompts')
  const updateSql = sqlLiteralContaining(publish, 'UPDATE public_prompts')

  assert.match(publicationLock, /source_prompt_id\s*=\s*\?/i)
  assert.doesNotMatch(
    publicationLock,
    /publication_state\s*=\s*['"]published['"]/i,
  )
  assert.match(updateSql, /publication_state\s*=\s*['"]published['"]/i)
  assert.match(updateSql, /WHERE\s+(?:publication\.)?id\s*=\s*\?/i)
  assert.doesNotMatch(publish, /DELETE\s+FROM\s+public_prompts/i)
})

test('public and moderation projections never expose private source_prompt_id', () => {
  const projections = [
    ['anonymous list', read('src/app/api/v1/public-prompts/route.ts')],
    ['anonymous detail query', methodSource(databaseSource, 'getPublicPromptById')],
    ['favorites', read('src/app/api/v1/favorites/route.ts')],
    ['global search', methodSource(databaseSource, 'globalSearch')],
    ['moderation list', read('src/app/api/v1/admin/public-prompts/route.ts')],
    ['moderation detail', read('src/app/api/v1/admin/public-prompts/[id]/route.ts')],
    ['author publication list', read('src/app/api/v1/user/published-prompts/route.ts')],
  ]

  for (const [name, contents] of projections) {
    assert.doesNotMatch(
      contents,
      /SELECT\s+(?:pp|publication)\.\*/i,
      `${name} must use an explicit projection`,
    )
    assert.doesNotMatch(
      contents,
      /\bsource_prompt_id\b/i,
      `${name} must not expose private provenance`,
    )
  }
})

test('anonymous catalog and detail reads only return published rows', () => {
  const listRoute = read('src/app/api/v1/public-prompts/route.ts')
  const detailQuery = methodSource(databaseSource, 'getPublicPromptById')

  assert.match(
    listRoute,
    /pp\.publication_state\s*=\s*['"]published['"]/i,
  )
  assert.match(
    detailQuery,
    /WHERE\s+pp\.id\s*=\s*\?\s+AND\s+pp\.publication_state\s*=\s*['"]published['"]/i,
  )
})

test('favorites cannot list or newly attach withdrawn publications', () => {
  const favorites = read('src/app/api/v1/favorites/route.ts')
  const referenceSql = sqlLiteralContaining(favorites, "SELECT 'published' AS source")
  const totalSql = sqlLiteralContaining(
    favorites,
    '+ (SELECT COUNT(*) FROM curated_prompt_favorites',
  )
  const hydrationSql = sqlLiteralContaining(favorites, 'AND publication.id IN')

  assert.match(referenceSql, /JOIN\s+public_prompts/i)
  assert.match(referenceSql, /publication_state\s*=\s*['"]published['"]/i)
  assert.match(totalSql, /JOIN\s+public_prompts/i)
  assert.match(totalSql, /publication_state\s*=\s*['"]published['"]/i)
  assert.match(hydrationSql, /publication_state\s*=\s*['"]published['"]/i)
  assert.match(
    favorites,
    /SELECT\s+id\s+FROM\s+public_prompts\s+WHERE\s+id\s*=\s*\?\s+AND\s+publication_state\s*=\s*['"]published['"]/i,
  )
})

test('global search and moderation only expose published snapshot content', () => {
  const search = methodSource(databaseSource, 'globalSearch')
  const moderationList = read('src/app/api/v1/admin/public-prompts/route.ts')
  const moderationDetail = read('src/app/api/v1/admin/public-prompts/[id]/route.ts')
  const searchStateFilters = search.match(
    /publication_state\s*=\s*['"]published['"]/gi,
  ) || []

  assert.ok(
    searchStateFilters.length >= 2,
    'global search list and count queries must both exclude withdrawn publications',
  )
  assert.match(moderationList, /pp\.publication_state\s*=\s*['"]published['"]/i)
  assert.match(
    moderationDetail,
    /WHERE\s+pp\.id\s*=\s*\?\s+AND\s+pp\.publication_state\s*=\s*['"]published['"]/i,
  )
})

test('the author publication list validates lifecycle filters and returns the state', () => {
  const route = read('src/app/api/v1/user/published-prompts/route.ts')
  const types = read('src/types/index.ts')

  assert.match(route, /const conditions = \[['"]pp\.author_id = \?['"]\]/)
  assert.match(route, /searchParams\.get\(['"]state['"]\)\s*\|\|\s*['"]published['"]/)
  assert.match(route, /\[['"]published['"],\s*['"]withdrawn['"],\s*['"]all['"]\]/)
  assert.match(route, /if\s*\(state\s*!==\s*['"]all['"]\)/)
  assert.match(route, /pp\.publication_state/)
  assert.match(types, /export type PublicationState\s*=\s*['"]published['"]\s*\|\s*['"]withdrawn['"]/)
  assert.match(types, /publication_state\??:\s*PublicationState/)
})

test('author withdrawal is idempotent, ownership-scoped, and never hard-deletes', () => {
  const route = read('src/app/api/v1/public-prompts/[id]/delete/route.ts')
  const withdraw = methodSource(databaseSource, 'withdrawOwnedPublicPrompt')
  const ownershipLock = sqlLiteralContaining(withdraw, 'FROM public_prompts')
  const stateUpdate = sqlLiteralContaining(withdraw, 'UPDATE public_prompts')

  assert.match(route, /requireAuth\(request\)/)
  assert.match(route, /parsePositiveResourceId/)
  assert.match(
    route,
    /withdrawOwnedPublicPrompt\((?:userId|auth\.user\.id),\s*id\)/,
  )
  assert.match(route, /status:\s*404/)
  assert.doesNotMatch(route, /DELETE\s+FROM\s+public_prompts/i)

  assert.match(withdraw, /beginTransaction\(\)/)
  assert.match(
    ownershipLock,
    /WHERE\s+id\s*=\s*\?\s+AND\s+author_id\s*=\s*\?[\s\S]{0,100}FOR UPDATE/i,
  )
  assert.doesNotMatch(
    ownershipLock,
    /AND\s+publication_state\s*=\s*['"]published['"]/i,
  )
  assert.match(stateUpdate, /publication_state\s*=\s*['"]withdrawn['"]/i)
  assert.match(stateUpdate, /WHERE\s+id\s*=\s*\?\s+AND\s+author_id\s*=\s*\?/i)
  assert.match(withdraw, /commit\(\)/)
  assert.match(withdraw, /rollback\(\)/)
})

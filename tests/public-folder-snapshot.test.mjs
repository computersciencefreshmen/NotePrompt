import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  MYSQL_UNSIGNED_INT_MAX,
  planPublicFolderSnapshotPositions,
} from '../src/lib/public-folder-snapshot-policy.ts'
const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(testDirectory, '..')
const require = createRequire(import.meta.url)
const requirements = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'database', 'schema-requirements.json'), 'utf8')
)

function source(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

function methodSource(contents, methodName, nextMethodName) {
  const start = contents.indexOf(`async ${methodName}`)
  const end = contents.indexOf(`async ${nextMethodName}`, start + 1)
  assert.ok(start >= 0, `missing ${methodName}`)
  assert.ok(end > start, `missing boundary after ${methodName}`)
  return contents.slice(start, end)
}

test('migration 007 defines the complete durable snapshot contract', async () => {
  assert.ok(requirements.schemaVersion >= 7)
  assert.ok(requirements.requiredMigrations.includes('007'))
  assert.deepEqual(
    ['public_folder_id', 'source_prompt_id', 'content', 'payload', 'tags', 'position']
      .filter(column => requirements.tables.public_folder_prompts.includes(column)),
    ['public_folder_id', 'source_prompt_id', 'content', 'payload', 'tags', 'position']
  )

  const migration = require('../database/migrations/007_snapshot_public_folders.cjs')
  const events = []
  await migration.up({
    exec: async sql => events.push(`exec:${sql.replace(/\s+/g, ' ').trim()}`),
    query: async () => [[], []],
    modifyColumn: async (table, column, definition) => {
      events.push(`modify:${table}.${column}:${definition}`)
    },
    ensureIndex: async (table, index) => events.push(`index:${table}.${index}`),
    ensureTable: async (table, sql) => events.push(`table:${table}:${sql}`),
  })

  assert.ok(events.some(event => event === 'index:public_folders.uq_public_folders_source'))
  assert.ok(events.some(event => event === 'modify:public_folders.original_folder_id:INT NULL'))
  const table = events.find(event => event.startsWith('table:public_folder_prompts:')) || ''
  assert.match(table, /ON DELETE CASCADE/)
  assert.match(table, /source_prompt_id[\s\S]*ON DELETE SET NULL/)
  assert.match(table, /position INT UNSIGNED NOT NULL/)
  assert.match(table, /UNIQUE INDEX uq_public_folder_prompt_position/)
  assert.ok(events.some(event => /INSERT IGNORE INTO public_folder_prompts/.test(event)))
})

test('publishing replaces a snapshot inside the same ownership-checked transaction', () => {
  const database = source('src/lib/mysql-database.ts')
  const publish = methodSource(database, 'publishOwnedFolderSnapshot', 'getPublicFolderById')

  assert.match(publish, /beginTransaction\(\)/)
  assert.match(publish, /WHERE id = \? AND user_id = \?[\s\S]*FOR UPDATE/)
  assert.match(publish, /ON DUPLICATE KEY UPDATE/)
  assert.match(publish, /DELETE FROM public_folder_prompts[\s\S]*snapshot_origin IN \('legacy_unverified', 'folder_publication'\)/)
  assert.match(publish, /INSERT INTO public_folder_prompts/)
  assert.ok(publish.indexOf('DELETE FROM public_folder_prompts') < publish.indexOf('INSERT INTO public_folder_prompts'))
  assert.match(publish, /commit\(\)/)
  assert.match(publish, /rollback\(\)/)

  const route = source('src/app/api/v1/folders/[id]/publish/route.ts')
  assert.match(route, /publishOwnedFolderSnapshot\(folderId, userId, description\)/)
  assert.match(route, /readLimitedJson<Record<string, unknown>>/)
  assert.match(route, /key !== 'description'/)
  assert.match(route, /error instanceof RequestPolicyError/)
  assert.doesNotMatch(route, /createPublicFolder|findOwnedResource/)
})

test('publication metadata updates are bounded and treat no-op updates as existing', () => {
  const route = source('src/app/api/v1/public-folders/[id]/route.ts')
  assert.match(route, /readLimitedJson<Record<string, unknown>>/)
  assert.match(route, /!\['name', 'description'\]\.includes\(key\)/)
  assert.match(route, /if \(affectedRows === 0\)/)
  assert.match(route, /SELECT id FROM public_folders WHERE id = \? AND user_id = \? LIMIT 1/)
  assert.match(route, /error instanceof RequestPolicyError/)
})

test('public, admin, and imported reads cannot follow the live private-folder pointer', () => {
  for (const relativePath of [
    'src/app/api/v1/public-folders/[id]/prompts/route.ts',
    'src/app/api/v1/admin/public-folders/[id]/prompts/route.ts',
    'src/app/api/v1/user/imported-folders/[id]/prompts/route.ts',
  ]) {
    const contents = source(relativePath)
    assert.doesNotMatch(contents, /user_prompt_folders|original_folder_id/)
  }

  const database = source('src/lib/mysql-database.ts')
  const publicRead = methodSource(
    database,
    'getPublicFolderPrompts',
    'addPublishedPromptToPublicFolderSnapshot'
  )
  const importedRead = methodSource(database, 'getImportedFolderPrompts', 'deleteUserImportedFolder')
  assert.match(publicRead, /FROM public_folder_prompts/)
  assert.match(importedRead, /JOIN public_folder_prompts/)
  assert.doesNotMatch(publicRead, /user_prompt_folders|original_folder_id/)
  assert.doesNotMatch(importedRead, /user_prompt_folders|original_folder_id/)
})

test('all published-folder counts are derived from snapshot rows', () => {
  for (const relativePath of [
    'src/app/api/v1/public-folders/route.ts',
    'src/app/api/v1/admin/public-folders/route.ts',
    'src/app/api/v1/user/published-folders/route.ts',
  ]) {
    const contents = source(relativePath)
    assert.match(contents, /public_folder_prompts/)
    assert.doesNotMatch(contents, /prompt_counts\.folder_id = pf\.original_folder_id/)
  }
})

test('snapshot administration uses the canonical admin principal check', () => {
  for (const relativePath of [
    'src/app/api/v1/admin/available-prompts/route.ts',
    'src/app/api/v1/admin/public-folders/route.ts',
    'src/app/api/v1/admin/public-folders/[id]/prompts/route.ts',
  ]) {
    const contents = source(relativePath)
    assert.match(contents, /requireAdminAuth\(request\)/)
    assert.match(contents, /status: auth\.status/)
    assert.doesNotMatch(contents, /auth\.user\.is_admin|requireAuth\(request\)/)
  }
  const mutationRoute = source('src/app/api/v1/admin/public-folders/[id]/prompts/route.ts')
  assert.match(mutationRoute, /readLimitedJson<Record<string, unknown>>/)
  assert.match(mutationRoute, /key !== 'publicPromptId'/)
  assert.match(mutationRoute, /error instanceof RequestPolicyError/)
})

test('individual imports address the folder snapshot namespace explicitly', () => {
  const page = source('src/app/public-folders/[id]/page.tsx')
  const client = source('src/lib/api.ts')
  const route = source('src/app/api/v1/public-folders/[id]/prompts/[promptId]/import/route.ts')
  const database = source('src/lib/mysql-database.ts')
  const importMethod = methodSource(
    database,
    'importPublicFolderSnapshotPrompt',
    'findUserPromptByTitle'
  )

  assert.match(page, /publicFolders\.importPrompt\(folderId, snapshotId\)/)
  assert.doesNotMatch(page, /publicPrompts\.import\(promptId\)/)
  assert.match(client, /public-folders\/\$\{id\}\/prompts\/\$\{snapshotPromptId\}\/import/)
  assert.match(route, /importPublicFolderSnapshotPrompt/)
  assert.match(importMethod, /FROM public_folder_prompts/)
  assert.doesNotMatch(importMethod, /FROM user_prompts[\s\S]*WHERE prompt\.id = snapshot\.source_prompt_id/)
})
test('snapshot visibility is fail-closed for every origin and public lifecycle change', () => {
  const policySource = source('src/lib/public-folder-snapshot-policy.ts')
  const sqlSource = policySource.slice(
    policySource.indexOf('export const PUBLIC_FOLDER_SNAPSHOT_VISIBILITY_SQL')
  )

  assert.match(
    sqlSource,
    /snapshot\.snapshot_origin = 'folder_publication'[\s\S]*snapshot\.source_public_prompt_id IS NULL[\s\S]*snapshot\.author_id = published_folder\.user_id/
  )
  assert.match(
    sqlSource,
    /snapshot\.snapshot_origin = 'moderated_publication'[\s\S]*snapshot\.source_public_prompt_id IS NOT NULL[\s\S]*snapshot\.source_prompt_id IS NULL[\s\S]*EXISTS/
  )
  assert.match(sqlSource, /publication\.id = snapshot\.source_public_prompt_id/)
  assert.match(sqlSource, /publication\.publication_state = 'published'/)
  for (const field of [
    'author_id',
    'title',
    'content',
    'description',
    'category_id',
    'editor_mode',
    'payload',
    'schema_version',
  ]) {
    assert.match(sqlSource, new RegExp(`publication\\.${field}[\\s\\S]*snapshot\\.${field}`))
  }
  assert.match(sqlSource, /JSON_LENGTH[\s\S]*public_prompt_tags/)
  assert.match(sqlSource, /NOT EXISTS[\s\S]*JSON_CONTAINS/)
  assert.match(sqlSource, /CAST\(publication\.title AS BINARY\)/)
  assert.doesNotMatch(sqlSource, /\bBINARY\s+publication\./)

  // Legacy rows and mutable/private metadata never establish publication consent.
  assert.doesNotMatch(sqlSource, /legacy_unverified/)
  assert.doesNotMatch(sqlSource, /publication\.source_prompt_id/)
  assert.doesNotMatch(sqlSource, /publication\.(?:created_at|updated_at)/)
  assert.doesNotMatch(sqlSource, /snapshot\.(?:source_created_at|source_updated_at)/)
  assert.doesNotMatch(sqlSource, /snapshot\.(?:author_name|author_avatar_url|category_name|category_color)/)
})

test('position planning is stable across owner republishes and fails closed at INT UNSIGNED bounds', () => {
  assert.equal(MYSQL_UNSIGNED_INT_MAX, 0xffff_ffff)

  const firstPlan = planPublicFolderSnapshotPositions([
    { id: 30, position: 8, snapshot_origin: 'moderated_publication' },
    { id: 10, position: 0, snapshot_origin: 'folder_publication' },
    { id: 20, position: 4, snapshot_origin: 'moderated_publication' },
  ], 2)
  assert.deepEqual(firstPlan, [
    { id: 20, temporaryPosition: 9, finalPosition: 2 },
    { id: 30, temporaryPosition: 10, finalPosition: 3 },
  ])

  const replayPlan = planPublicFolderSnapshotPositions([
    { id: 101, position: 0, snapshot_origin: 'folder_publication' },
    { id: 102, position: 1, snapshot_origin: 'folder_publication' },
    { id: 20, position: 2, snapshot_origin: 'moderated_publication' },
    { id: 30, position: 3, snapshot_origin: 'moderated_publication' },
  ], 2)
  assert.deepEqual(
    replayPlan.map(snapshot => ({ id: snapshot.id, finalPosition: snapshot.finalPosition })),
    firstPlan.map(snapshot => ({ id: snapshot.id, finalPosition: snapshot.finalPosition }))
  )

  assert.throws(
    () => planPublicFolderSnapshotPositions([
      { id: 1, position: MYSQL_UNSIGNED_INT_MAX, snapshot_origin: 'moderated_publication' },
    ], 0),
    /staging positions exceed/
  )
  assert.throws(
    () => planPublicFolderSnapshotPositions([], MYSQL_UNSIGNED_INT_MAX + 2),
    /positions exceed/
  )
  assert.throws(
    () => planPublicFolderSnapshotPositions([
      { id: 1, position: 0, snapshot_origin: 'folder_publication' },
      { id: 2, position: 0, snapshot_origin: 'moderated_publication' },
    ], 0),
    /position is invalid/
  )
})

test('owner republish attests only owner rows and preserves moderated rows in stable order', () => {
  const database = source('src/lib/mysql-database.ts')
  const publish = methodSource(database, 'publishOwnedFolderSnapshot', 'getPublicFolderById')

  assert.match(publish, /SELECT id, position, snapshot_origin[\s\S]*FOR UPDATE/)
  assert.match(publish, /planPublicFolderSnapshotPositions/)
  assert.match(publish, /snapshot\.temporaryPosition/)
  assert.match(publish, /snapshot\.finalPosition/)
  assert.match(
    publish,
    /public_folder_id, source_prompt_id, source_public_prompt_id, snapshot_origin[\s\S]*prompt\.id,[\s\S]*NULL,[\s\S]*'folder_publication'/
  )
  assert.match(
    publish,
    /DELETE FROM public_folder_prompts[\s\S]*snapshot_origin IN \('legacy_unverified', 'folder_publication'\)/
  )
  assert.doesNotMatch(publish, /DELETE FROM public_folder_prompts WHERE public_folder_id = \?['`]/)
  assert.match(publish, /ownerCount !== expectedOwnerCount/)
})

test('moderation copies the current public identity and supports detached publications', () => {
  const database = source('src/lib/mysql-database.ts')
  const add = methodSource(
    database,
    'addPublishedPromptToPublicFolderSnapshot',
    'removePublicFolderSnapshotPrompt'
  )

  assert.match(add, /FROM public_prompts publication/)
  assert.match(add, /WHERE publication\.id = \?/)
  assert.match(add, /publication\.publication_state = 'published'/)
  assert.doesNotMatch(add, /publication\.source_prompt_id IS NOT NULL/)
  assert.doesNotMatch(add, /FROM user_prompts|FROM user_prompt_tags/)
  assert.match(add, /WHERE prompt_tag\.public_prompt_id = \?/)
  assert.match(add, /ORDER BY tag\.name ASC/)
  assert.match(add, /source_public_prompt_id = \?/)
  assert.match(add, /snapshot_origin = 'moderated_publication'/)
  assert.match(add, /SET source_prompt_id = NULL/)
  assert.match(
    add,
    /VALUES \(\?, NULL, \?, 'moderated_publication'/
  )
  assert.match(add, /nextPosition > MYSQL_UNSIGNED_INT_MAX/)
})

test('snapshot readers share one policy, one snapshot id, and owned imported SQL', () => {
  const database = source('src/lib/mysql-database.ts')
  const publicRead = methodSource(
    database,
    'getPublicFolderPrompts',
    'addPublishedPromptToPublicFolderSnapshot'
  )
  const importOne = methodSource(
    database,
    'importPublicFolderSnapshotPrompt',
    'findUserPromptByTitle'
  )
  const importedRead = methodSource(
    database,
    'getImportedFolderPrompts',
    'deleteUserImportedFolder'
  )
  const importedCount = methodSource(
    database,
    'getImportedFolderPromptCount',
    'restoreOwnedPromptVersion'
  )
  const importedList = methodSource(
    database,
    'getUserImportedFolders',
    'getImportedFolderPrompts'
  )

  for (const method of [publicRead, importOne, importedRead, importedCount, importedList]) {
    assert.match(method, /PUBLIC_FOLDER_SNAPSHOT_VISIBILITY_SQL/)
  }
  assert.match(publicRead, /withConsistentReadSnapshot/)
  assert.doesNotMatch(publicRead, /Promise\.all/)
  assert.match(publicRead, /SELECT snapshot\.id AS snapshot_id/)
  assert.doesNotMatch(publicRead, /SELECT snapshot\.id,[\s\S]*snapshot\.id AS snapshot_id/)
  assert.match(importedRead, /getImportedFolderPrompts\(importedFolderId: number, userId: number\)/)
  assert.match(importedRead, /WHERE imported\.id = \?[\s\S]*imported\.user_id = \?/)
  assert.match(importedRead, /\[importedFolderId, userId\]/)
  assert.match(importedCount, /getImportedFolderPromptCount\(importedFolderId: number, userId: number\)/)
  assert.match(importedCount, /WHERE imported\.id = \?[\s\S]*imported\.user_id = \?/)
  assert.match(importedList, /AS prompt_count/)
  assert.doesNotMatch(importedList, /SELECT \w+\.\*/)
  assert.match(importOne, /\]\.sort\(\)\.slice\(0, 50\)/)
})

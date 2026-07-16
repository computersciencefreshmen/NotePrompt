import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

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
  assert.match(table, /UNIQUE INDEX uq_public_folder_prompt_position/)
  assert.ok(events.some(event => /INSERT IGNORE INTO public_folder_prompts/.test(event)))
})

test('publishing replaces a snapshot inside the same ownership-checked transaction', () => {
  const database = source('src/lib/mysql-database.ts')
  const publish = methodSource(database, 'publishOwnedFolderSnapshot', 'getPublicFolderById')

  assert.match(publish, /beginTransaction\(\)/)
  assert.match(publish, /WHERE id = \? AND user_id = \?[\s\S]*FOR UPDATE/)
  assert.match(publish, /ON DUPLICATE KEY UPDATE/)
  assert.match(publish, /DELETE FROM public_folder_prompts WHERE public_folder_id = \?/)
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
  const publicRead = methodSource(database, 'getPublicFolderPrompts', 'addPublicFolderSnapshotPrompt')
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
  assert.match(mutationRoute, /key !== 'promptId'/)
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

  assert.match(page, /publicFolders\.importPrompt\(folderId, promptId\)/)
  assert.doesNotMatch(page, /publicPrompts\.import\(promptId\)/)
  assert.match(client, /public-folders\/\$\{id\}\/prompts\/\$\{snapshotPromptId\}\/import/)
  assert.match(route, /importPublicFolderSnapshotPrompt/)
  assert.match(importMethod, /FROM public_folder_prompts/)
  assert.doesNotMatch(importMethod, /FROM user_prompts[\s\S]*WHERE prompt\.id = snapshot\.source_prompt_id/)
})

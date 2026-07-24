import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(testDirectory, '..')

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

function exportedMethodSource(contents, methodName, nextMethodName) {
  const start = contents.indexOf(`export async function ${methodName}`)
  const end = contents.indexOf(`export async function ${nextMethodName}`, start + 1)
  assert.ok(start >= 0, `missing exported ${methodName}`)
  assert.ok(end > start, `missing boundary after exported ${methodName}`)
  return contents.slice(start, end)
}

function compactSql(contents) {
  return contents.replace(/\s+/g, ' ').trim()
}

function interfaceSource(contents, interfaceName) {
  const match = contents.match(
    new RegExp(`export interface ${interfaceName}\\s*\\{[\\s\\S]*?\\n\\}`),
  )
  assert.ok(match, `missing ${interfaceName}`)
  return match[0]
}

function sqlStatements(contents) {
  return [
    ...[...contents.matchAll(/`([\s\S]*?)`/g)].map(match => match[1]),
    ...[...contents.matchAll(/'((?:\\.|[^'\\])*)'/g)].map(match => match[1]),
    ...[...contents.matchAll(/"((?:\\.|[^"\\])*)"/g)].map(match => match[1]),
  ]
}

function assertExactActivePublication(sql, label) {
  const normalized = compactSql(sql)
  assert.match(
    normalized,
    /snapshot\.snapshot_origin\s*=\s*'folder_publication'[\s\S]*snapshot\.author_id\s*=\s*published_folder\.user_id/i,
    `${label} must attest owner publications explicitly`,
  )
  assert.match(
    normalized,
    /snapshot\.snapshot_origin\s*=\s*'moderated_publication'[\s\S]*snapshot\.source_public_prompt_id\s+IS\s+NOT\s+NULL[\s\S]*EXISTS\s*\(/i,
    `${label} must attest moderated publications explicitly`,
  )
  assert.match(normalized, /FROM public_prompts publication/i, label)
  assert.match(normalized, /publication\.id\s*=\s*snapshot\.source_public_prompt_id/i, label)
  assert.match(normalized, /publication\.publication_state\s*=\s*'published'/i, label)
  for (const field of ['author_id', 'title', 'content', 'description', 'category_id', 'editor_mode', 'payload', 'schema_version']) {
    assert.match(
      normalized,
      new RegExp(`publication\\.${field}[\\s\\S]*snapshot\\.${field}`, 'i'),
      `${label} must compare ${field}`,
    )
  }
  assert.match(normalized, /JSON_LENGTH\s*\(\s*COALESCE\(snapshot\.tags/i, label)
  assert.match(normalized, /NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public_prompt_tags/i, label)
  assert.match(normalized, /JSON_CONTAINS\s*\(/i, label)
  assert.doesNotMatch(normalized, /publication\.(?:created_at|updated_at)/i, label)
  assert.doesNotMatch(normalized, /active_author|active_category/i, label)
}
function assertEverySnapshotReadVisible(contents, label) {
  const reads = sqlStatements(contents).filter(sql =>
    /\b(?:FROM|JOIN)\s+public_folder_prompts\s+snapshot\b/i.test(sql)
    && /\bSELECT\b/i.test(sql)
  )
  assert.ok(reads.length > 0, `${label} must read public_folder_prompts`)
  for (const [index, sql] of reads.entries()) {
    assert.match(
      sql,
      /\$\{PUBLIC_FOLDER_SNAPSHOT_VISIBILITY_SQL\}/,
      `${label} snapshot read ${index + 1} must use the canonical visibility policy`,
    )
  }
}

function assertSnapshotProjectionsSafe(contents, label) {
  const reads = sqlStatements(contents).filter(sql =>
    /\b(?:FROM|JOIN)\s+public_folder_prompts\s+snapshot\b/i.test(sql)
    && /\bSELECT\b/i.test(sql)
  )
  assert.ok(reads.length > 0, `${label} must read public_folder_prompts`)

  for (const [index, sql] of reads.entries()) {
    const selectIndex = sql.search(/\bSELECT\b/i)
    const fromOffset = sql.slice(selectIndex + 6).search(/\bFROM\b/i)
    assert.ok(fromOffset >= 0, `${label} query ${index + 1} must have FROM`)
    const projection = sql.slice(selectIndex + 6, selectIndex + 6 + fromOffset)
    assert.doesNotMatch(projection, /\bsnapshot\.\*/i, label)
    assert.doesNotMatch(projection, /\bsource_(?:prompt|public_prompt)_id\b/i, label)
  }
}

test('the canonical snapshot visibility policy proves exact active public state', () => {
  const policy = source('src/lib/public-folder-snapshot-policy.ts')
  assertExactActivePublication(policy, 'PUBLIC_FOLDER_SNAPSHOT_VISIBILITY_SQL')
  assert.match(policy, /JSON_TYPE\(COALESCE\(snapshot\.tags,\s*JSON_ARRAY\(\)\)\)\s*=\s*'ARRAY'/)
})

test('moderation candidates use public identity and allow stale snapshots to be refreshed', () => {
  const route = source('src/app/api/v1/admin/available-prompts/route.ts')
  const normalized = compactSql(route)

  assert.ok(
    (normalized.match(/FROM public_prompts\b/gi) || []).length >= 2,
    'both the count and list queries must use public_prompts',
  )
  assert.match(normalized, /\bpublication_state\s*=\s*'published'/i)
  assert.doesNotMatch(normalized, /pp\.source_prompt_id/i)
  assert.match(normalized, /snapshot\.source_public_prompt_id\s*=\s*pp\.id/i)
  assert.match(normalized, /PUBLIC_FOLDER_SNAPSHOT_VISIBILITY_SQL/)
  assert.match(normalized, /withConsistentReadSnapshot\(async query/)
  assert.match(normalized, /createPaginationMetadata/)
  assert.doesNotMatch(normalized, /\b(?:FROM|JOIN)\s+user_prompts\b/i)
  assert.doesNotMatch(normalized, /\buser_prompt_tags\b/i)
  assert.match(route, /PUBLIC_FOLDER_SNAPSHOT_VISIBILITY_SQL/)
})

test('admin snapshot mutation accepts a public publication identity only', () => {
  const route = source('src/app/api/v1/admin/public-folders/[id]/prompts/route.ts')
  const post = exportedMethodSource(route, 'POST', 'DELETE')

  assert.match(post, /key !== 'publicPromptId'/)
  assert.match(post, /body\.publicPromptId/)
  assert.match(post, /db\.addPublishedPromptToPublicFolderSnapshot\(/)
  assert.doesNotMatch(post, /body\.promptId|key !== 'promptId'/)
  assert.doesNotMatch(post, /db\.addPublicFolderSnapshotPrompt\(/)
})

test('copying into a folder snapshot stays behind the publication boundary', () => {
  const database = source('src/lib/mysql-database.ts')
  const copy = methodSource(
    database,
    'addPublishedPromptToPublicFolderSnapshot',
    'removePublicFolderSnapshotPrompt',
  )
  const normalized = compactSql(copy)

  assert.match(copy, /beginTransaction\(\)/)
  assert.match(normalized, /SELECT id FROM public_folders WHERE id = \? FOR UPDATE/i)
  assert.match(normalized, /\bFROM public_prompts\b/i)
  assert.match(normalized, /\bpublication_state\s*=\s*'published'/i)
  assert.doesNotMatch(normalized, /publication\.source_prompt_id/i)
  assert.match(normalized, /snapshot\.source_public_prompt_id\s*=\s*\?/i)
  assert.match(normalized, /snapshot_origin\s*=\s*'moderated_publication'/i)
  assert.match(normalized, /source_prompt_id\s*=\s*NULL/i)
  assert.match(normalized, /\bFOR UPDATE\b/i)
  assert.match(normalized, /\bFROM public_prompt_tags\b/i)
  assert.match(normalized, /\bINSERT INTO public_folder_prompts\b/i)
  assert.match(copy, /commit\(\)/)
  assert.match(copy, /rollback\(\)/)

  assert.doesNotMatch(normalized, /\b(?:FROM|JOIN)\s+user_prompts\b/i)
  assert.doesNotMatch(normalized, /\buser_prompt_tags\b/i)
  assert.doesNotMatch(normalized, /\bSELECT\s+\w+\.\*/i)
  assert.doesNotMatch(normalized, /\bSELECT\s+\*\s+FROM\s+public_folder_prompts\b/i)

  const committedReturn = copy.slice(copy.lastIndexOf('await connection.commit()'))
  assert.doesNotMatch(
    committedReturn,
    /source_(?:prompt|public_prompt)_id|\.\.\./,
    'the returned snapshot DTO must not expose an internal source identity',
  )
})

test('published-folder DTOs do not expose compatibility source pointers', () => {
  for (const relativePath of [
    'src/app/api/v1/public-folders/route.ts',
    'src/app/api/v1/public-folders/[id]/route.ts',
    'src/app/api/v1/admin/public-folders/route.ts',
    'src/app/api/v1/admin/public-folders/[id]/prompts/route.ts',
    'src/app/api/v1/user/published-folders/route.ts',
  ]) {
    assert.doesNotMatch(source(relativePath), /\boriginal_folder_id\b/, relativePath)
  }

  const database = source('src/lib/mysql-database.ts')
  const publish = methodSource(database, 'publishOwnedFolderSnapshot', 'getPublicFolderById')
  const publicFolderRead = methodSource(database, 'getPublicFolderById', 'getPublicFolderPrompts')
  assert.doesNotMatch(publish, /SELECT\s+published(?:_folder)?\.\*/i)
  assert.doesNotMatch(publicFolderRead, /published\.\*|original_folder_id/)

  const types = source('src/types/index.ts')
  assert.doesNotMatch(interfaceSource(types, 'PublicFolder'), /original_folder_id/)
  assert.doesNotMatch(interfaceSource(types, 'AdminFolder'), /original_folder_id/)
  assert.doesNotMatch(source('src/app/admin/page.tsx'), /\boriginal_folder_id\b/)
})

test('all folder snapshot reads enforce owner-or-exact-active-publication visibility', () => {
  const database = source('src/lib/mysql-database.ts')
  const methodRanges = [
    ['publishOwnedFolderSnapshot', 'getPublicFolderById'],
    ['getPublicFolderById', 'getPublicFolderPrompts'],
    ['getPublicFolderPrompts', 'addPublishedPromptToPublicFolderSnapshot'],
    ['importPublicFolderSnapshotPrompt', 'findUserPromptByTitle'],
    ['getImportedFolderPrompts', 'deleteUserImportedFolder'],
    ['getImportedFolderPromptCount', 'restoreOwnedPromptVersion'],
  ]
  for (const [methodName, nextMethodName] of methodRanges) {
    assertEverySnapshotReadVisible(
      methodSource(database, methodName, nextMethodName),
      methodName,
    )
  }

  for (const relativePath of [
    'src/app/api/v1/public-folders/route.ts',
    'src/app/api/v1/admin/public-folders/route.ts',
    'src/app/api/v1/user/published-folders/route.ts',
  ]) {
    assertEverySnapshotReadVisible(source(relativePath), relativePath)
  }
})

test('snapshot payload reads use explicit projections without source ids', () => {
  const database = source('src/lib/mysql-database.ts')
  const publicRead = methodSource(
    database,
    'getPublicFolderPrompts',
    'addPublishedPromptToPublicFolderSnapshot',
  )
  const importOne = methodSource(
    database,
    'importPublicFolderSnapshotPrompt',
    'findUserPromptByTitle',
  )
  const importedRead = methodSource(database, 'getImportedFolderPrompts', 'deleteUserImportedFolder')

  assertSnapshotProjectionsSafe(publicRead, 'getPublicFolderPrompts')
  assertSnapshotProjectionsSafe(importOne, 'importPublicFolderSnapshotPrompt')
  assertSnapshotProjectionsSafe(importedRead, 'getImportedFolderPrompts')
})

test('imported-folder identity is queried with ownership in SQL', () => {
  const database = source('src/lib/mysql-database.ts')
  const ownedRead = methodSource(
    database,
    'getImportedFolderById',
    'getImportedFolderByPublicFolderId',
  )
  const route = source('src/app/api/v1/user/imported-folders/[id]/prompts/route.ts')

  assert.match(compactSql(ownedRead), /WHERE id = \? AND user_id = \?/i)
  assert.doesNotMatch(ownedRead, /SELECT\s+\*/)
  assert.match(route, /getImportedFolderById\(importedFolderId,\s*userId\)/)
})

test('admin client separates publication and snapshot namespaces', () => {
  const client = source('src/lib/api.ts')
  const addClientStart = client.indexOf('addPublishedPromptToPublicFolder:')
  const addClient = client.slice(
    addClientStart,
    client.indexOf('removeSnapshotPromptFromPublicFolder:', addClientStart),
  )
  const removeClient = client.slice(
    client.indexOf('removeSnapshotPromptFromPublicFolder:'),
    client.indexOf('getAvailablePrompts:'),
  )
  const page = source('src/app/admin/folders/[id]/page.tsx')
  const dialog = source('src/app/admin/folders/[id]/PromptCandidateDialog.tsx')
  const route = source('src/app/api/v1/admin/public-folders/[id]/prompts/route.ts')
  const types = source('src/types/index.ts')

  assert.ok(addClientStart >= 0, 'missing addPublishedPromptToPublicFolder client')
  assert.match(addClient, /\(folderId: number, publicPromptId: number\)/)
  assert.match(addClient, /JSON\.stringify\(\{\s*publicPromptId\s*\}\)/)
  assert.match(addClient, /ApiResponse<AdminFolderSnapshotPrompt>/)
  assert.match(removeClient, /\(folderId: number, snapshotId: number\)/)
  assert.match(removeClient, /\?snapshotId=\$\{snapshotId\}/)
  assert.match(route, /searchParams\.get\('snapshotId'\)/)
  assert.match(route, /searchParams\.get\('promptId'\)/)
  assert.match(page, /prompt\.snapshot_id/)
  assert.match(page, /removeSnapshotPromptFromPublicFolder/)
  assert.match(dialog, /addPublishedPromptToPublicFolder/)
  assert.match(dialog, /selectedPublicPromptId|publicPromptId/)
  assert.match(types, /export interface PublicFolderSnapshotPrompt\s*\{[\s\S]*snapshot_id: number/)
  assert.match(types, /export type AdminFolderSnapshotPrompt = PublicFolderSnapshotPrompt/)
})

test('snapshot reader DTOs expose only the explicit snapshot namespace', () => {
  const publicRoute = source('src/app/api/v1/public-folders/[id]/prompts/route.ts')
  const adminRoute = source('src/app/api/v1/admin/public-folders/[id]/prompts/route.ts')
  const importedRoute = source('src/app/api/v1/user/imported-folders/[id]/prompts/route.ts')
  const publicMapper = publicRoute.slice(
    publicRoute.indexOf('function toPublicFolderSnapshotPrompt'),
    publicRoute.indexOf('export async function GET'),
  )
  const adminMapper = adminRoute.slice(
    adminRoute.indexOf('function toAdminFolderSnapshotPrompt'),
    adminRoute.indexOf('// GET'),
  )

  for (const [label, mapper] of [['public', publicMapper], ['admin', adminMapper]]) {
    assert.match(mapper, /snapshot_id:/, label)
    assert.doesNotMatch(mapper, /\bid:/, label)
    assert.doesNotMatch(mapper, /source_(?:prompt|public_prompt)_id|snapshot_origin/, label)
    assert.doesNotMatch(mapper, /\.\.\.prompt/, label)
  }
  assert.match(importedRoute, /parsePositiveResourceId\(prompt\.snapshot_id\)/)
  assert.match(importedRoute, /snapshot_id: snapshotId/)
  assert.doesNotMatch(importedRoute, /\bid: prompt\.(?:id|snapshot_id)/)
  assert.match(source('src/app/public-folders/[id]/page.tsx'), /prompt\.snapshot_id/)
  assert.doesNotMatch(source('src/app/public-folders/[id]/page.tsx'), /prompt\.id/)
  assert.match(source('src/app/imported-folders/[id]/page.tsx'), /prompt\.snapshot_id/)
})

test('folder pagination is consistent and counts only the current page', () => {
  for (const relativePath of [
    'src/app/api/v1/admin/available-prompts/route.ts',
    'src/app/api/v1/public-folders/route.ts',
    'src/app/api/v1/admin/public-folders/route.ts',
    'src/app/api/v1/user/published-folders/route.ts',
  ]) {
    assert.match(source(relativePath), /withConsistentReadSnapshot\(async (?:query|snapshotQuery)/, relativePath)
  }
  for (const relativePath of [
    'src/app/api/v1/public-folders/route.ts',
    'src/app/api/v1/admin/public-folders/route.ts',
  ]) {
    const route = source(relativePath)
    assert.match(route, /FROM \(\s*SELECT pf\.id[\s\S]*LIMIT \? OFFSET \?[\s\S]*\) page_folder/i, relativePath)
    assert.doesNotMatch(route, /GROUP BY snapshot\.public_folder_id/i, relativePath)
  }
})

test('imported-folder reads and deletes keep ownership inside SQL', () => {
  const detail = source('src/app/api/v1/user/imported-folders/[id]/prompts/route.ts')
  const list = source('src/app/api/v1/user/imported-folders/route.ts')
  const remove = source('src/app/api/v1/user/imported-folders/[id]/route.ts')
  const database = source('src/lib/mysql-database.ts')
  const deleteMethod = methodSource(
    database,
    'deleteUserImportedFolder',
    'getImportedFolderPromptCount',
  )

  assert.match(detail, /getImportedFolderPrompts\(importedFolderId,\s*userId\)/)
  assert.doesNotMatch(list, /getImportedFolderPromptCount|Promise\.all/)
  assert.match(remove, /parsePositiveResourceId\(id\)/)
  assert.doesNotMatch(remove, /parseInt\(|isNaN\(/)
  assert.match(remove, /status:\s*404/)
  assert.match(compactSql(deleteMethod), /DELETE FROM user_imported_folders WHERE id = \? AND user_id = \?/i)
  assert.doesNotMatch(deleteMethod, /catch\s*\(/)
  assert.doesNotMatch(deleteMethod, /return false/)
})

test('candidate requests compose caller cancellation with timeout cleanup', () => {
  const client = source('src/lib/api.ts')
  const requestHelper = client.slice(
    client.indexOf('async function apiRequest'),
    client.indexOf('export const auth ='),
  )
  assert.match(requestHelper, /const externalSignal = options\.signal/)
  assert.match(requestHelper, /externalSignal\?\.addEventListener\('abort'/)
  assert.match(requestHelper, /signal: requestController\.signal/)
  assert.match(requestHelper, /externalSignal\?\.aborted && !timedOut/)
  assert.match(requestHelper, /externalSignal\?\.removeEventListener\('abort'/)
  assert.doesNotMatch(requestHelper, /signal: controller\.signal/)
  const candidates = client.slice(client.indexOf('getAvailablePrompts:'), client.indexOf('export const api ='))
  assert.match(candidates, /signal\?: AbortSignal/)
  assert.match(candidates, /signal: params\?\.signal/)
})
test('official English featured folders preserve static identity behind reader DTOs', () => {
  const data = source('src/data/english-featured-folders.ts')
  const prompts = source('src/data/english-featured-prompts.ts')
  const listRoute = source('src/app/api/v1/public-folders/route.ts')
  const detailRoute = source('src/app/api/v1/public-folders/[id]/route.ts')

  assert.equal((data.match(/promptIds:\s*\[/g) || []).length, 10)
  for (let id = 910001; id <= 910010; id += 1) {
    assert.match(data, new RegExp(`\\bid: ${id},`), `missing official folder ${id}`)
  }

  const definedPromptIds = new Set(
    [...prompts.matchAll(/\bid:\s*(900\d+)\b/g)].map(match => Number(match[1])),
  )
  const supplementalSpecs = prompts.slice(
    prompts.indexOf('const supplementalPromptSpecs'),
    prompts.indexOf('const supplementalEnglishPrompts'),
  )
  const additionalSpecs = prompts.slice(
    prompts.indexOf('const additionalPromptSpecs'),
    prompts.indexOf('const additionalEnglishPrompts'),
  )
  for (let index = 0; index < (supplementalSpecs.match(/\btitle:/g) || []).length; index += 1) {
    definedPromptIds.add(900013 + index)
  }
  for (let index = 0; index < (additionalSpecs.match(/\btitle:/g) || []).length; index += 1) {
    definedPromptIds.add(900100 + index)
  }
  const referencedPromptIds = [...data.matchAll(/promptIds:\s*\[([^\]]+)\]/g)]
    .flatMap(match => [...match[1].matchAll(/\b(900\d+)\b/g)].map(idMatch => Number(idMatch[1])))
  assert.ok(referencedPromptIds.length > 0, 'official folders must contain prompt mappings')
  for (const promptId of referencedPromptIds) {
    assert.ok(definedPromptIds.has(promptId), `missing official prompt ${promptId}`)
  }

  for (const [label, route] of [['list', listRoute], ['detail', detailRoute]]) {
    const mapperStart = route.indexOf('function toPublicFolderReaderDto')
    const mapperEnd = route.indexOf('export async function GET', mapperStart)
    assert.ok(mapperStart >= 0 && mapperEnd > mapperStart, `${label} reader mapper missing`)
    const mapper = route.slice(mapperStart, mapperEnd)
    for (const field of [
      'id',
      'name',
      'description',
      'user_id',
      'is_featured',
      'created_at',
      'updated_at',
      'author',
      'prompt_count',
    ]) {
      assert.match(mapper, new RegExp(`\\b${field}:`), `${label} reader DTO must include ${field}`)
    }
    assert.doesNotMatch(mapper, /promptIds|\.\.\.folder/, label)
    assert.doesNotMatch(route, /\boriginal_folder_id\b/, label)
  }

  assert.doesNotMatch(data, /\boriginal_folder_id\b/)
  assert.match(listRoute, /\.map\(toPublicFolderReaderDto\)/)
  assert.equal(
    (detailRoute.match(/data:\s*toPublicFolderReaderDto\(folder\)/g) || []).length,
    2,
    'both static and database detail responses must use the reader DTO',
  )
})

test('English static prompts receive explicit synthetic snapshot identity only at the route boundary', () => {
  const route = source('src/app/api/v1/public-folders/[id]/prompts/route.ts')
  const detailRoute = source('src/app/api/v1/public-folders/[id]/route.ts')
  const mapper = route.slice(
    route.indexOf('function toPublicFolderSnapshotPrompt'),
    route.indexOf('export async function GET'),
  )
  const databasePath = route.slice(route.indexOf('const publicFolder = await db.getPublicFolderById'))
  const database = source('src/lib/mysql-database.ts')
  const databaseRead = methodSource(
    database,
    'getPublicFolderPrompts',
    'addPublishedPromptToPublicFolderSnapshot',
  )

  assert.match(route, /snapshot_id:\s*prompt\.id/)
  assert.match(route, /prompts\.map\(prompt => toPublicFolderSnapshotPrompt\(\{ \.\.\.prompt, snapshot_id: prompt\.id \}\)\)/)
  assert.doesNotMatch(mapper, /prompt\.id|\?\?\s*prompt\.id/)
  assert.match(databasePath, /result\.items\.map\(prompt => toPublicFolderSnapshotPrompt\(prompt\)\)/)
  assert.doesNotMatch(databasePath, /snapshot_id:\s*prompt\.id/)
  assert.match(databaseRead, /snapshot\.id AS snapshot_id/i)
  assert.doesNotMatch(databaseRead, /snapshot\.id AS id\b/i)
  assert.match(route, /if \(lang !== 'zh' && lang !== 'en'\)/)
  assert.match(detailRoute, /if \(lang !== 'zh' && lang !== 'en'\)/)
})

test('folder reader types and snapshot identifiers are normalized at API boundaries', () => {
  const candidates = source('src/app/api/v1/admin/available-prompts/route.ts')
  const listRoute = source('src/app/api/v1/public-folders/route.ts')
  const detailRoute = source('src/app/api/v1/public-folders/[id]/route.ts')
  const adminRoute = source('src/app/api/v1/admin/public-folders/[id]/prompts/route.ts')
  const importedRoute = source('src/app/api/v1/user/imported-folders/[id]/prompts/route.ts')

  assert.match(candidates, /ORDER BY pp\.created_at DESC, pp\.id DESC/)
  assert.match(listRoute, /const total = Number\(/)
  assert.match(listRoute, /id: Number\(item\.id\)/)
  assert.match(listRoute, /user_id: Number\(item\.user_id\)/)
  assert.match(listRoute, /is_featured: Boolean\(item\.is_featured\)/)
  assert.match(listRoute, /prompt_count: Number\(item\.prompt_count\) \|\| 0/)
  assert.match(detailRoute, /id: Number\(folder\.id\)/)
  assert.match(detailRoute, /user_id: Number\(folder\.user_id\)/)
  assert.match(detailRoute, /is_featured: Boolean\(folder\.is_featured\)/)
  assert.match(detailRoute, /prompt_count: Number\(folder\.prompt_count\) \|\| 0/)

  for (const [label, route, mapperName] of [
    ['admin', adminRoute, 'toAdminFolderSnapshotPrompt'],
    ['imported', importedRoute, 'toImportedSnapshotPrompt'],
  ]) {
    const start = route.indexOf(`function ${mapperName}`)
    const end = route.indexOf('export async function GET', start)
    assert.ok(start >= 0 && end > start, `${label} snapshot mapper missing`)
    const mapper = route.slice(start, end)
    assert.match(mapper, /parsePositiveResourceId\(prompt\.snapshot_id\)/, label)
    assert.match(mapper, /if \(snapshotId == null\)/, label)
    assert.match(mapper, /snapshot_id: snapshotId/, label)
    assert.doesNotMatch(mapper, /snapshot_id: Number\(/, label)
  }
})

test('imported snapshot cards cannot send snapshot ids to publication-only actions', () => {
  const page = source('src/app/imported-folders/[id]/page.tsx')
  assert.match(page, /useState<PublicFolderSnapshotPrompt\[\]>/)
  assert.match(page, /key=\{prompt\.snapshot_id\}/)
  assert.match(page, /disableFavorite=\{true\}/)
  assert.match(page, /disableImport=\{true\}/)
})
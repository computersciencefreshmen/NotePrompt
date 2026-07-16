import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const databaseSource = await readFile(
  new URL('../src/lib/mysql-database.ts', import.meta.url),
  'utf8',
)

function methodSource(name, nextName) {
  const start = databaseSource.indexOf(`  async ${name}`)
  const end = databaseSource.indexOf(`  async ${nextName}`, start + 1)
  assert.notEqual(start, -1, `${name} must exist`)
  assert.notEqual(end, -1, `${nextName} must follow ${name}`)
  return databaseSource.slice(start, end)
}

test('private prompt and folder lookups constrain ownership in SQL', async () => {
  const ownedPromptLookup = methodSource('getOwnedUserPromptById', 'getUserPromptsByUserId')
  const ownedFolderLookup = methodSource('getOwnedFolderById', 'getFoldersByUserId')
  assert.match(ownedPromptLookup, /WHERE up\.id = \? AND up\.user_id = \?/)
  assert.match(ownedFolderLookup, /WHERE id = \? AND user_id = \?/)

  const apiFiles = [
    '../src/app/api/v1/prompts/route.ts',
    '../src/app/api/v1/prompts/[id]/route.ts',
    '../src/app/api/v1/prompts/[id]/import/route.ts',
    '../src/app/api/v1/prompts/[id]/versions/route.ts',
    '../src/app/api/v1/prompts/[id]/versions/[versionId]/route.ts',
    '../src/app/api/v1/folders/route.ts',
    '../src/app/api/v1/folders/[id]/route.ts',
    '../src/app/api/v1/folders/[id]/add-prompt/route.ts',
    '../src/app/api/v1/folders/[id]/prompts/route.ts',
  ]
  const apiSource = (await Promise.all(apiFiles.map(file => (
    readFile(new URL(file, import.meta.url), 'utf8')
  )))).join('\n')
  assert.doesNotMatch(apiSource, /findOwnedResource|getUserPromptById\(|getFolderById\(/)
  assert.match(apiSource, /getOwnedUserPromptById\(/)
  assert.match(apiSource, /getOwnedFolderById\(/)
})

test('prompt and folder limits are checked under a serialized user-row lock', () => {
  const quotaGuardStart = databaseSource.indexOf('private async enforceResourceCreationLimit')
  const quotaGuardEnd = databaseSource.indexOf('\n  async query', quotaGuardStart)
  const quotaGuard = databaseSource.slice(quotaGuardStart, quotaGuardEnd)
  assert.match(quotaGuard, /FROM users[\s\S]*WHERE id = \?[\s\S]*FOR UPDATE/)
  assert.match(quotaGuard, /COUNT\(\*\) AS resource_count FROM user_prompts WHERE user_id = \?/)
  assert.match(quotaGuard, /COUNT\(\*\) AS resource_count FROM folders WHERE user_id = \?/)
  assert.match(quotaGuard, /new EntitlementLimitError\(resource, limit\)/)

  const createPrompt = methodSource('createUserPrompt', 'getUserPromptById')
  const createFolder = methodSource('createFolder', 'getFolderById')
  const snapshotImport = methodSource(
    'importPublicFolderSnapshotPrompt',
    'findUserPromptByTitle',
  )
  assert.match(createPrompt, /beginTransaction\(\)[\s\S]*enforceResourceCreationLimit\(connection, user_id, 'prompt'\)/)
  assert.match(createFolder, /beginTransaction\(\)[\s\S]*enforceResourceCreationLimit\(connection, user_id, 'folder'\)/)
  assert.match(snapshotImport, /beginTransaction\(\)[\s\S]*enforceResourceCreationLimit\(connection, userId, 'prompt'\)/)
})

test('normal prompt writes keep tag replacement inside the prompt transaction', () => {
  const createPrompt = methodSource('createUserPrompt', 'getUserPromptById')
  const updatePrompt = methodSource('updateOwnedUserPromptWithVersion', 'deleteUserPrompt')
  assert.match(createPrompt, /beginTransaction\(\)[\s\S]*replaceUserPromptTags\(connection, insertId, promptData\.tags\)[\s\S]*commit\(\)/)
  assert.match(updatePrompt, /beginTransaction\(\)[\s\S]*replaceUserPromptTags\(connection, promptId, updates\.tags\)[\s\S]*commit\(\)/)
})

test('admin public prompt content and tags update atomically', async () => {
  const updatePublicPrompt = methodSource('updatePublicPromptWithTags', 'deletePublicPrompt')
  assert.match(updatePublicPrompt, /beginTransaction\(\)/)
  assert.match(updatePublicPrompt, /SELECT id FROM public_prompts WHERE id = \? FOR UPDATE/)
  assert.match(updatePublicPrompt, /replacePublicPromptTags\(connection, id, updates\.tags\)/)
  assert.match(updatePublicPrompt, /commit\(\)/)

  const route = await readFile(
    new URL('../src/app/api/v1/admin/public-prompts/[id]/route.ts', import.meta.url),
    'utf8',
  )
  assert.match(route, /updatePublicPromptWithTags\(id, updates\)/)
  assert.doesNotMatch(route, /DELETE FROM public_prompt_tags|addPublicPromptTags\(/)
})

test('external publications have daily and serialized account-wide bounds', async () => {
  const creation = methodSource('createExternalPublicPrompt', 'publishOwnedUserPrompts')
  assert.match(creation, /beginTransaction\(\)/)
  assert.match(creation, /SELECT id, is_active FROM users WHERE id = \? FOR UPDATE/)
  assert.match(creation, /COUNT\(\*\) AS publication_count FROM public_prompts WHERE author_id = \?/)
  assert.match(creation, /account_limit_reached/)
  assert.match(creation, /commit\(\)/)

  const route = await readFile(
    new URL('../src/app/api/v1/external/route.ts', import.meta.url),
    'utf8',
  )
  assert.match(route, /checkAccountRateLimit\([\s\S]*'external-publication-daily'/)
  assert.match(route, /createExternalPublicPrompt\(/)
  assert.match(route, /PUBLICATION_LIMIT_REACHED/)
  assert.doesNotMatch(route, /INSERT INTO public_prompts/)
})

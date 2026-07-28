import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const apiRoot = path.join(projectRoot, 'src/app/api')

async function collectRouteSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const sources = []
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      sources.push(...await collectRouteSources(entryPath))
    } else if (entry.name === 'route.ts') {
      sources.push(await readFile(entryPath, 'utf8'))
    }
  }
  return sources
}

test('the global tag directory and its client contract are retired', async () => {
  const routePath = path.join(apiRoot, 'v1/tags/route.ts')
  await assert.rejects(access(routePath), error => error?.code === 'ENOENT')

  const client = await readFile(path.join(projectRoot, 'src/lib/api.ts'), 'utf8')
  const readme = await readFile(path.join(projectRoot, 'README.md'), 'utf8')
  assert.doesNotMatch(client, /apiRequest[^\n]*['"]\/tags['"]|export const tags\s*=|\n\s*tags,\s*\n/)
  assert.doesNotMatch(readme, /`\/tags`|tags\/\s+#\s+Tag management/)
})

test('HTTP routes cannot enumerate or create global tag dictionary rows', async () => {
  const routeSources = (await collectRouteSources(apiRoot)).join('\n')
  assert.doesNotMatch(routeSources, /\bSELECT\b[^'"`]*\bFROM\s+tags\b/i)
  assert.doesNotMatch(routeSources, /\bINSERT\b[^'"`]*\bINTO\s+tags\b/i)
})

test('tag writes remain prompt-scoped and public reads remain publication-scoped', async () => {
  const database = await readFile(path.join(projectRoot, 'src/lib/mysql-database.ts'), 'utf8')
  assert.match(database, /private async replaceUserPromptTags\(/)
  assert.match(database, /replaceUserPromptTags\(connection, insertId, promptData\.tags\)/)
  assert.match(database, /replaceUserPromptTags\(connection, promptId, updates\.tags\)/)
  assert.match(database, /INSERT INTO public_prompt_tags \(public_prompt_id, tag_id\)/)
  assert.match(database, /public_prompts[\s\S]*publication_state = 'published'/)
  assert.doesNotMatch(database, /user_prompts\.is_public[^\n]*public_prompt_tags/)
})

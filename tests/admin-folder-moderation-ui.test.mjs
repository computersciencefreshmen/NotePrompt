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

test('admin collection detail keeps publication and snapshot identities separate', () => {
  const page = source('src/app/admin/folders/[id]/page.tsx')
  const candidateDialog = source(
    'src/app/admin/folders/[id]/PromptCandidateDialog.tsx',
  )

  assert.match(page, /AdminFolderSnapshotPrompt/)
  assert.match(page, /key=\{prompt\.snapshot_id\}/)
  assert.match(page, /handleRemovePrompt\(prompt\.snapshot_id\)/)
  assert.match(page, /removeSnapshotPromptFromPublicFolder/)
  assert.match(candidateDialog, /addPublishedPromptToPublicFolder/)
  assert.match(candidateDialog, /selectedPublicPromptId/)
  assert.doesNotMatch(page, /\/public-prompts\/\$\{/)
  assert.doesNotMatch(candidateDialog, /\/public-prompts\/\$\{/)
})

test('candidate search is cancellable, debounced, paginated, and stale-safe', () => {
  const dialog = source('src/app/admin/folders/[id]/PromptCandidateDialog.tsx')

  assert.match(dialog, /new AbortController\(\)/)
  assert.match(dialog, /api\.admin\.getAvailablePrompts\(\{/)
  assert.match(dialog, /signal:\s*controller\.signal/)
  assert.match(dialog, /requestIdRef\.current !== requestId/)
  assert.match(dialog, /search\.trim\(\) \? 300 : 0/)
  assert.match(dialog, /page < totalPages/)
  assert.match(dialog, /加载更多/)
  assert.match(dialog, /候选内容加载失败/)
  assert.match(dialog, /重试加载下一页/)
  assert.match(dialog, /handleSearchChange[\s\S]*?cancelRequest\(\)/)

  assert.ok(
    (dialog.match(/setSelectedPublicPromptId\(null\)/g) || []).length >= 3,
    'opening, closing, and searching must clear the candidate selection',
  )
})

test('add and remove mutations have independent pending guards and deterministic close', () => {
  const page = source('src/app/admin/folders/[id]/page.tsx')
  const dialog = source('src/app/admin/folders/[id]/PromptCandidateDialog.tsx')
  const addStart = dialog.indexOf('const handleAdd')
  const searchStart = dialog.indexOf('const handleSearchChange', addStart)
  const addHandler = dialog.slice(addStart, searchStart)

  assert.ok(addStart >= 0 && searchStart > addStart)
  assert.match(addHandler, /if \(!selectedPublicPromptId \|\| adding\) return/)
  assert.match(addHandler, /onOpenChange\(false\)/)
  assert.match(addHandler, /reset\(\)/)
  assert.doesNotMatch(addHandler, /setAdding\(false\)\s*handleOpenChange\(false\)/)

  assert.match(page, /removingSnapshotIds\.has\(snapshotId\)/)
  assert.match(page, /disabled=\{removing\}/)
  assert.match(dialog, /disabled=\{!selectedPublicPromptId \|\| adding\}/)
})

test('candidate concurrency is isolated from the snapshot list page', () => {
  const page = source('src/app/admin/folders/[id]/page.tsx')

  assert.match(page, /<PromptCandidateDialog/)
  assert.match(page, /onAdded=\{\(\) => fetchFolderData\(promptPage\)\}/)
  assert.doesNotMatch(page, /AbortController|candidateRequestIdRef|getAvailablePrompts/)
  assert.ok(page.split('\n').length < 500, 'detail page should stay below 500 lines')
})

test('admin collections use the product tokens and official English fallbacks remain independent', () => {
  const adminPage = source('src/app/admin/page.tsx')
  const fallback = source('src/data/english-featured-folders.ts')

  assert.match(adminPage, /np-product-surface/)
  assert.match(adminPage, /公共收藏集/)
  assert.match(adminPage, /router\.push\(`\/admin\/folders\/\$\{folder\.id\}`\)/)
  assert.match(adminPage, /min-h-11/)

  assert.match(fallback, /englishFeaturedFolders:\s*EnglishFeaturedFolder\[\]\s*=\s*\[/)
  assert.match(fallback, /\bid: 910001,/)
  assert.match(fallback, /promptIds:\s*\[900001,/)
  assert.doesNotMatch(fallback, /\boriginal_folder_id\b/)
})
test('shared candidate client composes caller cancellation with its timeout', () => {
  const client = source('src/lib/api.ts')
  const requestStart = client.indexOf('async function apiRequest')
  const requestEnd = client.indexOf('// 用户认证相关API', requestStart)
  const request = client.slice(requestStart, requestEnd)
  const candidateStart = client.indexOf('getAvailablePrompts:')
  const candidateEnd = client.indexOf('\n  }\n}', candidateStart)
  const candidate = client.slice(candidateStart, candidateEnd)

  assert.ok(requestStart >= 0 && requestEnd > requestStart)
  assert.match(request, /const externalSignal = options\.signal/)
  assert.match(request, /externalSignal\?\.addEventListener\('abort', abortFromExternal/)
  assert.match(request, /signal:\s*requestController\.signal/)
  assert.match(request, /externalSignal\?\.removeEventListener\('abort', abortFromExternal\)/)
  assert.doesNotMatch(request, /signal:\s*controller\.signal/)

  assert.ok(candidateStart >= 0 && candidateEnd > candidateStart)
  assert.match(candidate, /signal\?: AbortSignal/)
  assert.match(candidate, /signal:\s*params\?\.signal/)
})
test('folder refreshes are latest-request-wins across pagination and mutations', () => {
  const page = source('src/app/admin/folders/[id]/page.tsx')
  const fetchStart = page.indexOf('const fetchFolderData')
  const fetchEnd = page.indexOf('\n  useEffect(', fetchStart)
  const fetchFolderData = page.slice(fetchStart, fetchEnd)

  assert.ok(fetchStart >= 0 && fetchEnd > fetchStart)
  assert.match(page, /const folderRequestIdRef = useRef\(0\)/)
  assert.match(fetchFolderData, /const requestId = \+\+folderRequestIdRef\.current/)
  assert.ok(
    (fetchFolderData.match(/folderRequestIdRef\.current !== requestId/g) || []).length >= 2,
    'both stale successes and stale failures must be ignored',
  )
  assert.match(
    fetchFolderData,
    /folderRequestIdRef\.current === requestId\) setLoading\(false\)/,
  )
  assert.match(page, /const \[folderError, setFolderError\] = useState<string \| null>\(null\)/)
  assert.match(fetchFolderData, /setFolderError\(null\)/)
  assert.match(fetchFolderData, /setFolderError\(message\)/)
  assert.match(page, /folderError && !folder/)
  assert.match(page, /onClick=\{\(\) => void fetchFolderData\(promptPage\)\}/)
  assert.match(page, /disabled=\{loading \|\| promptPage <= 1\}/)
  assert.match(page, /disabled=\{loading \|\| promptPage >= promptTotalPages\}/)
})
test('candidate dialog exposes a description and polite loading status', () => {
  const dialog = source('src/app/admin/folders/[id]/PromptCandidateDialog.tsx')

  assert.match(dialog, /DialogDescription/)
  assert.match(dialog, /<DialogDescription[\s\S]*<\/DialogDescription>/)
  assert.match(dialog, /role="status"/)
  assert.match(dialog, /aria-live="polite"/)
})
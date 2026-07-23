import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const projectRoot = path.resolve(import.meta.dirname, '..')
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')

test('prompt assets use the collection rail and explicit, race-safe pagination', () => {
  const page = read('src/app/prompts/page.tsx')
  const protectedRoute = read('src/components/ProtectedRoute.tsx')

  assert.match(page, /PromptAssetRow/)
  assert.match(page, /PromptCollectionRail/)
  assert.match(page, /const requestSequence = \+\+requestSequenceRef\.current/)
  assert.match(page, /requestSequence !== requestSequenceRef\.current/)
  assert.match(page, /const reloadFromFirstPage/)
  assert.match(page, /const handleLoadMore/)
  assert.match(page, /\{loadingMore \? copy\.loadingMore : copy\.loadMore\}/)
  assert.match(page, /loadError && prompts\.length > 0/)
  assert.doesNotMatch(page, /IntersectionObserver|addEventListener\(['"]scroll/)
  assert.doesNotMatch(page, /StatsCards|FolderSection|PromptCard[,\s]/)
  assert.doesNotMatch(`${page}\n${protectedRoute}`, /VISUAL_TEST_MODE|visualTestMode/)
})

test('collection loading is atomic and deletion retains resource identity', () => {
  const page = read('src/app/prompts/page.tsx')

  assert.match(page, /const \[nextFolders, nextImportedFolders\] = await Promise\.all/)
  assert.match(page, /setFolders\(nextFolders\)\s+setImportedFolders\(nextImportedFolders\)/)
  assert.match(page, /kind: 'owned' \| 'imported'/)
  assert.match(page, /if \(kind === 'owned'\)/)
  assert.match(page, /setFolders\(current => current\.filter/)
  assert.match(page, /setImportedFolders\(current => current\.filter/)
  assert.match(page, /if \(selectedFolderId === folderId\) \{\s+setSelectedFolderId\(null\)/)
})

test('successful mutations are not reclassified when derived collection refresh fails', () => {
  const page = read('src/app/prompts/page.tsx')
  const selectionStart = page.indexOf('const handleSelectFolder')
  const deletionStart = page.indexOf('const handleDeletePrompt')

  assert.match(
    page,
    /const refreshOwnedCollections = useCallback\(async \(\) => \{[\s\S]*?catch \(error\) \{[\s\S]*?setCollectionsError\(copy\.collectionsLoadError\)/,
  )
  assert.match(page, /await refreshOwnedCollections\(\)/)
  assert.match(page, /Promise\.all\(\[reloadFromFirstPage\(\), refreshOwnedCollections\(\)\]\)/)
  assert.doesNotMatch(page, /Promise\.all\(\[reloadFromFirstPage\(\), fetchFolders\(\)\]\)/)
  assert.match(
    page.slice(selectionStart, deletionStart),
    /await Promise\.all[\s\S]*setShowFolderSelectDialog\(false\)/,
  )
  assert.doesNotMatch(
    page.slice(selectionStart, deletionStart),
    /finally[\s\S]*setShowFolderSelectDialog\(false\)/,
  )
})

test('imported collections are never drag-and-drop membership targets', () => {
  const rail = read('src/components/PromptCollectionRail.tsx')
  const ownedStart = rail.indexOf('{folders.map')
  const importedStart = rail.indexOf('{importedFolders.map')
  const dialogStart = rail.indexOf('<Dialog open={action !== null}')

  assert.ok(ownedStart > 0 && importedStart > ownedStart && dialogStart > importedStart)
  assert.match(rail.slice(ownedStart, importedStart), /onDrop=/)
  assert.match(rail.slice(ownedStart, importedStart), /onDragOver=/)
  assert.doesNotMatch(rail.slice(importedStart, dialogStart), /onDrop=|onDragOver=|onDragLeave=/)
  assert.match(rail, /onDeleteCollection\('owned'/)
  assert.match(rail, /onDeleteCollection\('imported'/)
  assert.match(rail, /Imported collections/)
  assert.doesNotMatch(rail, /Imported snapshots|\u5bfc\u5165\u5feb\u7167/)
})

test('destructive asset actions await their parent and preserve failures', () => {
  const row = read('src/components/PromptAssetRow.tsx')
  const legacyCard = read('src/components/PromptCard.tsx')

  assert.match(row, /await onConfirm\(\)/)
  assert.match(row, /role="alert"/)
  assert.match(row, /onConfirm=\{\(\) => onDelete\(prompt\.id\)\}/)
  assert.match(row, /onConfirm=\{\(\) => onPublish\(prompt\)\}/)
  assert.doesNotMatch(row, /is_public|private|visibility/i)
  assert.doesNotMatch(row, /public snapshot|\u516c\u5171\u5feb\u7167/i)
  assert.doesNotMatch(row, /aria-label=\{copy\.(collections|tags)\}/)
  assert.doesNotMatch(row, /md:(?:h|w|min-h)-9|md:\[&>button\]/)
  assert.match(legacyCard, /await onDelete\?\.\(prompt\.id,/)
})

test('search and collection dialogs keep keyboard and debounce contracts', () => {
  const search = read('src/components/ui/search-input.tsx')
  const dialogs = read('src/components/FolderDialogs.tsx')

  assert.match(search, /aria-label=\{ariaLabel \|\| placeholder\}/)
  assert.match(search, /aria-label=\{clearLabel\}/)
  const page = read('src/app/prompts/page.tsx')
  assert.match(search, /const handleClear[\s\S]*clearTimeout\(timeoutRef\.current\)[\s\S]*onChange\(''\)/)
  assert.match(dialogs, /<form[\s\S]*onSubmit=/)
  assert.match(dialogs, /<label htmlFor="new-collection-name"/)
  assert.match(dialogs, /<Input\s+id="new-collection-name"/)
  assert.match(search, /\[resetSignal, value\]/)
  assert.match(page, /resetSignal=\{searchResetSignal\}/)
  assert.match(
    page,
    /const handleResetFilters = \(\) => \{\s+setSearchTerm\(''\)\s+setSelectedFolderId\(null\)\s+setSearchResetSignal\(current => current \+ 1\)\s+\}/,
  )
  assert.match(dialogs, /type="submit"/)
})

test('the shared header keeps tablet widths on the compact navigation contract', () => {
  const header = read('src/components/Header.tsx')
  const globalSearch = read('src/components/GlobalSearch.tsx')
  const themeToggle = read('src/components/ThemeToggle.tsx')
  const dialog = read('src/components/ui/dialog.tsx')

  assert.match(header, /hidden items-center gap-5 text-sm lg:flex/)
  assert.match(header, /hover:text-\[var\(--np-ink\)\] lg:hidden/)
  assert.match(header, /px-4 py-4 lg:hidden/)
  assert.doesNotMatch(header, /md:flex space-x-6|md:hidden/)
  assert.match(globalSearch, /h-11 w-11[\s\S]*lg:w-auto/)
  assert.match(themeToggle, /className="h-11 w-11 p-0"/)
  assert.match(dialog, />\u5173\u95ed \/ Close</)
  assert.match(header, /max-\[359px\]:hidden/)
  assert.match(header, /min-\[360px\]:hidden/)
})

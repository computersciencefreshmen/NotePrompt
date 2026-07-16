import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  createPaginationMetadata,
  parseBoundedPagination,
  readBoundedSearchParam,
} from '../src/lib/pagination-policy.ts'
import {
  assertExportBudget,
  assertExportResponseSize,
  ExportSizeError,
  MAX_EXPORT_RECORDS,
  MAX_EXPORT_RESPONSE_BYTES,
  MAX_EXPORT_SOURCE_BYTES,
  measureJsonUtf8Bytes,
} from '../src/lib/export-policy.ts'

function params(query = '') {
  return new URLSearchParams(query)
}

test('pagination uses finite defaults and rejects malformed or oversized values', () => {
  assert.deepEqual(
    parseBoundedPagination(params(), { defaultLimit: 20, maxLimit: 100 }),
    { ok: true, value: { page: 1, limit: 20, offset: 0 } },
  )
  assert.equal(parseBoundedPagination(params('page=0'), { defaultLimit: 20, maxLimit: 100 }).ok, false)
  assert.equal(parseBoundedPagination(params('page=1.5'), { defaultLimit: 20, maxLimit: 100 }).ok, false)
  assert.equal(parseBoundedPagination(params('page=1e2'), { defaultLimit: 20, maxLimit: 100 }).ok, false)
  assert.equal(parseBoundedPagination(params('limit=101'), { defaultLimit: 20, maxLimit: 100 }).ok, false)
})

test('pagination caps the total SQL query window', () => {
  assert.deepEqual(
    parseBoundedPagination(params('page=100&limit=100'), { defaultLimit: 20, maxLimit: 100 }),
    { ok: true, value: { page: 100, limit: 100, offset: 9_900 } },
  )
  const outsideWindow = parseBoundedPagination(
    params('page=101&limit=100'),
    { defaultLimit: 20, maxLimit: 100 },
  )
  assert.equal(outsideWindow.ok, false)
  if (!outsideWindow.ok) assert.match(outsideWindow.error, /10000/)
})

test('search and pagination metadata have stable bounded contracts', () => {
  assert.deepEqual(readBoundedSearchParam(params('search=%20hello%20')), { ok: true, value: 'hello' })
  assert.equal(readBoundedSearchParam(params(`search=${'x'.repeat(201)}`)).ok, false)
  assert.deepEqual(
    createPaginationMetadata('21', { page: 2, limit: 10, offset: 10 }),
    {
      page: 2,
      limit: 10,
      offset: 10,
      total: 21,
      totalPages: 3,
      hasPreviousPage: true,
      hasNextPage: true,
    },
  )
})

test('online export enforces both source and serialized response budgets', () => {
  assert.doesNotThrow(() => assertExportBudget(MAX_EXPORT_RECORDS, MAX_EXPORT_SOURCE_BYTES))
  assert.throws(() => assertExportBudget(MAX_EXPORT_RECORDS + 1, 0), ExportSizeError)
  assert.throws(() => assertExportBudget(0, MAX_EXPORT_SOURCE_BYTES + 1), ExportSizeError)
  assert.equal(measureJsonUtf8Bytes('你'), 5) // JSON quotes plus a three-byte UTF-8 character.
  assert.doesNotThrow(() => assertExportResponseSize({ value: 'small' }))
  assert.throws(
    () => assertExportResponseSize('x'.repeat(MAX_EXPORT_RESPONSE_BYTES + 1)),
    ExportSizeError,
  )
})

test('list routes use shared bounded pagination while preserving legacy array data', async () => {
  const files = [
    '../src/app/api/v1/public-folders/route.ts',
    '../src/app/api/v1/user/published-folders/route.ts',
    '../src/app/api/v1/user/published-prompts/route.ts',
    '../src/app/api/v1/admin/public-folders/route.ts',
    '../src/app/api/v1/admin/public-prompts/route.ts',
    '../src/app/api/v1/admin/ai-usage/route.ts',
    '../src/app/api/v1/admin/available-prompts/route.ts',
    '../src/app/api/v1/admin/users/route.ts',
  ]
  const sources = await Promise.all(files.map(file => readFile(new URL(file, import.meta.url), 'utf8')))
  for (const [index, source] of sources.entries()) {
    assert.match(source, /parseBoundedPagination\(/, `${files[index]} must parse bounded pagination`)
    assert.match(source, /LIMIT \? OFFSET \?|LIMIT \?, \?/, `${files[index]} must bound its SQL result`)
  }

  for (const source of sources.slice(3, 7)) {
    assert.match(source, /data: (folders|prompts|result\.rows),[\s\S]*pagination/)
  }
})

test('user export preflights size and batches tags instead of querying once per prompt', async () => {
  const source = await readFile(
    new URL('../src/app/api/v1/user/export-data/route.ts', import.meta.url),
    'utf8',
  )
  assert.match(source, /assertExportBudget\(recordCount, sourceBytes\)/)
  assert.match(source, /assertExportResponseSize\(responseBody\)/)
  assert.match(source, /WHERE prompt\.user_id = \?[\s\S]*ORDER BY prompt_tag\.user_prompt_id ASC/)
  assert.match(source, /const tagsByPrompt = new Map/)
  assert.doesNotMatch(source, /map\(async \(p\)[\s\S]*user_prompt_tags/)
  assert.match(source, /Cache-Control': 'private, no-store/)
})

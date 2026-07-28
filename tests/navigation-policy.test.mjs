import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { normalizeInternalReturnPath } from '../src/lib/navigation-policy.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')
const fallback = '/prompts'

test('internal return paths preserve safe application navigation', () => {
  for (const [candidate, expected] of [
    ['/prompts', '/prompts'],
    ['/prompts?lang=en', '/prompts?lang=en'],
    ['/folders/42?lang=en#details', '/folders/42?lang=en#details'],
    ['/folders/42/../43', '/folders/43'],
    ['/folders/%E4%B8%AD%E6%96%87', '/folders/%E4%B8%AD%E6%96%87'],
    ['/search?next=https%3A%2F%2Fexample.com%2Fx#results', '/search?next=https%3A%2F%2Fexample.com%2Fx#results'],
    ['/search?q=100%25', '/search?q=100%25'],
  ]) assert.equal(normalizeInternalReturnPath(candidate), expected, candidate)
})

test('external, ambiguous, malformed, and control-bearing return paths fail closed', () => {
  const decodedProtocolRelative = new URLSearchParams('return=%2F%2Fevil.example').get('return')
  const decodedBackslashes = new URLSearchParams('return=%5C%5Cevil.example').get('return')
  const decodedJavascript = new URLSearchParams('return=javascript%3Aalert%281%29').get('return')

  const invalidValues = [
    null,
    undefined,
    42,
    new String('/prompts'),
    '',
    'prompts',
    ' /prompts',
    '/prompts ',
    'https://evil.example/path',
    'http://evil.example/path',
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'mailto:test@example.com',
    decodedProtocolRelative,
    decodedBackslashes,
    decodedJavascript,
    '//evil.example',
    '///evil.example',
    '\\evil.example',
    '/\\evil.example',
    '/safe/%2f%2fevil.example',
    '/safe/%252f%252fevil.example',
    '/safe/%5c%5cevil.example',
    '/safe/%255c%255cevil.example',
    '/safe%0d',
    '/safe%250d',
    '/safe%C2%80',
    '/safe%25C2%2580',
    '/safe%E2%80%A8',
    '/safe%25E2%2580%25A8',
    '/safe\u0000',
    '/safe\u202e',
    '/bad%',
    '/bad%2',
    '/safe/..//evil.example',
    '/%2e%2e//evil.example',
    '/.//evil.example',
    `/${'a'.repeat(2_048)}`,
  ]

  for (const candidate of invalidValues) {
    assert.equal(normalizeInternalReturnPath(candidate), fallback, String(candidate))
  }
})

test('the prompt editor normalizes return once before every navigation sink', () => {
  const route = fs.readFileSync(
    path.join(projectRoot, 'src/app/prompts/edit/[id]/page.tsx'),
    'utf8',
  )

  assert.match(route, /import \{ normalizeInternalReturnPath \} from '@\/lib\/navigation-policy'/)
  assert.match(
    route,
    /setReturnPath\(normalizeInternalReturnPath\(searchParams\.get\('return'\)\)\)/,
  )
  assert.doesNotMatch(route, /setReturnPath\(searchParams\.get\('return'\)/)
  assert.equal((route.match(/router\.push\(returnPath\)/g) || []).length, 4)
})

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_PROMPT_TAGS,
  TagValidationError,
  normalizePromptTagNames,
} from '../src/lib/tag-policy.ts'

test('prompt tags are trimmed, bounded, and deduplicated case-insensitively', () => {
  assert.deepEqual(normalizePromptTagNames([' Research ', 'research', 'Code']), [
    'Research',
    'Code',
  ])
  assert.throws(() => normalizePromptTagNames('tag'), TagValidationError)
  assert.throws(() => normalizePromptTagNames(['']), TagValidationError)
  assert.throws(() => normalizePromptTagNames([42]), TagValidationError)
  assert.throws(
    () => normalizePromptTagNames(Array.from({ length: MAX_PROMPT_TAGS + 1 }, (_, index) => `tag-${index}`)),
    TagValidationError,
  )
})

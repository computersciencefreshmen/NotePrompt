import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findOwnedResource,
  hasCompleteOwnership,
  normalizeResourceIds,
  parsePositiveResourceId,
} from '../src/lib/resource-authorization.ts'

test('parsePositiveResourceId only accepts positive integer identifiers', () => {
  assert.equal(parsePositiveResourceId('12'), 12)
  assert.equal(parsePositiveResourceId(7), 7)
  assert.equal(parsePositiveResourceId('0'), null)
  assert.equal(parsePositiveResourceId('-1'), null)
  assert.equal(parsePositiveResourceId('1.5'), null)
  assert.equal(parsePositiveResourceId('not-an-id'), null)
})

test('findOwnedResource hides missing and other-user resources', async () => {
  const resources = new Map([
    [1, { id: 1, user_id: 10 }],
    [2, { id: 2, user_id: 20 }],
  ])
  const lookup = async id => resources.get(id)

  assert.deepEqual(await findOwnedResource(lookup, 1, 10), { id: 1, user_id: 10 })
  assert.equal(await findOwnedResource(lookup, 2, 10), null)
  assert.equal(await findOwnedResource(lookup, 3, 10), null)
})

test('normalizeResourceIds rejects invalid or duplicate identifiers', () => {
  assert.deepEqual(normalizeResourceIds([1, '2', 3]), [1, 2, 3])
  assert.equal(normalizeResourceIds([1, 1]), null)
  assert.equal(normalizeResourceIds([1, 0]), null)
  assert.equal(normalizeResourceIds([1, 'abc']), null)
})

test('hasCompleteOwnership requires every requested resource to exist and belong to the user', () => {
  const ownedRows = [
    { id: 1, user_id: 10 },
    { id: 2, user_id: 10 },
  ]

  assert.equal(hasCompleteOwnership(ownedRows, [1, 2], 10), true)
  assert.equal(
    hasCompleteOwnership([{ id: '1', user_id: '10' }, { id: '2', user_id: '10' }], [1, 2], 10),
    true,
  )
  assert.equal(hasCompleteOwnership(ownedRows.slice(0, 1), [1, 2], 10), false)
  assert.equal(
    hasCompleteOwnership([ownedRows[0], { id: 2, user_id: 20 }], [1, 2], 10),
    false,
  )
  assert.equal(hasCompleteOwnership([{ id: 1, user_id: 10 }, { id: 3, user_id: 10 }], [1, 2], 10), false)
  assert.equal(hasCompleteOwnership([{ id: 1, user_id: 10 }, { id: 1, user_id: 10 }], [1, 2], 10), false)
})

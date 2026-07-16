import assert from 'node:assert/strict'
import test from 'node:test'

import { mergedPaginationWindow } from '../src/lib/merged-pagination.ts'

const compare = (left, right) => right.rank - left.rank || left.id.localeCompare(right.id)

test('a bounded database window reconstructs the exact merged page', () => {
  for (const databaseCount of [0, 3, 25, 250]) {
    for (const sidecarCount of [0, 1, 7, 31]) {
      const databaseItems = Array.from({ length: databaseCount }, (_, index) => ({
        id: `database-${index}`,
        rank: databaseCount * 5 - index * 3,
      })).sort(compare)
      const sidecarItems = Array.from({ length: sidecarCount }, (_, index) => ({
        id: `sidecar-${index}`,
        rank: sidecarCount * 7 - index * 5 + (index % 3),
      })).sort(compare)
      const fullMerge = [...databaseItems, ...sidecarItems].sort(compare)

      for (const limit of [1, 5, 17]) {
        for (let offset = 0; offset <= fullMerge.length + limit; offset += Math.max(1, limit - 1)) {
          const window = mergedPaginationWindow(offset, limit, sidecarCount)
          assert.ok(window.databaseLimit <= limit + sidecarCount)
          const databaseWindow = databaseItems.slice(
            window.databaseOffset,
            window.databaseOffset + window.databaseLimit,
          )
          const reconstructed = [...databaseWindow, ...sidecarItems]
            .sort(compare)
            .slice(window.localOffset, window.localOffset + limit)
          assert.deepEqual(
            reconstructed,
            fullMerge.slice(offset, offset + limit),
            `database=${databaseCount} sidecar=${sidecarCount} offset=${offset} limit=${limit}`,
          )
        }
      }
    }
  }
})

test('merged pagination rejects unsafe bounds', () => {
  assert.throws(() => mergedPaginationWindow(-1, 10, 1), RangeError)
  assert.throws(() => mergedPaginationWindow(0, 0, 1), RangeError)
  assert.throws(() => mergedPaginationWindow(0, 10.5, 1), RangeError)
})

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BoundedWorkPool,
  WorkQueueCapacityError,
  WorkQueueTimeoutError,
} from '../src/lib/bounded-work-pool.ts'

test('bounded work pools cap active and queued work', async () => {
  const pool = new BoundedWorkPool(1, 1, 1_000)
  let releaseFirst
  let active = 0
  let peak = 0
  const first = pool.run(async () => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise(resolve => { releaseFirst = resolve })
    active -= 1
  })
  const second = pool.run(async () => {
    active += 1
    peak = Math.max(peak, active)
    active -= 1
  })
  await assert.rejects(pool.run(async () => {}), WorkQueueCapacityError)
  releaseFirst()
  await Promise.all([first, second])
  assert.equal(peak, 1)
})

test('queued work has a finite wait deadline', async () => {
  const pool = new BoundedWorkPool(1, 1, 10)
  let releaseFirst
  const first = pool.run(async () => {
    await new Promise(resolve => { releaseFirst = resolve })
  })
  await assert.rejects(pool.run(async () => {}), WorkQueueTimeoutError)
  releaseFirst()
  await first
})

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BoundedWorkPool,
  WorkQueueAbortedError,
  WorkQueueCapacityError,
  WorkQueueTimeoutError,
} from '../src/lib/bounded-work-pool.ts'

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

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

test('pre-aborted work never acquires capacity and the pool remains reusable', async () => {
  const pool = new BoundedWorkPool(1, 1, 1_000)
  const controller = new AbortController()
  controller.abort()
  let calls = 0

  await assert.rejects(
    pool.run(async () => { calls += 1 }, controller.signal),
    WorkQueueAbortedError,
  )
  assert.equal(calls, 0)
  assert.equal(await pool.run(async () => 'reused'), 'reused')
})

test('queued abort removes the waiter and frees queue capacity', async () => {
  const pool = new BoundedWorkPool(1, 1, 1_000)
  const gate = deferred()
  const started = deferred()
  const first = pool.run(async () => {
    started.resolve()
    await gate.promise
  })
  await started.promise

  const controller = new AbortController()
  let abortedWorkCalls = 0
  const aborted = pool.run(async () => {
    abortedWorkCalls += 1
  }, controller.signal)
  controller.abort()
  await assert.rejects(aborted, WorkQueueAbortedError)

  const replacement = pool.run(async () => 'replacement')
  gate.resolve()
  await first
  assert.equal(await replacement, 'replacement')
  assert.equal(abortedWorkCalls, 0)
})

test('abort, timeout, and release races settle once and leave the pool reusable', async () => {
  {
    const pool = new BoundedWorkPool(1, 1, 1_000)
    const gate = deferred()
    const started = deferred()
    const first = pool.run(async () => {
      started.resolve()
      await gate.promise
    })
    await started.promise

    const controller = new AbortController()
    const queued = pool.run(async () => 'should-not-run', controller.signal)
    controller.abort()
    gate.resolve()
    await assert.rejects(queued, WorkQueueAbortedError)
    await first
    assert.equal(await pool.run(async () => 'after-abort'), 'after-abort')
  }

  {
    const pool = new BoundedWorkPool(1, 1, 1_000)
    const gate = deferred()
    const started = deferred()
    const first = pool.run(async () => {
      started.resolve()
      await gate.promise
    })
    await started.promise

    const controller = new AbortController()
    const queued = pool.run(async () => 'release-won', controller.signal)
    gate.resolve()
    await first
    controller.abort()
    assert.equal(await queued, 'release-won')
    assert.equal(await pool.run(async () => 'after-release'), 'after-release')
  }

  {
    const pool = new BoundedWorkPool(1, 1, 10)
    const gate = deferred()
    const started = deferred()
    const first = pool.run(async () => {
      started.resolve()
      await gate.promise
    })
    await started.promise

    const controller = new AbortController()
    const queued = pool.run(async () => 'should-not-run', controller.signal)
    await assert.rejects(queued, WorkQueueTimeoutError)
    controller.abort()
    gate.resolve()
    await first
    assert.equal(await pool.run(async () => 'after-timeout'), 'after-timeout')
  }
})

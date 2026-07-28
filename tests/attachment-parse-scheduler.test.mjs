import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AttachmentParseAdmissionError,
  AttachmentParseScheduler,
} from '../src/lib/attachment-parse-scheduler.ts'
import { WorkQueueAbortedError } from '../src/lib/bounded-work-pool.ts'

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

const nextTurn = () => new Promise(resolve => setImmediate(resolve))

test('one account gets one active parse and one queued parse', async () => {
  const scheduler = new AttachmentParseScheduler({ maxWaitMs: 1_000 })
  const gate = deferred()
  const started = deferred()
  const first = scheduler.run(7, async () => {
    started.resolve()
    await gate.promise
    return 'first'
  })
  await started.promise

  const second = scheduler.run(7, async () => 'second')
  await assert.rejects(
    scheduler.run(7, async () => 'third'),
    error => error instanceof AttachmentParseAdmissionError
      && error.scope === 'account'
      && error.reason === 'capacity',
  )

  gate.resolve()
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second'])
  assert.equal(await scheduler.run(7, async () => 'reused'), 'reused')
})

test('different accounts share the global active and queue bounds', async () => {
  const scheduler = new AttachmentParseScheduler({
    globalConcurrency: 1,
    globalMaxQueued: 1,
    maxWaitMs: 1_000,
  })
  const gate = deferred()
  const started = deferred()
  const first = scheduler.run(1, async () => {
    started.resolve()
    await gate.promise
    return 'first'
  })
  await started.promise

  const second = scheduler.run(2, async () => 'second')
  await nextTurn()
  await assert.rejects(
    scheduler.run(3, async () => 'third'),
    error => error instanceof AttachmentParseAdmissionError
      && error.scope === 'global'
      && error.reason === 'capacity',
  )

  gate.resolve()
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second'])
  assert.equal(await scheduler.run(3, async () => 'reused'), 'reused')
})

test('account wait timeout and queued abort are classified without leaking capacity', async () => {
  const timeoutScheduler = new AttachmentParseScheduler({ maxWaitMs: 20 })
  const timeoutGate = deferred()
  const timeoutStarted = deferred()
  const first = timeoutScheduler.run(10, async () => {
    timeoutStarted.resolve()
    await timeoutGate.promise
  })
  await timeoutStarted.promise
  await assert.rejects(
    timeoutScheduler.run(10, async () => undefined),
    error => error instanceof AttachmentParseAdmissionError
      && error.scope === 'account'
      && error.reason === 'timeout',
  )
  timeoutGate.resolve()
  await first

  const abortScheduler = new AttachmentParseScheduler({ maxWaitMs: 1_000 })
  const abortGate = deferred()
  const abortStarted = deferred()
  const active = abortScheduler.run(11, async () => {
    abortStarted.resolve()
    await abortGate.promise
  })
  await abortStarted.promise
  const controller = new AbortController()
  const queued = abortScheduler.run(11, async () => 'never', controller.signal)
  controller.abort()
  await assert.rejects(queued, WorkQueueAbortedError)
  const replacement = abortScheduler.run(11, async () => 'replacement')
  abortGate.resolve()
  await active
  assert.equal(await replacement, 'replacement')
})

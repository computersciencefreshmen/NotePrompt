import test from 'node:test'
import assert from 'node:assert/strict'
import { AttachmentBusyError, withAttachmentSlot } from '../src/lib/attachment-work.ts'

test('a competing batch is rejected before its body/parser starts', async () => {
  let release
  const first = withAttachmentSlot(() => new Promise(resolve => { release = resolve }))
  let secondStarted = false
  await assert.rejects(withAttachmentSlot(async () => { secondStarted = true }), AttachmentBusyError)
  assert.equal(secondStarted, false)
  release('complete')
  assert.equal(await first, 'complete')
  assert.equal(await withAttachmentSlot(async () => 'retry'), 'retry')
})

test('a failed parser releases capacity for the next batch', async () => {
  await assert.rejects(withAttachmentSlot(async () => { throw new Error('parser failed') }), /parser failed/)
  assert.equal(await withAttachmentSlot(async () => 'recovered'), 'recovered')
})

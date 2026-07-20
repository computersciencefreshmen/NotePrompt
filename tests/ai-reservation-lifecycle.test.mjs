import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { ReservationSettlement } from '../src/lib/reservation-settlement.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')

test('a billable reservation commits exactly once and cannot later be refunded', async () => {
  const settlement = new ReservationSettlement()
  let commits = 0
  let rollbacks = 0

  assert.equal(settlement.commit(() => { commits += 1 }), true)
  assert.equal(settlement.commit(() => { commits += 1 }), false)
  assert.equal(await settlement.rollback(async () => { rollbacks += 1 }), false)
  assert.equal(settlement.currentState, 'committed')
  assert.equal(commits, 1)
  assert.equal(rollbacks, 0)
})

test('concurrent pre-dispatch cancellation compensates exactly once', async () => {
  const settlement = new ReservationSettlement()
  let rollbacks = 0
  const compensate = async () => {
    await Promise.resolve()
    rollbacks += 1
  }

  const results = await Promise.all([
    settlement.rollback(compensate),
    settlement.rollback(compensate),
  ])
  assert.deepEqual(results.sort(), [false, true])
  assert.equal(settlement.commit(() => undefined), false)
  assert.equal(settlement.currentState, 'rolled-back')
  assert.equal(rollbacks, 1)
})

test('stream cancellation is checked before dispatch and dispatch commits the reservation', () => {
  const source = read('src/app/api/v1/ai/optimize-prompt-stream/route.ts')
  const requestProvider = source.indexOf('const requestProvider = async')
  const cancellationCheck = source.indexOf('if (clientCancelled)', requestProvider)
  const commit = source.indexOf('reservation.markProviderCallStarted()', cancellationCheck)
  const fetchCall = source.indexOf('await fetch', commit)

  assert.ok(requestProvider >= 0)
  assert.ok(cancellationCheck > requestProvider)
  assert.ok(commit > cancellationCheck)
  assert.ok(fetchCall > commit)
  assert.match(source, /async cancel\(\)\s*\{\s*clientCancelled = true[\s\S]*await reservation\.rollback\(\)/)
})

test('diagnostics dispatches at most one provider probe per request', () => {
  const source = read('src/app/api/v1/ai/diagnostics/route.ts')

  assert.doesNotMatch(source, /Promise\.all\([\s\S]{0,800}probeProvider\(/)
  assert.match(source, /entries\.find\(entry => entry\.diagnostic\.status === 'configured'\)/)
  assert.match(source, /onProviderCallStart\?\.\(\)[\s\S]{0,200}fetch\(/)
  assert.match(source, /await reservation\.rollback\(\)/)
})

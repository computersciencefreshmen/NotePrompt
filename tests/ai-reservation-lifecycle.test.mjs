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

test('all remote AI routes bind quota policy to the exact dispatch target', () => {
  for (const route of [
    'src/app/api/v1/ai/generate-prompt/route.ts',
    'src/app/api/v1/ai/optimize-prompt/route.ts',
    'src/app/api/v1/ai/optimize-prompt-stream/route.ts',
    'src/app/api/v1/ai/optimize-prompt-multiturn/route.ts',
    'src/app/api/v1/ai/diagnostics/route.ts',
  ]) {
    const source = read(route)
    assert.match(source, /reserveAIUsage\([\s\S]{0,200}\{\s*provider:/, route)
  }
})

test('unmetered personal quota never bypasses model validation or global cost controls', () => {
  const source = read('src/lib/ai-runtime-security.ts')
  const validation = source.indexOf('isActiveTextAIModel(dispatchTarget.provider, dispatchTarget.model)')
  const policy = source.indexOf('getAIPersonalQuotaPolicy(dispatchTarget.provider, dispatchTarget.model)')
  const personal = source.indexOf("personalQuotaPolicy === 'metered'")
  const global = source.indexOf('reserveGlobalAICall()')

  assert.ok(validation >= 0 && validation < policy)
  assert.ok(policy < personal && personal < global)
  assert.match(source, /if \(personalQuotaPolicy === 'metered'\)[\s\S]*\r?\n    }\r?\n\r?\n    const globalCost = await reserveGlobalAICall\(\)/)
  assert.match(source, /new AIUsageReservation\(globalCost\.reservation, personalReservation\)/)
  assert.doesNotMatch(source, /dispatchTarget\.model\.toLowerCase/)
})

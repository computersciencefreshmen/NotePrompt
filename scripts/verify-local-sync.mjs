import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import jwt from 'jsonwebtoken'

// Local production-build checks only. Never use a real account, database or
// model request; signed fixture roles exercise the existing authentication API.
const secret = randomBytes(48).toString('hex')
const port = Number(process.env.SYNC_TEST_PORT || 3316)
const origin = `http://127.0.0.1:${port}`
const token = role => jwt.sign({ userId: 98765, username: 'sync-fixture', userType: role }, secret, { expiresIn: '5m' })
const member = { Authorization: `Bearer ${token('free')}` }
const admin = { Authorization: `Bearer ${token('admin')}` }
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  env: { ...process.env, JWT_SECRET: secret, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
server.stdout.on('data', chunk => { logs = (logs + chunk).slice(-8000) })
server.stderr.on('data', chunk => { logs = (logs + chunk).slice(-8000) })
server.on('error', error => { logs += error.message })
let checks = 0

async function request(label, path, init, status) {
  const response = await fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(15000) })
  assert.equal(response.status, status, label)
  checks++
  return response
}

try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Local production server exited before readiness')
    try { ready = (await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1000) })).ok } catch { /* startup */ }
    if (ready) break
    await delay(200)
  }
  assert.ok(ready, 'local production server readiness')
  await request('optimizer page', '/optimizer', {}, 200)
  await request('anonymous provider read', '/api/v1/provider-config', {}, 401)
  await request('anonymous provider write before parsing', '/api/v1/provider-config', { method: 'POST', body: 'invalid-json' }, 401)
  await request('member provider read', '/api/v1/provider-config', { headers: member }, 403)
  await request('member provider write before parsing', '/api/v1/provider-config', { method: 'POST', headers: member, body: 'invalid-json' }, 403)
  await request('anonymous attachment before multipart parsing', '/api/v1/attachments/parse', { method: 'POST', body: 'invalid-multipart' }, 401)
  await request('anonymous model probe', '/api/v1/ai/diagnostics', { method: 'POST', body: '{"mode":"probe"}' }, 401)
  await request('member cannot spend quota through model probe', '/api/v1/ai/diagnostics', {
    method: 'POST', headers: { ...member, 'Content-Type': 'application/json' }, body: '{"mode":"probe"}',
  }, 403)
  const configured = await (await request('admin provider read', '/api/v1/provider-config', { headers: admin }, 200)).json()
  assert.ok(configured.success && configured.data.providers.length > 0)
  assert.ok(configured.data.providers.every(provider => !Object.hasOwn(provider, 'apiKey')))
  await request('invalid provider rejected without writing config', '/api/v1/provider-config', {
    method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: '{"provider":"__proto__"}',
  }, 400)
  await request('empty multipart rejected', '/api/v1/attachments/parse', { method: 'POST', headers: member, body: new FormData() }, 400)
  const files = new FormData()
  files.append('files', new File(['Hello\n世界'], 'sample.txt', { type: 'text/plain' }))
  files.append('files', new File(['{"value":1}'], 'sample.json', { type: 'application/json' }))
  const parsed = await (await request('authenticated attachment parsing', '/api/v1/attachments/parse', { method: 'POST', headers: member, body: files }, 200)).json()
  assert.equal(parsed.data.attachments.length, 2)
  assert.equal(parsed.data.attachments[0].textPreview, 'Hello\n世界')
  assert.ok(parsed.data.attachments.every(file => file.parseStatus === 'parsed'))
  const excessive = new FormData()
  for (let i = 0; i < 13; i++) excessive.append('files', new File(['x'], `${i}.txt`, { type: 'text/plain' }))
  await request('excess file count rejected', '/api/v1/attachments/parse', { method: 'POST', headers: member, body: excessive }, 400)
  console.log(JSON.stringify({ pass: true, httpChecks: checks, externalModelCalls: 0, databaseQueries: 0 }))
} catch (error) {
  console.error(error.message)
  console.error(logs)
  process.exitCode = 1
} finally {
  if (server.exitCode === null) {
    const closed = once(server, 'exit')
    server.kill()
    await Promise.race([closed, delay(5000)])
    if (server.exitCode === null) server.kill('SIGKILL')
  }
}

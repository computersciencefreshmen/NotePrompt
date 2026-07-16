'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')

function exactLocationBody(config, locationPath) {
  const marker = `location = ${locationPath} {`
  const start = config.indexOf(marker)
  assert.notEqual(start, -1, `missing exact Nginx location for ${locationPath}`)

  const bodyStart = start + marker.length
  let depth = 1
  for (let index = bodyStart; index < config.length; index += 1) {
    if (config[index] === '{') depth += 1
    if (config[index] === '}') depth -= 1
    if (depth === 0) return config.slice(bodyStart, index)
  }

  assert.fail(`unterminated Nginx location for ${locationPath}`)
}

test('readiness cache coalesces concurrent probes', async () => {
  const { createCachedReadinessProbe } = await import('../src/lib/readiness-cache.mjs')
  let resolveProbe
  let probeCalls = 0
  const probe = () => {
    probeCalls += 1
    return new Promise(resolve => {
      resolveProbe = resolve
    })
  }
  const getReadiness = createCachedReadinessProbe({ probe, ttlMs: 2_000 })

  const requests = Array.from({ length: 20 }, () => getReadiness())
  await Promise.resolve()
  assert.equal(probeCalls, 1)
  resolveProbe()

  const results = await Promise.all(requests)
  assert.ok(results.every(result => result.ready === true))
  assert.ok(results.every(result => result === results[0]))
})

test('readiness cache honors TTL and recovers after a cached failure', async () => {
  const { createCachedReadinessProbe } = await import('../src/lib/readiness-cache.mjs')
  let currentTime = 10_000
  let probeCalls = 0
  let shouldFail = true
  const errors = []
  const getReadiness = createCachedReadinessProbe({
    ttlMs: 2_000,
    now: () => currentTime,
    onError: error => errors.push(error),
    probe: async () => {
      probeCalls += 1
      if (shouldFail) throw new Error('database unavailable')
    },
  })

  const failed = await getReadiness()
  assert.equal(failed.ready, false)
  assert.equal(probeCalls, 1)
  assert.equal(errors.length, 1)

  shouldFail = false
  currentTime += 1_999
  assert.equal((await getReadiness()).ready, false)
  assert.equal(probeCalls, 1)

  currentTime += 1
  const recovered = await getReadiness()
  assert.equal(recovered.ready, true)
  assert.equal(probeCalls, 2)

  currentTime -= 10_000
  await getReadiness()
  assert.equal(probeCalls, 3, 'clock rollback must invalidate the cache')
})

test('readiness route reuses the application MySQL pool', () => {
  const route = read('src/app/api/health/route.ts')
  const database = read('src/lib/mysql-database.ts')

  assert.match(route, /import db from '@\/lib\/mysql-database'/)
  assert.match(route, /createCachedReadinessProbe/)
  assert.match(route, /READINESS_CACHE_MS\s*=\s*2_000/)
  assert.match(route, /db\.checkReadiness\(\)/)
  assert.doesNotMatch(route, /mysql2|createConnection/)

  assert.match(database, /async checkReadiness\(\)/)
  assert.match(database, /this\.pool\.query\(\{ sql: 'SELECT 1', timeout: 1500 \}\)/)
})

test('public liveness is dependency free while readiness stays private at the edge', () => {
  const liveness = read('src/app/api/live/route.ts')
  const nginx = read('nginx/nginx.conf')

  assert.match(liveness, /status: 'alive'/)
  assert.doesNotMatch(liveness, /from ['"][^'"]*(?:mysql|redis|database|provider)/i)
  assert.doesNotMatch(liveness, /await\s+/)

  for (const readinessPath of ['/api/health', '/api/v1/health-check']) {
    const location = exactLocationBody(nginx, readinessPath)
    assert.match(location, /return 404;/)
    assert.doesNotMatch(location, /allow |proxy_pass/)
  }

  const publicLiveness = exactLocationBody(nginx, '/api/live')
  assert.match(publicLiveness, /limit_req zone=api/)
  assert.match(publicLiveness, /proxy_pass http:\/\/note_prompt_app;/)
  assert.doesNotMatch(publicLiveness, /deny all;/)
})

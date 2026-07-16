import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FixedWindowRateLimiter,
  checkRateLimit,
  getClientIp,
  GlobalAICostLimiter,
  resolveRateLimitBackendPolicy,
} from '../src/lib/rate-limit.ts'

class FakeAtomicAdapter {
  constructor(now = Date.now) {
    this.now = now
    this.windows = new Map()
    this.tail = Promise.resolve()
  }

  locked(operation) {
    const result = this.tail.then(operation)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }

  consume(key, limit, windowMs) {
    return this.locked(() => {
      const now = this.now()
      let entry = this.windows.get(key)
      if (!entry || entry.expiresAt <= now) {
        entry = { count: 0, expiresAt: now + windowMs }
        this.windows.set(key, entry)
      }
      const allowed = entry.count < limit
      if (allowed) entry.count += 1
      return { allowed, count: entry.count, ttlMs: entry.expiresAt - now }
    })
  }

  refund(key) {
    return this.locked(() => {
      const now = this.now()
      const entry = this.windows.get(key)
      if (!entry || entry.expiresAt <= now || entry.count <= 1) {
        this.windows.delete(key)
        return { count: 0, ttlMs: 0 }
      }
      entry.count -= 1
      return { count: entry.count, ttlMs: entry.expiresAt - now }
    })
  }
}

test('fixed-window limiter remains bounded under concurrent requests', async () => {
  const now = Date.UTC(2026, 6, 16, 0, 0, 0)
  const limiter = new FixedWindowRateLimiter(new FakeAtomicAdapter(() => now), () => now)
  const results = await Promise.all(
    Array.from({ length: 100 }, () => limiter.check('login:ip:test', { windowMs: 60_000, maxRequests: 7 })),
  )

  assert.equal(results.filter(result => result.allowed).length, 7)
  assert.equal(results.filter(result => !result.allowed).length, 93)
  assert.ok(results.every(result => result.remaining >= 0))
})

test('global AI daily reservation can be compensated exactly once', async () => {
  const now = Date.UTC(2026, 6, 16, 8, 0, 0)
  const adapter = new FakeAtomicAdapter(() => now)
  const limiter = new GlobalAICostLimiter(adapter, 2, () => now)

  const first = await limiter.reserve()
  const second = await limiter.reserve()
  const blocked = await limiter.reserve()
  assert.equal(first.allowed, true)
  assert.equal(second.allowed, true)
  assert.equal(blocked.allowed, false)

  await first.reservation.rollback()
  await first.reservation.rollback()
  const replacement = await limiter.reserve()
  const blockedAgain = await limiter.reserve()
  assert.equal(replacement.allowed, true)
  assert.equal(blockedAgain.allowed, false)
})

test('proxy IP policy ignores spoofable forwarding headers unless explicitly trusted', () => {
  const request = new Request('https://example.test', {
    headers: {
      'x-forwarded-for': '198.51.100.10',
      'x-real-ip': '203.0.113.7',
    },
  })
  assert.equal(getClientIp(request, false), 'direct')
  assert.equal(getClientIp(request, true), '203.0.113.7')

  const invalidRealIp = new Request('https://example.test', {
    headers: { 'x-real-ip': '203.0.113.7, 127.0.0.1', 'x-forwarded-for': '198.51.100.10' },
  })
  assert.equal(getClientIp(invalidRealIp, true), 'unknown')
})

test('production without Redis always fails closed even if memory fallback is requested', () => {
  assert.equal(resolveRateLimitBackendPolicy({
    nodeEnv: 'production',
    hasRedisConfig: false,
    allowMemoryFallback: true,
  }), 'unavailable')
  assert.equal(resolveRateLimitBackendPolicy({
    nodeEnv: 'development',
    hasRedisConfig: false,
    allowMemoryFallback: true,
  }), 'memory')
})

test('runtime limiter reports backend unavailability in production without Redis configuration', async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    redisUrl: process.env.REDIS_URL,
    redisHost: process.env.REDIS_HOST,
    memoryFallback: process.env.RATE_LIMIT_ALLOW_MEMORY_FALLBACK,
  }

  try {
    process.env.NODE_ENV = 'production'
    delete process.env.REDIS_URL
    delete process.env.REDIS_HOST
    process.env.RATE_LIMIT_ALLOW_MEMORY_FALLBACK = 'true'
    const result = await checkRateLimit('test-production-fail-closed', { windowMs: 1000, maxRequests: 1 })
    assert.equal(result.allowed, false)
    assert.equal(result.unavailable, true)
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous.nodeEnv
    if (previous.redisUrl === undefined) delete process.env.REDIS_URL
    else process.env.REDIS_URL = previous.redisUrl
    if (previous.redisHost === undefined) delete process.env.REDIS_HOST
    else process.env.REDIS_HOST = previous.redisHost
    if (previous.memoryFallback === undefined) delete process.env.RATE_LIMIT_ALLOW_MEMORY_FALLBACK
    else process.env.RATE_LIMIT_ALLOW_MEMORY_FALLBACK = previous.memoryFallback
  }
})

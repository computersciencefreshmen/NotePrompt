import crypto from 'node:crypto'
import { isIP } from 'node:net'
import Redis, { type RedisOptions } from 'ioredis'

export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

export interface AtomicWindowResult {
  allowed: boolean
  count: number
  ttlMs: number
}

export interface AtomicRateLimitAdapter {
  consume(key: string, limit: number, windowMs: number): Promise<AtomicWindowResult>
  refund(key: string): Promise<{ count: number; ttlMs: number }>
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt?: Date
  unavailable?: boolean
}

type LayeredRateLimitRule = {
  ip: RateLimitConfig
  account: RateLimitConfig
}

const CONSUME_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local ttl = redis.call('PTTL', KEYS[1])
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

if ttl <= 0 then
  current = 0
end

if current >= limit then
  return {0, current, ttl}
end

if current == 0 then
  redis.call('SET', KEYS[1], 1, 'PX', window)
  return {1, 1, window}
end

current = redis.call('INCR', KEYS[1])
ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then
  redis.call('PEXPIRE', KEYS[1], window)
  ttl = window
end
return {1, current, ttl}
`

const REFUND_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local ttl = redis.call('PTTL', KEYS[1])

if current <= 0 or ttl <= 0 then
  redis.call('DEL', KEYS[1])
  return {0, 0}
end

if current == 1 then
  redis.call('DEL', KEYS[1])
  return {0, 0}
end

current = redis.call('DECR', KEYS[1])
return {current, ttl}
`

const DEFAULT_AI_GLOBAL_DAILY_LIMIT = 1000
const REDIS_CONNECT_TIMEOUT_MS = 2500
const REDIS_COMMAND_TIMEOUT_MS = 2500

export class RateLimitUnavailableError extends Error {
  constructor() {
    super('Rate limit backend unavailable')
    this.name = 'RateLimitUnavailableError'
  }
}

function parseLuaTuple(value: unknown, expectedLength: number): number[] {
  if (!Array.isArray(value) || value.length < expectedLength) {
    throw new RateLimitUnavailableError()
  }
  const parsed = value.slice(0, expectedLength).map(item => Number(item))
  if (parsed.some(item => !Number.isFinite(item))) {
    throw new RateLimitUnavailableError()
  }
  return parsed
}

class RedisAtomicRateLimitAdapter implements AtomicRateLimitAdapter {
  private connectPromise: Promise<void> | null = null
  private readonly client: Redis

  constructor(client: Redis) {
    this.client = client
    client.on('error', () => undefined)
  }

  private async waitUntilReady() {
    if (this.client.status === 'ready') return
    if (!this.connectPromise) {
      this.connectPromise = this.connect().finally(() => {
        this.connectPromise = null
      })
    }
    await this.connectPromise
  }

  private async connect() {
    if (this.client.status === 'wait' || this.client.status === 'end') {
      await this.client.connect()
      return
    }
    if (this.client.status === 'ready') return

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => finish(new RateLimitUnavailableError()), REDIS_CONNECT_TIMEOUT_MS)
      const onReady = () => finish()
      const onError = () => finish(new RateLimitUnavailableError())
      const finish = (error?: Error) => {
        clearTimeout(timeout)
        this.client.off('ready', onReady)
        this.client.off('error', onError)
        if (error) reject(error)
        else resolve()
      }
      this.client.once('ready', onReady)
      this.client.once('error', onError)
    })
  }

  async consume(key: string, limit: number, windowMs: number): Promise<AtomicWindowResult> {
    await this.waitUntilReady()
    const raw = await this.client.eval(CONSUME_LUA, 1, key, String(limit), String(windowMs))
    const [allowed, count, ttlMs] = parseLuaTuple(raw, 3)
    return {
      allowed: allowed === 1,
      count: Math.max(0, count),
      ttlMs: Math.max(1, ttlMs),
    }
  }

  async refund(key: string) {
    await this.waitUntilReady()
    const raw = await this.client.eval(REFUND_LUA, 1, key)
    const [count, ttlMs] = parseLuaTuple(raw, 2)
    return { count: Math.max(0, count), ttlMs: Math.max(0, ttlMs) }
  }
}

export class MemoryAtomicRateLimitAdapter implements AtomicRateLimitAdapter {
  private readonly windows = new Map<string, { count: number; expiresAt: number }>()
  private operationCount = 0
  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  async consume(key: string, limit: number, windowMs: number): Promise<AtomicWindowResult> {
    const now = this.now()
    let entry = this.windows.get(key)
    if (!entry || entry.expiresAt <= now) {
      entry = { count: 0, expiresAt: now + windowMs }
      this.windows.set(key, entry)
    }

    const allowed = entry.count < limit
    if (allowed) entry.count += 1
    this.cleanupOccasionally(now)
    return {
      allowed,
      count: entry.count,
      ttlMs: Math.max(1, entry.expiresAt - now),
    }
  }

  async refund(key: string) {
    const now = this.now()
    const entry = this.windows.get(key)
    if (!entry || entry.expiresAt <= now || entry.count <= 1) {
      this.windows.delete(key)
      return { count: 0, ttlMs: 0 }
    }
    entry.count -= 1
    return { count: entry.count, ttlMs: Math.max(1, entry.expiresAt - now) }
  }

  private cleanupOccasionally(now: number) {
    this.operationCount += 1
    if (this.operationCount % 1000 !== 0) return
    for (const [key, entry] of this.windows) {
      if (entry.expiresAt <= now) this.windows.delete(key)
    }
  }
}

export type RateLimitBackendPolicy = 'redis' | 'memory' | 'unavailable'

export function resolveRateLimitBackendPolicy({
  nodeEnv,
  hasRedisConfig,
  allowMemoryFallback,
}: {
  nodeEnv?: string
  hasRedisConfig: boolean
  allowMemoryFallback: boolean
}): RateLimitBackendPolicy {
  if (hasRedisConfig) return 'redis'
  if (nodeEnv !== 'production' && allowMemoryFallback) return 'memory'
  return 'unavailable'
}

function hasRedisConfiguration() {
  return Boolean(process.env.REDIS_URL?.trim() || process.env.REDIS_HOST?.trim())
}

function getRedisConnection(): string | RedisOptions {
  const url = process.env.REDIS_URL?.trim()
  if (url) return url

  const port = Number(process.env.REDIS_PORT || 6379)
  const database = Number(process.env.REDIS_DB || 0)
  return {
    host: process.env.REDIS_HOST?.trim() || '127.0.0.1',
    port: Number.isSafeInteger(port) && port > 0 ? port : 6379,
    db: Number.isSafeInteger(database) && database >= 0 ? database : 0,
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  }
}

function createRedisClient() {
  const connection = getRedisConnection()
  const safetyOptions: RedisOptions = {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
  }
  return typeof connection === 'string'
    ? new Redis(connection, safetyOptions)
    : new Redis({ ...connection, ...safetyOptions })
}

let redisAdapter: RedisAtomicRateLimitAdapter | undefined
let memoryAdapter: MemoryAtomicRateLimitAdapter | undefined

function getRedisAdapter() {
  if (!redisAdapter) redisAdapter = new RedisAtomicRateLimitAdapter(createRedisClient())
  return redisAdapter
}

function getMemoryAdapter() {
  if (!memoryAdapter) memoryAdapter = new MemoryAtomicRateLimitAdapter()
  return memoryAdapter
}

class RuntimeRateLimitAdapter implements AtomicRateLimitAdapter {
  private getPolicy() {
    return resolveRateLimitBackendPolicy({
      nodeEnv: process.env.NODE_ENV,
      hasRedisConfig: hasRedisConfiguration(),
      allowMemoryFallback: process.env.RATE_LIMIT_ALLOW_MEMORY_FALLBACK === 'true',
    })
  }

  private async run<T>(operation: (adapter: AtomicRateLimitAdapter) => Promise<T>): Promise<T> {
    const policy = this.getPolicy()
    if (policy === 'memory') return operation(getMemoryAdapter())
    if (policy === 'unavailable') throw new RateLimitUnavailableError()

    try {
      return await operation(getRedisAdapter())
    } catch {
      if (process.env.NODE_ENV !== 'production' && process.env.RATE_LIMIT_ALLOW_MEMORY_FALLBACK === 'true') {
        return operation(getMemoryAdapter())
      }
      throw new RateLimitUnavailableError()
    }
  }

  consume(key: string, limit: number, windowMs: number) {
    return this.run(adapter => adapter.consume(key, limit, windowMs))
  }

  refund(key: string) {
    return this.run(adapter => adapter.refund(key))
  }
}

const runtimeAdapter = new RuntimeRateLimitAdapter()

function validateConfig(config: RateLimitConfig) {
  if (!Number.isSafeInteger(config.windowMs) || config.windowMs <= 0) {
    throw new Error('Invalid rate limit window')
  }
  if (!Number.isSafeInteger(config.maxRequests) || config.maxRequests <= 0) {
    throw new Error('Invalid rate limit maximum')
  }
}

function keyPrefix() {
  const configured = process.env.RATE_LIMIT_KEY_PREFIX?.trim() || 'note-prompt:rate-limit'
  return configured.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 80)
}

function storageKey(identifier: string) {
  const namespace = identifier.split(':', 1)[0]?.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'request'
  const digest = crypto.createHash('sha256').update(identifier).digest('hex')
  return `${keyPrefix()}:${namespace}:${digest}`
}

export class FixedWindowRateLimiter {
  private readonly adapter: AtomicRateLimitAdapter
  private readonly now: () => number

  constructor(
    adapter: AtomicRateLimitAdapter,
    now: () => number = Date.now,
  ) {
    this.adapter = adapter
    this.now = now
  }

  async check(identifier: string, config: RateLimitConfig): Promise<RateLimitResult> {
    validateConfig(config)
    const result = await this.adapter.consume(storageKey(identifier), config.maxRequests, config.windowMs)
    return {
      allowed: result.allowed,
      remaining: Math.max(0, config.maxRequests - result.count),
      resetAt: new Date(this.now() + result.ttlMs),
    }
  }
}

const runtimeLimiter = new FixedWindowRateLimiter(runtimeAdapter)

export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { windowMs: 60_000, maxRequests: 5 },
): Promise<RateLimitResult> {
  try {
    return await runtimeLimiter.check(identifier, config)
  } catch {
    return { allowed: false, remaining: 0, unavailable: true }
  }
}

export function getClientIp(request: Request, trustProxy = process.env.TRUST_PROXY === 'true'): string {
  if (!trustProxy) return 'direct'

  const candidate = request.headers.get('x-real-ip')?.trim() || ''
  if (!isIP(candidate)) return 'unknown'
  return candidate.toLowerCase().replace(/^::ffff:/, '')
}

function accountDigest(value: string | number) {
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex')
}

export function checkIpRateLimit(request: Request, scope: string, config: RateLimitConfig) {
  return checkRateLimit(`${scope}:ip:${getClientIp(request)}`, config)
}

export function checkAccountRateLimit(scope: string, account: string | number, config: RateLimitConfig) {
  return checkRateLimit(`${scope}:account:${accountDigest(account)}`, config)
}

export const RateLimitRules: Readonly<Record<string, LayeredRateLimitRule>> = {
  login: {
    ip: { windowMs: 5 * 60_000, maxRequests: 20 },
    account: { windowMs: 5 * 60_000, maxRequests: 5 },
  },
  register: {
    ip: { windowMs: 60 * 60_000, maxRequests: 5 },
    account: { windowMs: 60 * 60_000, maxRequests: 3 },
  },
  sendVerification: {
    ip: { windowMs: 60 * 60_000, maxRequests: 10 },
    account: { windowMs: 10 * 60_000, maxRequests: 3 },
  },
  verifyEmail: {
    ip: { windowMs: 10 * 60_000, maxRequests: 30 },
    account: { windowMs: 10 * 60_000, maxRequests: 10 },
  },
  forgotPassword: {
    ip: { windowMs: 60 * 60_000, maxRequests: 10 },
    account: { windowMs: 15 * 60_000, maxRequests: 3 },
  },
  resetPassword: {
    ip: { windowMs: 15 * 60_000, maxRequests: 20 },
    account: { windowMs: 15 * 60_000, maxRequests: 5 },
  },
  accountSecurity: {
    ip: { windowMs: 15 * 60_000, maxRequests: 20 },
    account: { windowMs: 15 * 60_000, maxRequests: 5 },
  },
  ai: {
    ip: { windowMs: 60_000, maxRequests: 60 },
    account: { windowMs: 60_000, maxRequests: 30 },
  },
  attachments: {
    ip: { windowMs: 60_000, maxRequests: 30 },
    account: { windowMs: 60_000, maxRequests: 12 },
  },
}

export function rateLimitHttpStatus(result: { unavailable?: boolean }) {
  return result.unavailable ? 503 : 429
}

export function createRateLimitResponse(result: RateLimitResult | Date) {
  if (!(result instanceof Date) && result.unavailable) {
    return {
      success: false,
      error: '请求保护服务暂不可用，请稍后重试',
      code: 'RATE_LIMIT_UNAVAILABLE',
    }
  }

  const resetAt = result instanceof Date ? result : result.resetAt || new Date(Date.now() + 1000)
  const waitSeconds = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000))
  return {
    success: false,
    error: `请求过于频繁，请${waitSeconds}秒后再试`,
    retryAfter: waitSeconds,
    resetAt: resetAt.toISOString(),
  }
}

function getUtcDailyWindow(now: number) {
  const date = new Date(now)
  const startsOn = date.toISOString().slice(0, 10)
  const resetAtMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
  return { startsOn, resetAtMs, windowMs: Math.max(1000, resetAtMs - now) }
}

export function getGlobalAIDailyLimit() {
  const configured = Number(process.env.AI_GLOBAL_DAILY_LIMIT || DEFAULT_AI_GLOBAL_DAILY_LIMIT)
  return Number.isSafeInteger(configured) && configured >= 0
    ? configured
    : DEFAULT_AI_GLOBAL_DAILY_LIMIT
}

export class GlobalAICostReservation {
  private settled = false
  private readonly adapter: AtomicRateLimitAdapter
  private readonly key: string

  constructor(
    adapter: AtomicRateLimitAdapter,
    key: string,
  ) {
    this.adapter = adapter
    this.key = key
  }

  commit() {
    this.settled = true
  }

  async rollback() {
    if (this.settled) return
    this.settled = true
    try {
      await this.adapter.refund(this.key)
    } catch {
      // A failed compensation remains charged, which is safer than exceeding the cost budget.
    }
  }
}

export interface GlobalAICostResult extends RateLimitResult {
  reservation?: GlobalAICostReservation
}

export class GlobalAICostLimiter {
  private readonly adapter: AtomicRateLimitAdapter
  private readonly dailyLimit: number
  private readonly now: () => number

  constructor(
    adapter: AtomicRateLimitAdapter,
    dailyLimit: number,
    now: () => number = Date.now,
  ) {
    if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 0) {
      throw new Error('Invalid global AI daily limit')
    }
    this.adapter = adapter
    this.dailyLimit = dailyLimit
    this.now = now
  }

  async reserve(): Promise<GlobalAICostResult> {
    const now = this.now()
    const window = getUtcDailyWindow(now)
    const key = storageKey(`ai-global:${window.startsOn}`)
    const result = await this.adapter.consume(key, this.dailyLimit, window.windowMs)
    return {
      allowed: result.allowed,
      remaining: Math.max(0, this.dailyLimit - result.count),
      resetAt: new Date(window.resetAtMs),
      reservation: result.allowed ? new GlobalAICostReservation(this.adapter, key) : undefined,
    }
  }
}

export async function reserveGlobalAICall(): Promise<GlobalAICostResult> {
  try {
    return await new GlobalAICostLimiter(runtimeAdapter, getGlobalAIDailyLimit()).reserve()
  } catch {
    return { allowed: false, remaining: 0, unavailable: true }
  }
}

export function createGlobalAICostResponse(result: GlobalAICostResult) {
  if (result.unavailable) return createRateLimitResponse(result)
  const resetAt = result.resetAt || new Date(Date.now() + 1000)
  return {
    success: false,
    error: 'AI 今日全局调用额度已达上限，请稍后再试',
    retryAfter: Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
    resetAt: resetAt.toISOString(),
    code: 'AI_GLOBAL_DAILY_LIMIT',
  }
}

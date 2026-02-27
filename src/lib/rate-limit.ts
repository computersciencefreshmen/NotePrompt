/**
 * 速率限制条目
 */
interface RateLimitEntry {
  count: number
  resetTime: number
}

/**
 * 速率限制器存储（使用原生Map实现）
 */
class RateLimitStore {
  private store = new Map<string, RateLimitEntry>()
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    // 每分钟清理一次过期条目
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000)
  }

  get(key: string): RateLimitEntry | undefined {
    return this.store.get(key)
  }

  set(key: string, value: RateLimitEntry): void {
    this.store.set(key, value)
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key)
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval)
    this.store.clear()
  }
}

// 单例实例
const rateLimitStore = new RateLimitStore()

/**
 * 速率限制器配置
 */
interface RateLimitConfig {
  /** 时间窗口（毫秒） */
  windowMs: number
  /** 最大请求数 */
  maxRequests: number
}

/**
 * 检查速率限制
 * @param identifier 唯一标识符（IP地址、用户ID等）
 * @param config 限流配置
 * @returns 限流结果
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 5 }
): Promise<{ allowed: boolean; remaining: number; resetAt?: Date }> {
  const now = Date.now()
  const entry = rateLimitStore.get(identifier)

  // 新窗口或已过期
  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + config.windowMs
    })
    return { allowed: true, remaining: config.maxRequests - 1 }
  }

  // 达到限制
  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(entry.resetTime)
    }
  }

  // 增加计数
  entry.count++
  return { allowed: true, remaining: config.maxRequests - entry.count }
}

/**
 * 从请求中获取客户端IP
 */
export function getClientIp(request: Request): string {
  // 检查各种可能的IP头
  const headers = request.headers
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    headers.get('cf-connecting-ip') ||
    'unknown'
  )
}

/**
 * 预定义的限流规则
 */
export const RateLimitRules = {
  /** 登录：5次/分钟 */
  login: { windowMs: 60000, maxRequests: 5 },
  /** 注册：无限制（开发模式） */
  register: { windowMs: 10000, maxRequests: 100 },
  /** 发送验证码：3次/分钟 */
  sendVerification: { windowMs: 60000, maxRequests: 3 },
  /** 验证邮箱：10次/分钟 */
  verifyEmail: { windowMs: 60000, maxRequests: 10 },
} as const

/**
 * 创建带限流的API响应
 */
export function createRateLimitResponse(resetAt: Date) {
  const now = new Date()
  const waitSeconds = Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000))

  return {
    success: false,
    error: `请求过于频繁，请${waitSeconds}秒后再试`,
    retryAfter: waitSeconds,
    resetAt: resetAt.toISOString()
  }
}

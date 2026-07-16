import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import db from '@/lib/mysql-database'
import { RequestPolicyError } from '@/lib/ai-runtime-policy'
import { resolveAiMonthlyLimit } from '@/lib/entitlement-policy'
import { ReservationSettlement } from '@/lib/reservation-settlement'
import {
  checkAccountRateLimit,
  checkIpRateLimit,
  createGlobalAICostResponse,
  createRateLimitResponse,
  type GlobalAICostReservation,
  RateLimitRules,
  rateLimitHttpStatus,
  reserveGlobalAICall,
} from '@/lib/rate-limit'

export type AIUsageMode = 'ai_optimize' | 'ai_generate'

export type AuthenticatedAIUser = {
  id: number
  userType: 'free' | 'pro' | 'admin'
}

type AIAuthResult =
  | { ok: true; user: AuthenticatedAIUser }
  | { ok: false; response: NextResponse }

type AIReservationResult =
  | { ok: true; reservation: AIUsageReservation }
  | { ok: false; response: NextResponse }

function isDatabaseUserActive(value: unknown) {
  return value === true || value === 1 || value === '1'
}

function normalizeUserType(value: unknown): AuthenticatedAIUser['userType'] {
  if (value === 'admin') return 'admin'
  if (value === 'pro' || value === 'premium') return 'pro'
  return 'free'
}

export async function requireAIUser(
  request: NextRequest,
  scope: 'ai' | 'attachments' = 'ai',
): Promise<AIAuthResult> {
  const rule = RateLimitRules[scope]
  const ipLimit = await checkIpRateLimit(request, scope, rule.ip)
  if (!ipLimit.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        createRateLimitResponse(ipLimit),
        { status: rateLimitHttpStatus(ipLimit) },
      ),
    }
  }

  const auth = await requireAuth(request)
  if ('error' in auth) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: auth.error }, { status: auth.status }),
    }
  }

  const accountLimit = await checkAccountRateLimit(scope, auth.user.id, rule.account)
  if (!accountLimit.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        createRateLimitResponse(accountLimit),
        { status: rateLimitHttpStatus(accountLimit) },
      ),
    }
  }

  try {
    const currentUser = await db.getUserById(auth.user.id) as Record<string, unknown> | undefined
    if (!currentUser) {
      return {
        ok: false,
        response: NextResponse.json({ success: false, error: '认证用户不存在' }, { status: 401 }),
      }
    }
    if (!isDatabaseUserActive(currentUser.is_active)) {
      return {
        ok: false,
        response: NextResponse.json({ success: false, error: '账户已停用' }, { status: 403 }),
      }
    }

    return {
      ok: true,
      user: {
        id: auth.user.id,
        userType: isDatabaseUserActive(currentUser.is_admin)
          ? 'admin'
          : normalizeUserType(currentUser.user_type),
      },
    }
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: '认证服务暂不可用' }, { status: 503 }),
    }
  }
}

export class AIUsageReservation {
  private readonly settlement = new ReservationSettlement()

  constructor(
    private readonly userId: number,
    private readonly mode: AIUsageMode,
    private readonly usageDate: string,
    private readonly globalReservation: GlobalAICostReservation,
  ) {}

  commit() {
    return this.settlement.commit(() => this.globalReservation.commit())
  }

  markProviderCallStarted() {
    return this.commit()
  }

  async rollback() {
    return this.settlement.rollback(async () => {
      await Promise.allSettled([
        db.rollbackAIUsage(this.userId, this.mode, this.usageDate),
        this.globalReservation.rollback(),
      ])
    })
  }
}

export async function reserveAIUsage(
  user: AuthenticatedAIUser,
  mode: AIUsageMode,
): Promise<AIReservationResult> {
  const monthlyLimit = resolveAiMonthlyLimit(user.userType)

  try {
    const result = await db.reserveAIUsage(user.id, mode, monthlyLimit)
    if (!result.allowed) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            success: false,
            error: '本月 AI 使用额度已用完',
            limit: monthlyLimit,
            remaining: 0,
          },
          { status: 429 },
        ),
      }
    }

    const globalCost = await reserveGlobalAICall()
    if (!globalCost.allowed || !globalCost.reservation) {
      await db.rollbackAIUsage(user.id, mode, result.usageDate).catch(() => undefined)
      return {
        ok: false,
        response: NextResponse.json(
          createGlobalAICostResponse(globalCost),
          { status: rateLimitHttpStatus(globalCost) },
        ),
      }
    }

    return {
      ok: true,
      reservation: new AIUsageReservation(
        user.id,
        mode,
        result.usageDate,
        globalCost.reservation,
      ),
    }
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'AI 额度服务暂不可用' }, { status: 503 }),
    }
  }
}

export function requestPolicyResponse(error: unknown) {
  if (error instanceof RequestPolicyError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status })
  }
  return NextResponse.json({ success: false, error: '请求处理失败' }, { status: 500 })
}

import { NextRequest, NextResponse } from 'next/server'
import { getAIPersonalQuotaPolicy, isActiveTextAIModel } from '@/config/ai-models'
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

export type NormalizedAIDispatchTarget = Readonly<{
  provider: string
  model: string
}>

type PersonalAIUsageReservation = {
  userId: number
  mode: AIUsageMode
  usageDate: string
}

async function rollbackPersonalAIUsage(reservation: PersonalAIUsageReservation | undefined) {
  if (!reservation) return
  await db.rollbackAIUsage(reservation.userId, reservation.mode, reservation.usageDate)
}

export class AIUsageReservation {
  private readonly settlement = new ReservationSettlement()

  constructor(
    private readonly globalReservation: GlobalAICostReservation,
    private readonly personalReservation?: PersonalAIUsageReservation,
  ) {}

  commit() {
    return this.settlement.commit(() => this.globalReservation.commit())
  }

  markProviderCallStarted() {
    return this.commit()
  }

  async rollback() {
    return this.settlement.rollback(async () => {
      const compensations: Array<Promise<unknown>> = [
        Promise.resolve().then(() => this.globalReservation.rollback()),
      ]
      if (this.personalReservation) {
        compensations.push(
          Promise.resolve().then(() => rollbackPersonalAIUsage(this.personalReservation)),
        )
      }

      const results = await Promise.allSettled(compensations)
      const failedCompensations = results.filter(result => result.status === 'rejected').length
      if (failedCompensations > 0) {
        console.error('AI usage reservation rollback compensation failed', {
          userId: this.personalReservation?.userId,
          mode: this.personalReservation?.mode,
          failedCompensations,
        })
      }
    })
  }
}

export async function reserveAIUsage(
  user: AuthenticatedAIUser,
  mode: AIUsageMode,
  dispatchTarget: NormalizedAIDispatchTarget,
): Promise<AIReservationResult> {
  if (!isActiveTextAIModel(dispatchTarget.provider, dispatchTarget.model)) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: '不支持的模型' }, { status: 400 }),
    }
  }

  const monthlyLimit = resolveAiMonthlyLimit(user.userType)
  const personalQuotaPolicy = getAIPersonalQuotaPolicy(dispatchTarget.provider, dispatchTarget.model)
  let personalReservation: PersonalAIUsageReservation | undefined

  try {
    if (personalQuotaPolicy === 'metered') {
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
      personalReservation = { userId: user.id, mode, usageDate: result.usageDate }
    }

    const globalCost = await reserveGlobalAICall()
    if (!globalCost.allowed || !globalCost.reservation) {
      await rollbackPersonalAIUsage(personalReservation).catch(() => {
        console.error('AI personal usage compensation failed before dispatch', {
          userId: personalReservation?.userId,
          mode: personalReservation?.mode,
          compensationFailed: true,
        })
      })
      personalReservation = undefined
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
      reservation: new AIUsageReservation(globalCost.reservation, personalReservation),
    }
  } catch {
    await rollbackPersonalAIUsage(personalReservation).catch(() => {
      console.error('AI personal usage compensation failed after reservation error', {
        userId: personalReservation?.userId,
        mode: personalReservation?.mode,
        compensationFailed: true,
      })
    })
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

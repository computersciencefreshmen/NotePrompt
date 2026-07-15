import { NextRequest, NextResponse } from 'next/server'
import { FREE_USER_LIMITS, requireAuth } from '@/lib/auth'
import db from '@/lib/mysql-database'
import { RequestPolicyError } from '@/lib/ai-runtime-policy'

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

export async function requireAIUser(request: NextRequest): Promise<AIAuthResult> {
  const auth = await requireAuth(request)
  if ('error' in auth) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: auth.error }, { status: auth.status }),
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
  private settled = false

  constructor(
    private readonly userId: number,
    private readonly mode: AIUsageMode,
    private readonly usageDate: string,
  ) {}

  commit() {
    this.settled = true
  }

  async rollback() {
    if (this.settled) return
    this.settled = true
    try {
      await db.rollbackAIUsage(this.userId, this.mode, this.usageDate)
    } catch {
      console.error('AI usage rollback failed')
    }
  }
}

export async function reserveAIUsage(
  user: AuthenticatedAIUser,
  mode: AIUsageMode,
): Promise<AIReservationResult> {
  const monthlyLimit = user.userType === 'free'
    ? FREE_USER_LIMITS.max_ai_usage_per_month
    : -1

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

    return { ok: true, reservation: new AIUsageReservation(user.id, mode, result.usageDate) }
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

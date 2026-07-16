import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { AuthResponse } from '@/types'
import db from '@/lib/mysql-database'
import { createSessionToken, setSessionCookie } from '@/lib/auth'
import { databaseBoolean, toSafeUserDto } from '@/lib/auth-security'
import { isBrowserCredentialMutationAllowed } from '@/lib/session-security'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import { MAX_AUTH_JSON_BODY_BYTES, MAX_EMAIL_LENGTH } from '@/lib/verification-code-security'
import {
  checkAccountRateLimit,
  checkIpRateLimit,
  createRateLimitResponse,
  RateLimitRules,
  rateLimitHttpStatus,
} from '@/lib/rate-limit'

// A fixed non-account hash keeps unknown-user and wrong-password paths comparable.
const DUMMY_PASSWORD_HASH = '$2b$12$ggC56wQye1z6O.WhGGkT/ud.u6gsFBF/PROx2NSulhmnOFst97fdS'

export async function POST(request: NextRequest) {
  try {
    if (!isBrowserCredentialMutationAllowed(request.headers)) {
      return NextResponse.json<AuthResponse>(
        { success: false, error: '跨站登录请求已拒绝' },
        { status: 403 },
      )
    }

    const ipLimit = await checkIpRateLimit(request, 'login', RateLimitRules.login.ip)
    if (!ipLimit.allowed) {
      return NextResponse.json(createRateLimitResponse(ipLimit), { status: rateLimitHttpStatus(ipLimit) })
    }

    const body = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_AUTH_JSON_BODY_BYTES,
    )
    const username = typeof body.username === 'string' ? body.username.trim() : ''
    const password = body.password

    if (
      !username || username.length > MAX_EMAIL_LENGTH ||
      typeof password !== 'string' || password.length === 0 || password.length > 128
    ) {
      return NextResponse.json<AuthResponse>({
        success: false,
        error: '用户名和密码不能为空'
      }, { status: 400 })
    }

    const accountLimit = await checkAccountRateLimit(
      'login',
      username.toLowerCase(),
      RateLimitRules.login.account,
    )
    if (!accountLimit.allowed) {
      return NextResponse.json(createRateLimitResponse(accountLimit), { status: rateLimitHttpStatus(accountLimit) })
    }

    // 查找用户（支持用户名或邮箱登录）
    let dbUser = await db.getUserByUsername(username)
    if (!dbUser) {
      dbUser = await db.getUserByEmail(username)
    }

    // 验证密码
    const passwordHash = dbUser
      ? String(dbUser.password_hash || DUMMY_PASSWORD_HASH)
      : DUMMY_PASSWORD_HASH
    const isPasswordValid = await bcrypt.compare(password, passwordHash)
    if (!dbUser || !isPasswordValid) {
      return NextResponse.json<AuthResponse>({
        success: false,
        error: '用户名或密码错误'
      }, { status: 401 })
    }

    // 检查账户是否激活
    if (!databaseBoolean(dbUser.is_active)) {
      // 如果未激活且邮箱未验证，提示用户验证邮箱
      if (!databaseBoolean(dbUser.email_verified)) {
        return NextResponse.json<AuthResponse>({
          success: false,
          error: '请先验证您的邮箱后再登录',
          code: 'EMAIL_NOT_VERIFIED',
          data: {
            email_verified: false,
            requireVerification: true,
            user: {
              email: String(dbUser.email || '')
            }
          }
        }, { status: 403 })
      }
      return NextResponse.json<AuthResponse>({
        success: false,
        error: '账户未激活，请联系管理员'
      }, { status: 403 })
    }

    const token = createSessionToken(dbUser)

    const authResponse: AuthResponse = {
      success: true,
      data: {
        user: toSafeUserDto(dbUser)
      }
    }

    const response = NextResponse.json(authResponse)
    setSessionCookie(response, token)
    return response

  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json<AuthResponse>(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('Login error:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json<AuthResponse>({
      success: false,
      error: '服务器内部错误'
    }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { clearSessionCookie, requireAuth } from '@/lib/auth'
import db from '@/lib/mysql-database'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import { getPasswordPolicyError } from '@/lib/password-security'
import {
  checkAccountRateLimit,
  checkIpRateLimit,
  createRateLimitResponse,
  RateLimitRules,
  rateLimitHttpStatus,
} from '@/lib/rate-limit'

const MAX_CHANGE_PASSWORD_BODY_BYTES = 8 * 1024

// POST - 修改密码
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const ipLimit = await checkIpRateLimit(request, 'account-security', RateLimitRules.accountSecurity.ip)
    if (!ipLimit.allowed) {
      return NextResponse.json(createRateLimitResponse(ipLimit), { status: rateLimitHttpStatus(ipLimit) })
    }
    const accountLimit = await checkAccountRateLimit(
      'account-security',
      auth.user.id,
      RateLimitRules.accountSecurity.account,
    )
    if (!accountLimit.allowed) {
      return NextResponse.json(
        createRateLimitResponse(accountLimit),
        { status: rateLimitHttpStatus(accountLimit) },
      )
    }

    const user_id = auth.user.id
    const body = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_CHANGE_PASSWORD_BODY_BYTES,
    )
    if (Object.keys(body).some(key => !['currentPassword', 'newPassword'].includes(key))) {
      return NextResponse.json(
        { success: false, error: '请求包含不支持的字段' },
        { status: 400 },
      )
    }
    const { currentPassword, newPassword } = body

    if (
      typeof currentPassword !== 'string' ||
      currentPassword.length === 0 ||
      currentPassword.length > 128 ||
      typeof newPassword !== 'string'
    ) {
      return NextResponse.json({
        success: false,
        error: '请提供当前密码和新密码'
      }, { status: 400 })
    }

    const passwordPolicyError = getPasswordPolicyError(newPassword)
    if (passwordPolicyError) {
      return NextResponse.json({
        success: false,
        error: passwordPolicyError
      }, { status: 400 })
    }

    if (currentPassword === newPassword) {
      return NextResponse.json({
        success: false,
        error: '新密码不能与当前密码相同'
      }, { status: 400 })
    }

    // 获取用户信息
    const user = await db.getUserById(user_id)
    if (!user) {
      return NextResponse.json({
        success: false,
        error: '用户不存在'
      }, { status: 404 })
    }

    // 验证当前密码
    const isPasswordValid = await bcrypt.compare(currentPassword, String(user.password_hash || ''))
    if (!isPasswordValid) {
      return NextResponse.json({
        success: false,
        error: '当前密码错误'
      }, { status: 401 })
    }

    // 加密新密码
    const newPasswordHash = await bcrypt.hash(newPassword, 12)

    // 更新密码
    await db.query(
      `UPDATE users
       SET password_hash = ?,
           session_version = COALESCE(session_version, 1) + 1,
           updated_at = NOW()
       WHERE id = ?`,
      [newPasswordHash, user_id]
    )

    const response = NextResponse.json({
      success: true,
      message: '密码修改成功，请重新登录'
    })
    clearSessionCookie(response)
    return response
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('修改密码失败')
    return NextResponse.json(
      { success: false, error: '修改密码失败' },
      { status: 500 }
    )
  }
}

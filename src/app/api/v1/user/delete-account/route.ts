import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { clearSessionCookie, requireAuth } from '@/lib/auth'
import db from '@/lib/mysql-database'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import {
  checkAccountRateLimit,
  checkIpRateLimit,
  createRateLimitResponse,
  RateLimitRules,
  rateLimitHttpStatus,
} from '@/lib/rate-limit'

type MutationResult = { affectedRows?: number }

const MAX_DELETE_ACCOUNT_BODY_BYTES = 8 * 1024

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  try {
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

    const body = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_DELETE_ACCOUNT_BODY_BYTES,
    )
    if (Object.keys(body).some(key => key !== 'currentPassword')) {
      return NextResponse.json(
        { success: false, error: '请求包含不支持的字段' },
        { status: 400 },
      )
    }

    const currentPassword = body.currentPassword
    if (
      typeof currentPassword !== 'string' ||
      currentPassword.length === 0 ||
      currentPassword.length > 128
    ) {
      return NextResponse.json(
        { success: false, error: '请输入当前密码' },
        { status: 400 },
      )
    }

    const user = await db.getUserById(auth.user.id)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '账户不存在' },
        { status: 404 },
      )
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      String(user.password_hash || ''),
    )
    if (!passwordMatches) {
      return NextResponse.json(
        { success: false, error: '当前密码错误' },
        { status: 401 },
      )
    }

    // 规范 schema 的用户关联均使用 ON DELETE CASCADE/SET NULL。一条受所有权约束的
    // DELETE 由 MySQL 原子完成，避免旧实现跨十条语句中途失败留下半删除账户。
    const result = await db.query('DELETE FROM users WHERE id = ?', [auth.user.id])
    if (Number((result.rows as MutationResult).affectedRows) !== 1) {
      return NextResponse.json(
        { success: false, error: '账户不存在' },
        { status: 404 },
      )
    }

    const response = NextResponse.json({ success: true, message: '账户已删除' })
    clearSessionCookie(response)
    return response
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('Delete account error')
    return NextResponse.json(
      { success: false, error: '删除账户失败' },
      { status: 500 },
    )
  }
}

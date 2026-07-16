import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import db from '@/lib/mysql-database'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import { getPasswordPolicyError } from '@/lib/password-security'
import {
  MAX_AUTH_JSON_BODY_BYTES,
  getVerificationCodeSecret,
  hashVerificationCode,
  isSixDigitVerificationCode,
  parseVerificationEmail,
  verifyVerificationCodeHash,
} from '@/lib/verification-code-security'
import {
  checkAccountRateLimit,
  checkIpRateLimit,
  createRateLimitResponse,
  RateLimitRules,
  rateLimitHttpStatus,
} from '@/lib/rate-limit'

const INVALID_RESET_RESPONSE = {
  success: false,
  error: '邮箱或验证码无效、已过期，请重新获取验证码',
}

/** POST /api/v1/auth/reset-password */
export async function POST(request: NextRequest) {
  try {
    const ipLimit = await checkIpRateLimit(
      request,
      'reset-password',
      RateLimitRules.resetPassword.ip,
    )
    if (!ipLimit.allowed) {
      return NextResponse.json(
        createRateLimitResponse(ipLimit),
        { status: rateLimitHttpStatus(ipLimit) },
      )
    }

    const body = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_AUTH_JSON_BODY_BYTES,
    )
    const email = parseVerificationEmail(body.email)
    const code = body.code
    const newPassword = body.newPassword

    if (!email || !isSixDigitVerificationCode(code)) {
      return NextResponse.json(
        { success: false, error: '邮箱或验证码格式不正确' },
        { status: 400 },
      )
    }
    const passwordError = getPasswordPolicyError(newPassword)
    if (typeof newPassword !== 'string' || passwordError) {
      return NextResponse.json(
        { success: false, error: passwordError || '密码格式无效' },
        { status: 400 },
      )
    }

    const accountLimit = await checkAccountRateLimit(
      'reset-password',
      email,
      RateLimitRules.resetPassword.account,
    )
    if (!accountLimit.allowed) {
      return NextResponse.json(
        createRateLimitResponse(accountLimit),
        { status: rateLimitHttpStatus(accountLimit) },
      )
    }

    const verificationSecret = getVerificationCodeSecret()
    const submittedCodeHash = hashVerificationCode(
      email,
      'password-reset',
      code,
      verificationSecret,
    )
    const user = await db.getUserByEmail(email)
    const verificationAttempts = Number(user?.verification_attempts || 0)
    const expiresAt = user?.verification_expires
      ? new Date(String(user.verification_expires)).getTime()
      : Number.NaN
    const codeMatches = verifyVerificationCodeHash(
      user?.verification_code,
      email,
      'password-reset',
      code,
      verificationSecret,
    )
    const canReset = Boolean(user) &&
      verificationAttempts < 5 &&
      Number.isFinite(expiresAt) &&
      expiresAt >= Date.now() &&
      codeMatches

    if (!canReset) {
      if (
        user?.verification_code &&
        verificationAttempts < 5 &&
        Number.isFinite(expiresAt) &&
        expiresAt >= Date.now() &&
        !codeMatches
      ) {
        await db.query(
          `UPDATE users
           SET verification_attempts = COALESCE(verification_attempts, 0) + 1
           WHERE id = ? AND verification_code = ?`,
          [user.id, String(user.verification_code)],
        )
      }
      return NextResponse.json(INVALID_RESET_RESPONSE, { status: 400 })
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12)
    const updateResult = await db.query(
      `UPDATE users
       SET password_hash = ?,
           verification_code = NULL,
           verification_expires = NULL,
           verification_attempts = 0,
           email_verify_sent_at = NULL,
           session_version = COALESCE(session_version, 1) + 1,
           updated_at = NOW()
       WHERE id = ?
         AND verification_code = ?
         AND verification_expires >= NOW()
         AND COALESCE(verification_attempts, 0) < 5`,
      [newPasswordHash, user!.id, submittedCodeHash],
    )

    if (Number((updateResult.rows as { affectedRows?: number }).affectedRows) !== 1) {
      return NextResponse.json(INVALID_RESET_RESPONSE, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: '密码重置成功，请使用新密码登录',
    })
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('密码重置失败:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json(
      { success: false, error: '服务器错误，请稍后重试' },
      { status: 500 },
    )
  }
}

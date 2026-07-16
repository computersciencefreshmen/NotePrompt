import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/mysql-database';
import { databaseBoolean } from '@/lib/auth-security';
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy';
import {
  MAX_AUTH_JSON_BODY_BYTES,
  getVerificationCodeSecret,
  hashVerificationCode,
  isSixDigitVerificationCode,
  parseVerificationEmail,
  verifyVerificationCodeHash,
} from '@/lib/verification-code-security';
import {
  checkAccountRateLimit,
  checkIpRateLimit,
  createRateLimitResponse,
  RateLimitRules,
  rateLimitHttpStatus,
} from '@/lib/rate-limit';

const INVALID_VERIFICATION_RESPONSE = {
  success: false,
  error: '邮箱或验证码无效、已过期，请重新获取验证码',
};

/**
 * POST /api/v1/auth/verify-email
 * 验证邮箱验证码
 */
export async function POST(request: NextRequest) {
  try {
    const ipLimit = await checkIpRateLimit(request, 'verify-email', RateLimitRules.verifyEmail.ip);
    if (!ipLimit.allowed) {
      return NextResponse.json(createRateLimitResponse(ipLimit), { status: rateLimitHttpStatus(ipLimit) });
    }

    const body = await readLimitedJson<Record<string, unknown>>(request, MAX_AUTH_JSON_BODY_BYTES);
    const email = parseVerificationEmail(body.email);
    const code = body.code;

    // 参数验证
    if (!email || !isSixDigitVerificationCode(code)) {
      return NextResponse.json(
        { success: false, error: '邮箱或验证码格式不正确' },
        { status: 400 }
      );
    }

    const accountLimit = await checkAccountRateLimit('verify-email', email, RateLimitRules.verifyEmail.account);
    if (!accountLimit.allowed) {
      return NextResponse.json(createRateLimitResponse(accountLimit), { status: rateLimitHttpStatus(accountLimit) });
    }

    const verificationSecret = getVerificationCodeSecret();
    const submittedCodeHash = hashVerificationCode(
      email,
      'email-verification',
      code,
      verificationSecret,
    );

    // 查询用户；所有账户状态和验证码失败均使用相同公开响应。
    const user = await db.getUserByEmail(email);
    const verificationAttempts = Number(user?.verification_attempts || 0);
    const expiresAt = user?.verification_expires
      ? new Date(String(user.verification_expires)).getTime()
      : Number.NaN;
    const codeMatches = verifyVerificationCodeHash(
      user?.verification_code,
      email,
      'email-verification',
      code,
      verificationSecret,
    );
    const canVerify = Boolean(user) &&
      !databaseBoolean(user?.email_verified) &&
      verificationAttempts < 5 &&
      Number.isFinite(expiresAt) &&
      expiresAt >= Date.now() &&
      codeMatches;

    if (!canVerify) {
      // 增加失败计数（防止暴力破解）
      if (
        user &&
        !databaseBoolean(user.email_verified) &&
        user.verification_code &&
        verificationAttempts < 5 &&
        Number.isFinite(expiresAt) &&
        expiresAt >= Date.now() &&
        !codeMatches
      ) {
        await db.query(
          `UPDATE users
           SET verification_attempts = COALESCE(verification_attempts, 0) + 1
           WHERE id = ? AND verification_code = ?`,
          [user.id, String(user.verification_code)]
        );
      }

      return NextResponse.json(
        INVALID_VERIFICATION_RESPONSE,
        { status: 400 }
      );
    }

    // 验证成功，更新用户状态并清除验证码
    const updateResult = await db.query(
      `UPDATE users
       SET email_verified = 1,
           is_active = 1,
           verification_code = NULL,
           verification_expires = NULL,
           verification_attempts = 0,
           updated_at = NOW()
       WHERE id = ?
         AND verification_code = ?
         AND verification_expires >= NOW()
         AND email_verified = 0`,
      [user!.id, submittedCodeHash]
    );

    if (Number((updateResult.rows as { affectedRows?: number }).affectedRows) !== 1) {
      return NextResponse.json(INVALID_VERIFICATION_RESPONSE, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: '邮箱验证成功！',
      data: {
        email: user!.email,
        username: user!.username,
      }
    });
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    console.error('验证邮箱失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}

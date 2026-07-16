import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/mysql-database';
import { emailService } from '@/lib/email-service';
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy';
import {
  MAX_AUTH_JSON_BODY_BYTES,
  getVerificationCodeSecret,
  hashVerificationCode,
  parseVerificationEmail,
} from '@/lib/verification-code-security';
import {
  checkAccountRateLimit,
  checkIpRateLimit,
  createRateLimitResponse,
  RateLimitRules,
  rateLimitHttpStatus,
} from '@/lib/rate-limit';

const GENERIC_RESET_SEND_RESPONSE = {
  success: true,
  message: '如果该邮箱已注册，验证码将发送到您的邮箱',
  expiresIn: 600,
};

/**
 * POST /api/v1/auth/forgot-password
 * 发送密码重置验证码到用户邮箱
 */
export async function POST(request: NextRequest) {
  try {
    const ipLimit = await checkIpRateLimit(request, 'forgot-password', RateLimitRules.forgotPassword.ip);
    if (!ipLimit.allowed) {
      return NextResponse.json(createRateLimitResponse(ipLimit), { status: rateLimitHttpStatus(ipLimit) });
    }

    const body = await readLimitedJson<Record<string, unknown>>(request, MAX_AUTH_JSON_BODY_BYTES);
    const email = parseVerificationEmail(body.email);

    // 参数验证
    if (!email) {
      return NextResponse.json(
        { success: false, error: '邮箱格式不正确' },
        { status: 400 }
      );
    }

    const accountLimit = await checkAccountRateLimit(
      'forgot-password',
      email,
      RateLimitRules.forgotPassword.account,
    );
    if (!accountLimit.allowed) {
      return NextResponse.json(createRateLimitResponse(accountLimit), { status: rateLimitHttpStatus(accountLimit) });
    }

    const resetCode = emailService.generateVerificationCode();
    const resetCodeHash = hashVerificationCode(
      email,
      'password-reset',
      resetCode,
      getVerificationCodeSecret(),
    );

    // 查找用户；不存在时仍完成相同的随机码/HMAC计算并返回统一响应。
    const user = await db.getUserByEmail(email);
    if (!user) {
      return NextResponse.json(GENERIC_RESET_SEND_RESPONSE);
    }

    // 检查是否在短时间内重复发送（60秒内不能重复发送）
    const now = new Date();
    if (user.email_verify_sent_at) {
      const lastSent = new Date(user.email_verify_sent_at as string);
      const secondsSinceLastSent = (now.getTime() - lastSent.getTime()) / 1000;
      if (secondsSinceLastSent < 60) {
        return NextResponse.json(GENERIC_RESET_SEND_RESPONSE);
      }
    }

    const resetExpires = emailService.getVerificationExpiry(10); // 10分钟过期

    // 更新数据库中的验证码（复用 verification_code 字段）
    await db.query(
      `UPDATE users
       SET verification_code = ?,
           verification_expires = ?,
           verification_attempts = 0,
           email_verify_sent_at = NOW()
       WHERE id = ?`,
      [resetCodeHash, resetExpires, user.id]
    );

    // 发送密码重置验证码邮件
    try {
      await emailService.sendPasswordResetCodeEmail({
        to: email,
        username: user.username as string,
        code: resetCode,
      });
    } catch (emailError) {
      console.error('发送密码重置邮件失败:', emailError instanceof Error ? emailError.message : 'unknown');
      await db.query(
        `UPDATE users
         SET verification_code = NULL, verification_expires = NULL
         WHERE id = ? AND verification_code = ?`,
        [user.id, resetCodeHash],
      );
      return NextResponse.json(GENERIC_RESET_SEND_RESPONSE);
    }

    return NextResponse.json(GENERIC_RESET_SEND_RESPONSE);
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    console.error('忘记密码处理失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}

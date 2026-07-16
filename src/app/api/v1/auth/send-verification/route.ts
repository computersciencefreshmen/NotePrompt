import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/mysql-database';
import { emailService } from '@/lib/email-service';
import { databaseBoolean } from '@/lib/auth-security';
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

const GENERIC_SEND_RESPONSE = {
  success: true,
  message: '如果该邮箱需要验证，验证码将发送到您的邮箱',
  expiresIn: 600,
};

/**
 * POST /api/v1/auth/send-verification
 * 发送邮箱验证码
 */
export async function POST(request: NextRequest) {
  try {
    const ipLimit = await checkIpRateLimit(request, 'send-verification', RateLimitRules.sendVerification.ip);
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
      'send-verification',
      email,
      RateLimitRules.sendVerification.account,
    );
    if (!accountLimit.allowed) {
      return NextResponse.json(createRateLimitResponse(accountLimit), { status: rateLimitHttpStatus(accountLimit) });
    }

    const verificationCode = emailService.generateVerificationCode();
    const verificationCodeHash = hashVerificationCode(
      email,
      'email-verification',
      verificationCode,
      getVerificationCodeSecret(),
    );

    // 不存在、已验证或被管理员停用的账户均返回相同的公开响应，
    // 避免账户枚举，也避免停用账户通过邮件流程自行恢复。
    const user = await db.getUserByEmail(email);
    if (!user || databaseBoolean(user.email_verified) || user.admin_disabled_at) {
      return NextResponse.json(GENERIC_SEND_RESPONSE);
    }

    // 检查是否在短时间内重复发送（60秒内不能重复发送）
    const now = new Date();
    if (user.email_verify_sent_at) {
      const lastSent = new Date(String(user.email_verify_sent_at));
      const secondsSinceLastSent = (now.getTime() - lastSent.getTime()) / 1000;
      if (secondsSinceLastSent < 60) {
        return NextResponse.json(GENERIC_SEND_RESPONSE);
      }
    }

    const verificationExpires = emailService.getVerificationExpiry(10); // 10分钟过期

    // 更新数据库中的验证码
    await db.query(
      `UPDATE users
       SET verification_code = ?,
           verification_expires = ?,
           verification_attempts = 0,
           email_verify_sent_at = NOW()
       WHERE id = ?`,
      [verificationCodeHash, verificationExpires, user.id]
    );

    // 发送验证码邮件
    try {
      await emailService.sendVerificationEmail({
        to: email,
        username: String(user.username || ''),
        code: verificationCode,
      });
    } catch (emailError) {
      console.error('发送邮件失败:', emailError instanceof Error ? emailError.message : 'unknown');
      await db.query(
        `UPDATE users
         SET verification_code = NULL, verification_expires = NULL
         WHERE id = ? AND verification_code = ?`,
        [user.id, verificationCodeHash],
      );
      return NextResponse.json(GENERIC_SEND_RESPONSE);
    }

    return NextResponse.json(GENERIC_SEND_RESPONSE);
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    console.error('发送验证码失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}

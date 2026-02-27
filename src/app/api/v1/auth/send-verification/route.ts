import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/mysql-database';
import { emailService } from '@/lib/email-service';

/**
 * POST /api/v1/auth/send-verification
 * 发送邮箱验证码
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    // 参数验证
    if (!email) {
      return NextResponse.json(
        { success: false, error: '邮箱地址不能为空' },
        { status: 400 }
      );
    }

    // 验证邮箱格式
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: '邮箱格式不正确' },
        { status: 400 }
      );
    }

    // 检查用户是否存在
    const user = await db.getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      );
    }

    // 检查是否已验证
    if (user.email_verified) {
      return NextResponse.json(
        { success: false, error: '邮箱已验证，无需重复验证' },
        { status: 400 }
      );
    }

    // 检查是否在短时间内重复发送（60秒内不能重复发送）
    const now = new Date();
    if (user.email_verify_sent_at) {
      const lastSent = new Date(user.email_verify_sent_at);
      const secondsSinceLastSent = (now.getTime() - lastSent.getTime()) / 1000;
      if (secondsSinceLastSent < 60) {
        const remainingSeconds = Math.ceil(60 - secondsSinceLastSent);
        return NextResponse.json(
          {
            success: false,
            error: `请等待 ${remainingSeconds} 秒后再试`,
            remainingSeconds
          },
          { status: 429 }
        );
      }
    }

    // 生成验证码
    const verificationCode = emailService.generateVerificationCode();
    const verificationExpires = emailService.getVerificationExpiry(10); // 10分钟过期

    // 更新数据库中的验证码
    await db.query(
      `UPDATE users
       SET verification_code = ?,
           verification_expires = ?,
           verification_attempts = 0,
           email_verify_sent_at = NOW()
       WHERE id = ?`,
      [verificationCode, verificationExpires, user.id]
    );

    // 发送验证码邮件
    try {
      await emailService.sendVerificationEmail({
        to: email,
        username: user.username,
        code: verificationCode,
      });
    } catch (emailError) {
      console.error('发送邮件失败:', emailError);
      return NextResponse.json(
        { success: false, error: '邮件发送失败，请检查邮箱配置或稍后重试' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '验证码已发送到您的邮箱，请查收',
      expiresIn: 600, // 10分钟 = 600秒
    });
  } catch (error) {
    console.error('发送验证码失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}

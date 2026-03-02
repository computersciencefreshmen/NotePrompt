import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/mysql-database';
import { emailService } from '@/lib/email-service';

/**
 * POST /api/v1/auth/forgot-password
 * 发送密码重置验证码到用户邮箱
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

    // 查找用户
    const user = await db.getUserByEmail(email);
    if (!user) {
      // 安全考虑：即使用户不存在也返回成功（防止邮箱枚举攻击）
      return NextResponse.json({
        success: true,
        message: '如果该邮箱已注册，验证码将发送到您的邮箱',
      });
    }

    // 检查是否在短时间内重复发送（60秒内不能重复发送）
    const now = new Date();
    if (user.email_verify_sent_at) {
      const lastSent = new Date(user.email_verify_sent_at as string);
      const secondsSinceLastSent = (now.getTime() - lastSent.getTime()) / 1000;
      if (secondsSinceLastSent < 60) {
        const remainingSeconds = Math.ceil(60 - secondsSinceLastSent);
        return NextResponse.json(
          {
            success: false,
            error: `请等待 ${remainingSeconds} 秒后再试`,
            remainingSeconds,
          },
          { status: 429 }
        );
      }
    }

    // 生成6位验证码
    const resetCode = emailService.generateVerificationCode();
    const resetExpires = emailService.getVerificationExpiry(10); // 10分钟过期

    // 更新数据库中的验证码（复用 verification_code 字段）
    await db.query(
      `UPDATE users
       SET verification_code = ?,
           verification_expires = ?,
           verification_attempts = 0,
           email_verify_sent_at = NOW()
       WHERE id = ?`,
      [resetCode, resetExpires, user.id]
    );

    // 发送密码重置验证码邮件
    try {
      await emailService.sendPasswordResetCodeEmail({
        to: email,
        username: user.username as string,
        code: resetCode,
      });
    } catch (emailError) {
      console.error('发送密码重置邮件失败:', emailError);
      return NextResponse.json(
        { success: false, error: '邮件发送失败，请稍后重试' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '如果该邮箱已注册，验证码将发送到您的邮箱',
      expiresIn: 600,
    });
  } catch (error) {
    console.error('忘记密码处理失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}

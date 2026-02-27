import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/mysql-database';
import crypto from 'crypto';

/**
 * POST /api/v1/auth/verify-email
 * 验证邮箱验证码
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code } = body;

    // 参数验证
    if (!email || !code) {
      return NextResponse.json(
        { success: false, error: '邮箱和验证码不能为空' },
        { status: 400 }
      );
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: '邮箱格式不正确' },
        { status: 400 }
      );
    }

    // 验证码格式检查（6位数字）
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { success: false, error: '验证码格式不正确' },
        { status: 400 }
      );
    }

    // 查询用户
    const user = await db.getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      );
    }

    // 检查验证尝试次数（防止暴力破解）
    const maxAttempts = 5;
    if (user.verification_attempts && user.verification_attempts >= maxAttempts) {
      return NextResponse.json(
        { success: false, error: '验证尝试次数过多，请重新获取验证码' },
        { status: 429 }
      );
    }

    // 检查是否已验证
    if (user.email_verified) {
      return NextResponse.json(
        { success: false, error: '邮箱已验证' },
        { status: 400 }
      );
    }

    // 检查验证码是否存在
    if (!user.verification_code) {
      return NextResponse.json(
        { success: false, error: '请先获取验证码' },
        { status: 400 }
      );
    }

    // 检查验证码是否过期
    if (user.verification_expires) {
      const expiresTime = new Date(user.verification_expires);
      const now = new Date();
      if (now > expiresTime) {
        return NextResponse.json(
          { success: false, error: '验证码已过期，请重新获取' },
          { status: 400 }
        );
      }
    }

    // 验证码比对（使用constant-time比较防止时序攻击）
    if (!user.verification_code || !crypto.timingSafeEqual(
      Buffer.from(user.verification_code),
      Buffer.from(code)
    )) {
      // 增加失败计数（防止暴力破解）
      await db.query(
        'UPDATE users SET verification_attempts = COALESCE(verification_attempts, 0) + 1 WHERE id = ?',
        [user.id]
      );

      return NextResponse.json(
        { success: false, error: '验证码不正确' },
        { status: 400 }
      );
    }

    // 验证成功，更新用户状态并清除验证码
    await db.query(
      `UPDATE users
       SET email_verified = 1,
           is_active = 1,
           verification_code = NULL,
           verification_expires = NULL,
           verification_attempts = 0,
           updated_at = NOW()
       WHERE id = ?`,
      [user.id]
    );

    return NextResponse.json({
      success: true,
      message: '邮箱验证成功！',
      data: {
        email: user.email,
        username: user.username,
      }
    });
  } catch (error) {
    console.error('验证邮箱失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '@/lib/mysql-database';

/**
 * POST /api/v1/auth/reset-password
 * 验证验证码并重置密码
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code, newPassword } = body;

    // 参数验证
    if (!email || !code || !newPassword) {
      return NextResponse.json(
        { success: false, error: '请填写所有必填字段' },
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

    // 验证码格式检查（6位数字）
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { success: false, error: '验证码格式不正确' },
        { status: 400 }
      );
    }

    // 密码强度验证
    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, error: '密码长度不能少于6位' },
        { status: 400 }
      );
    }

    if (newPassword.length > 50) {
      return NextResponse.json(
        { success: false, error: '密码长度不能超过50位' },
        { status: 400 }
      );
    }

    // 查找用户
    const user = await db.getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      );
    }

    // 检查验证尝试次数（防止暴力破解）
    const maxAttempts = 5;
    if (user.verification_attempts && (user.verification_attempts as number) >= maxAttempts) {
      return NextResponse.json(
        { success: false, error: '验证尝试次数过多，请重新获取验证码' },
        { status: 429 }
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
      const expiresTime = new Date(user.verification_expires as string);
      const now = new Date();
      if (now > expiresTime) {
        return NextResponse.json(
          { success: false, error: '验证码已过期，请重新获取' },
          { status: 400 }
        );
      }
    }

    // 验证码比对（使用 constant-time 比较防止时序攻击）
    const codeMatch = crypto.timingSafeEqual(
      Buffer.from(user.verification_code as string),
      Buffer.from(code)
    );

    if (!codeMatch) {
      // 增加失败计数
      await db.query(
        'UPDATE users SET verification_attempts = COALESCE(verification_attempts, 0) + 1 WHERE id = ?',
        [user.id]
      );

      return NextResponse.json(
        { success: false, error: '验证码不正确' },
        { status: 400 }
      );
    }

    // 验证码正确，加密新密码并更新
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await db.query(
      `UPDATE users
       SET password_hash = ?,
           verification_code = NULL,
           verification_expires = NULL,
           verification_attempts = 0,
           updated_at = NOW()
       WHERE id = ?`,
      [newPasswordHash, user.id]
    );

    return NextResponse.json({
      success: true,
      message: '密码重置成功，请使用新密码登录',
    });
  } catch (error) {
    console.error('密码重置失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}

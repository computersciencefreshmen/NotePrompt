import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import db from '@/lib/mysql-database'
import { emailService } from '@/lib/email-service'
import type { User, RegisterRequest, AuthResponse } from '@/types'
import { checkRateLimit, getClientIp, RateLimitRules, createRateLimitResponse } from '@/lib/rate-limit'

// JWT密钥从统一配置获取
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required')
}

export async function POST(request: NextRequest) {
  try {
    // 检查速率限制（基于IP）
    const ip = getClientIp(request)
    const rateCheck = await checkRateLimit(`register:${ip}`, RateLimitRules.register)

    if (!rateCheck.allowed) {
      return NextResponse.json(
        createRateLimitResponse(rateCheck.resetAt!),
        { status: 429 }
      )
    }

    const body: RegisterRequest = await request.json()
    const { username, email, password } = body

    // 验证输入
    if (!username || !email || !password) {
      return NextResponse.json<AuthResponse>({
        success: false,
        error: '用户名、邮箱和密码都是必填项'
      }, { status: 400 })
    }

    // 验证用户名格式（3-20位，只允许字母、数字、下划线）
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/
    if (!usernameRegex.test(username)) {
      return NextResponse.json<AuthResponse>({
        success: false,
        error: '用户名必须为3-20位，只能包含字母、数字和下划线'
      }, { status: 400 })
    }

    // 验证邮箱格式
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    if (!emailRegex.test(email)) {
      return NextResponse.json<AuthResponse>({
        success: false,
        error: '邮箱格式不正确'
      }, { status: 400 })
    }

    // 验证密码强度（至少8位，包含大小写字母和数字）
    if (password.length < 8) {
      return NextResponse.json<AuthResponse>({
        success: false,
        error: '密码长度至少8位'
      }, { status: 400 })
    }

    const passwordErrors = []
    if (!/[a-z]/.test(password)) passwordErrors.push('小写字母')
    if (!/[A-Z]/.test(password)) passwordErrors.push('大写字母')
    if (!/\d/.test(password)) passwordErrors.push('数字')

    if (passwordErrors.length > 0) {
      return NextResponse.json<AuthResponse>({
        success: false,
        error: `密码必须包含：${passwordErrors.join('、')}`
      }, { status: 400 })
    }

    // 并行检查用户名和邮箱是否已存在（防止用户枚举攻击）
    const [existingUserByUsername, existingUserByEmail] = await Promise.all([
      db.getUserByUsername(username),
      db.getUserByEmail(email)
    ])

    // 使用统一的错误消息，防止泄露用户名或邮箱是否已存在
    if (existingUserByUsername || existingUserByEmail) {
      return NextResponse.json<AuthResponse>({
        success: false,
        error: '用户名或邮箱已被注册'
      }, { status: 400 })
    }

    // 加密密码（使用12轮增强安全性，符合OWASP建议）
    const passwordHash = await bcrypt.hash(password, 12)

    // 创建用户 - 开发模式直接激活，跳过邮箱验证
    const newUser = await db.createUser({
      username,
      email,
      password_hash: passwordHash,
      user_type: 'free',
      is_active: true  // 开发模式直接激活
    })

    // 不记录敏感信息到日志
    if (!newUser) {
      throw new Error('用户创建失败')
    }

    // 检查用户ID是否存在
    if (!newUser.id) {
      throw new Error('用户创建失败：无法获取用户ID')
    }

    // 创建用户统计记录
    try {
      await db.createUserStats(newUser.id as number)
    } catch (error) {
      // 不抛出错误，因为用户已经创建成功
      console.error('用户统计记录创建失败:', error)
    }

    // 更新为邮箱已验证（开发模式跳过验证）
    await db.query(
      `UPDATE users SET email_verified = 1 WHERE id = ?`,
      [newUser.id]
    )

    // 生成 JWT token
    const token = jwt.sign(
      {
        userId: newUser.id,
        username: newUser.username,
        userType: newUser.user_type
      },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    )

    // 返回注册成功信息（开发模式直接返回 token）
    return NextResponse.json<AuthResponse>({
      success: true,
      message: '注册成功！',
      data: {
        user: {
          id: newUser.id as number,
          username: newUser.username as string,
          email: newUser.email as string,
          email_verified: true
        },
        token
      }
    })

  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json<AuthResponse>({
      success: false,
      error: '注册失败，请稍后重试'
    }, { status: 500 })
  }
}

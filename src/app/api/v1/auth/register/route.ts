import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import db from '@/lib/mysql-database'
import { emailService } from '@/lib/email-service'
import type { AuthResponse } from '@/types'
import { createSessionToken, setSessionCookie } from '@/lib/auth'
import { toSafeUserDto } from '@/lib/auth-security'
import { isBrowserCredentialMutationAllowed } from '@/lib/session-security'
import { getPasswordPolicyError } from '@/lib/password-security'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import {
  MAX_AUTH_JSON_BODY_BYTES,
  getVerificationCodeSecret,
  hashVerificationCode,
  parseVerificationEmail,
} from '@/lib/verification-code-security'
import {
  checkAccountRateLimit,
  checkIpRateLimit,
  createRateLimitResponse,
  RateLimitRules,
  rateLimitHttpStatus,
} from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    if (!isBrowserCredentialMutationAllowed(request.headers)) {
      return NextResponse.json<AuthResponse>(
        { success: false, error: '跨站注册请求已拒绝' },
        { status: 403 },
      )
    }

    const ipLimit = await checkIpRateLimit(request, 'register', RateLimitRules.register.ip)
    if (!ipLimit.allowed) {
      return NextResponse.json(createRateLimitResponse(ipLimit), { status: rateLimitHttpStatus(ipLimit) })
    }

    const body = await readLimitedJson<Record<string, unknown>>(request, MAX_AUTH_JSON_BODY_BYTES)
    const username = typeof body.username === 'string' ? body.username.trim() : ''
    const email = parseVerificationEmail(body.email)
    const password = body.password

    // 验证输入
    if (!username || !email || typeof password !== 'string') {
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

    const accountLimit = await checkAccountRateLimit('register', email, RateLimitRules.register.account)
    if (!accountLimit.allowed) {
      return NextResponse.json(createRateLimitResponse(accountLimit), { status: rateLimitHttpStatus(accountLimit) })
    }

    const passwordError = getPasswordPolicyError(password)
    if (passwordError) {
      return NextResponse.json<AuthResponse>({
        success: false,
        error: passwordError
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

    // 是否启用邮箱验证（通过环境变量控制）
    const enableEmailVerification = process.env.ENABLE_EMAIL_VERIFICATION === 'true'

    // 创建用户
    const newUser = await db.createUser({
      username,
      email,
      password_hash: passwordHash,
      user_type: 'free',
      is_active: enableEmailVerification ? false : true
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
      console.error('用户统计记录创建失败:', error instanceof Error ? error.message : 'unknown')
    }

    // 邮箱验证流程
    if (enableEmailVerification) {
      // 生成验证码并发送邮件
      try {
        const verificationCode = emailService.generateVerificationCode()
        const verificationExpires = emailService.getVerificationExpiry(10)
        const verificationCodeHash = hashVerificationCode(
          email,
          'email-verification',
          verificationCode,
          getVerificationCodeSecret(),
        )

        // 更新数据库中的验证码
        await db.query(
          `UPDATE users SET verification_code = ?, verification_expires = ?, verification_attempts = 0, email_verify_sent_at = NOW() WHERE id = ?`,
          [verificationCodeHash, verificationExpires, newUser.id]
        )

        // 发送验证码邮件
        await emailService.sendVerificationEmail({
          to: email,
          username,
          code: verificationCode,
        })
      } catch (emailError) {
        console.error('验证码邮件发送失败:', emailError instanceof Error ? emailError.message : 'unknown')
        // 邮件发送失败不影响注册，用户可以稍后在验证页面重新发送
      }

      // 返回需要邮箱验证的响应
      return NextResponse.json<AuthResponse>({
        success: true,
        message: '注册成功！请查收邮箱验证码完成验证。',
        data: {
          requireVerification: true,
          email_verified: false,
          user: {
            id: newUser.id as number,
            username: newUser.username as string,
            email: newUser.email as string,
            email_verified: false
          }
        }
      })
    }

    // 不需要邮箱验证时，直接激活并通过 HttpOnly Cookie 建立会话
    await db.query(
      `UPDATE users SET email_verified = 1 WHERE id = ?`,
      [newUser.id]
    )

    const activatedUser = await db.getUserById(Number(newUser.id))
    if (!activatedUser) {
      throw new Error('用户激活后无法读取')
    }
    const token = createSessionToken(activatedUser)

    const response = NextResponse.json<AuthResponse>({
      success: true,
      message: '注册成功！',
      data: {
        user: toSafeUserDto(activatedUser)
      }
    })
    setSessionCookie(response, token)
    return response

  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json<AuthResponse>(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    if (
      typeof error === 'object' && error !== null &&
      'code' in error && error.code === 'ER_DUP_ENTRY'
    ) {
      return NextResponse.json<AuthResponse>({
        success: false,
        error: '用户名或邮箱已被注册',
      }, { status: 400 })
    }
    console.error('Registration error:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json<AuthResponse>({
      success: false,
      error: '注册失败，请稍后重试'
    }, { status: 500 })
  }
}

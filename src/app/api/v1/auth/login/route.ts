import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { LoginRequest, AuthResponse } from '@/types'
import db from '@/lib/mysql-database'
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
    const rateCheck = await checkRateLimit(`login:${ip}`, RateLimitRules.login)

    if (!rateCheck.allowed) {
      return NextResponse.json(
        createRateLimitResponse(rateCheck.resetAt!),
        { status: 429 }
      )
    }

    const body: LoginRequest = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json<AuthResponse>({
        success: false,
        error: '用户名和密码不能为空'
      }, { status: 400 })
    }

    // 查找用户（支持用户名或邮箱登录）
    let dbUser = await db.getUserByUsername(username)
    if (!dbUser) {
      dbUser = await db.getUserByEmail(username)
    }

    if (!dbUser) {
      return NextResponse.json<AuthResponse>({
        success: false,
        error: '用户名或密码错误'
      }, { status: 401 })
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, dbUser.password_hash)
    if (!isPasswordValid) {
      return NextResponse.json<AuthResponse>({
        success: false,
        error: '用户名或密码错误'
      }, { status: 401 })
    }

    // 检查账户是否激活
    if (!dbUser.is_active) {
      return NextResponse.json<AuthResponse>({
        success: false,
        error: '账户未激活，请联系管理员'
      }, { status: 403 })
    }

    // 生成JWT token
    const token = jwt.sign(
      {
        userId: dbUser.id,
        username: dbUser.username,
        userType: dbUser.user_type
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    // 返回用户信息（不包含密码）
    const { password_hash, ...userWithoutPassword } = dbUser
    const authResponse: AuthResponse = {
      success: true,
      data: {
        user: userWithoutPassword,
        token
      }
    }

    return NextResponse.json(authResponse)

  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json<AuthResponse>({
      success: false,
      error: '服务器内部错误'
    }, { status: 500 })
  }
}

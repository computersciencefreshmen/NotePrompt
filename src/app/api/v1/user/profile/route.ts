import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import db from '@/lib/mysql-database'
import { toSafeUserDto } from '@/lib/auth-security'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'

const MAX_PROFILE_BODY_BYTES = 16 * 1024
const MAX_PROFILE_EMAIL_CHARS = 191
const MAX_AVATAR_URL_CHARS = 500

// GET - 获取用户资料（需要认证）
export async function GET(request: NextRequest) {
  try {
    // 验证用户认证
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    
    const userId = auth.user.id
    
    // 从数据库获取用户信息
    const user = await db.getUserById(userId)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    const userProfile = toSafeUserDto(user)
    if (!userProfile.avatar_url) {
      userProfile.avatar_url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(userProfile.username)}`
    }

    return NextResponse.json({
      success: true,
      data: userProfile
    })
  } catch (error) {
    console.error('获取用户资料失败:', error)
    return NextResponse.json(
      { success: false, error: '获取用户资料失败' },
      { status: 500 }
    )
  }
}

// PUT - 更新用户资料（需要认证）
export async function PUT(request: NextRequest) {
  try {
    // 验证用户认证
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    
    const userId = auth.user.id
    const input = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_PROFILE_BODY_BYTES,
    )

    // 从数据库获取用户信息
    const user = await db.getUserById(userId)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    const allowedFields = new Set(['username', 'email', 'avatar_url'])
    if (Object.keys(input).some(key => !allowedFields.has(key))) {
      return NextResponse.json(
        { success: false, error: '请求包含不允许修改的字段' },
        { status: 400 }
      )
    }

    if (input.email !== undefined) {
      if (typeof input.email !== 'string' || input.email.trim().length > MAX_PROFILE_EMAIL_CHARS) {
        return NextResponse.json(
          { success: false, error: '邮箱格式无效' },
          { status: 400 },
        )
      }
      if (input.email.trim().toLowerCase() !== String(user.email).toLowerCase()) {
        return NextResponse.json(
          { success: false, error: '暂不支持直接修改邮箱，请使用邮箱验证流程' },
          { status: 400 }
        )
      }
    }

    const setClauses: string[] = []
    const updateParams: Array<string | null | number> = []

    if (input.username !== undefined) {
      if (typeof input.username !== 'string' || !/^[a-zA-Z0-9_]{3,20}$/.test(input.username.trim())) {
        return NextResponse.json(
          { success: false, error: '用户名必须为3-20位，只能包含字母、数字和下划线' },
          { status: 400 }
        )
      }
      const username = input.username.trim()
      const duplicateResult = await db.query(
        'SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1',
        [username, userId]
      )
      if ((duplicateResult.rows as Record<string, unknown>[]).length > 0) {
        return NextResponse.json(
          { success: false, error: '用户名已被使用' },
          { status: 409 }
        )
      }
      setClauses.push('username = ?')
      updateParams.push(username)
    }

    if (input.avatar_url !== undefined) {
      if (input.avatar_url !== null && typeof input.avatar_url !== 'string') {
        return NextResponse.json(
          { success: false, error: '头像地址格式无效' },
          { status: 400 }
        )
      }
      const avatarUrl = typeof input.avatar_url === 'string' ? input.avatar_url.trim() : ''
      if (avatarUrl.length > MAX_AVATAR_URL_CHARS) {
        return NextResponse.json(
          { success: false, error: '头像地址过长' },
          { status: 400 }
        )
      }
      if (avatarUrl) {
        try {
          const parsedUrl = new URL(avatarUrl)
          if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('invalid protocol')
        } catch {
          return NextResponse.json(
            { success: false, error: '头像地址必须是有效的 HTTP/HTTPS URL' },
            { status: 400 }
          )
        }
      }
      setClauses.push('avatar_url = ?')
      updateParams.push(avatarUrl || null)
    }

    if (setClauses.length > 0) {
      updateParams.push(userId)
      await db.query(
        `UPDATE users SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = ?`,
        updateParams
      )
    }

    const updatedUser = await db.getUserById(userId)
    if (!updatedUser) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: toSafeUserDto(updatedUser),
      message: '资料更新成功'
    })
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('更新用户资料失败:', error)
    return NextResponse.json(
      { success: false, error: '更新用户资料失败' },
      { status: 500 }
    )
  }
}

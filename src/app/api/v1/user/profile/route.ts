import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import db from '@/lib/mysql-database'

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

    // 构建用户资料响应
    const userProfile = {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`,
      user_type: user.user_type,
      is_active: user.is_active,
      is_admin: user.is_admin,
      permissions: (() => {
        try {
          if (!user.permissions) {
            return ["create_prompt", "favorite_prompt"]
          }
          
          // 如果已经是数组，直接返回
          if (Array.isArray(user.permissions)) {
            return user.permissions
          }
          
          // 如果是字符串，尝试解析 JSON
          if (typeof user.permissions === 'string') {
            const parsed = JSON.parse(user.permissions)
            return Array.isArray(parsed) ? parsed : ["create_prompt", "favorite_prompt"]
          }
          
          return ["create_prompt", "favorite_prompt"]
        } catch (error) {
          console.warn('解析用户权限失败，使用默认权限:', error)
          return ["create_prompt", "favorite_prompt"]
        }
      })(),
      created_at: user.created_at,
      updated_at: user.updated_at
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
    const body = await request.json()

    // 从数据库获取用户信息
    const user = await db.getUserById(userId)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    // 更新允许的字段
    const updates: Record<string, string> = {}
    if (body.username) updates.username = body.username
    if (body.email) updates.email = body.email
    if (body.avatar_url) updates.avatar_url = body.avatar_url

    // 这里可以添加数据库更新逻辑
    // await db.updateUser(userId, updates)

    return NextResponse.json({
      success: true,
      data: { ...user, ...updates },
      message: '资料更新成功'
    })
  } catch (error) {
    console.error('更新用户资料失败:', error)
    return NextResponse.json(
      { success: false, error: '更新用户资料失败' },
      { status: 500 }
    )
  }
}

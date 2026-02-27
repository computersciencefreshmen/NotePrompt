import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAdminAuth } from '@/lib/auth'

// GET - 获取所有用户列表（管理员权限）
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search')
    const userType = searchParams.get('user_type')

    const offset = (page - 1) * limit

    let query = 'SELECT * FROM users WHERE 1=1'
    const queryParams: (string | number)[] = []

    if (search) {
      query += ' AND (username LIKE ? OR email LIKE ?)'
      const searchTerm = `%${search}%`
      queryParams.push(searchTerm, searchTerm)
    }

    if (userType) {
      query += ' AND user_type = ?'
      queryParams.push(userType)
    }

    query += ' ORDER BY created_at DESC LIMIT ?, ?'
    queryParams.push(String(offset), String(limit))

    const result = await db.query(query, queryParams)
    const users = result.rows as any[]

    // 获取总数
    let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1'
    const countParams: (string | number)[] = []

    if (search) {
      countQuery += ' AND (username LIKE ? OR email LIKE ?)'
      const searchTerm = `%${search}%`
      countParams.push(searchTerm, searchTerm)
    }

    if (userType) {
      countQuery += ' AND user_type = ?'
      countParams.push(userType)
    }

    const countResult = await db.query(countQuery, countParams)
    const total = (countResult.rows as { total: number }[])[0].total

    return NextResponse.json({
      success: true,
      data: {
        users,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('获取用户列表失败:', error)
    return NextResponse.json(
      { success: false, error: '获取用户列表失败' },
      { status: 500 }
    )
  }
}

// PUT - 更新用户权限（管理员权限）
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 403 })
    }

    const { userId, userType, isActive, isAdmin } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { success: false, error: '缺少用户ID' },
        { status: 400 }
      )
    }

    // 更新用户权限
    const updateData: any = {}
    if (userType !== undefined) updateData.user_type = userType
    if (isActive !== undefined) updateData.is_active = isActive
    if (isAdmin !== undefined) updateData.is_admin = isAdmin

    await db.query(
      'UPDATE users SET ? WHERE id = ?',
      [updateData, userId]
    )

    return NextResponse.json({
      success: true,
      message: '用户权限更新成功'
    })
  } catch (error) {
    console.error('更新用户权限失败:', error)
    return NextResponse.json(
      { success: false, error: '更新用户权限失败' },
      { status: 500 }
    )
  }
} 
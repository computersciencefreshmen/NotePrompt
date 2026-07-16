import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAdminAuth } from '@/lib/auth'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import {
  createPaginationMetadata,
  parseBoundedPagination,
  readBoundedSearchParam,
} from '@/lib/pagination-policy'

// 安全的用户字段列表（不包含 password_hash）
const SAFE_USER_FIELDS = 'id, username, email, user_type, is_admin, is_active, avatar_url, created_at, updated_at'
const MAX_ADMIN_USER_BODY_BYTES = 8 * 1024
const VALID_USER_TYPES = new Set(['free', 'pro', 'admin'])

// GET - 获取所有用户列表（管理员权限）
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const paginationResult = parseBoundedPagination(searchParams, {
      defaultLimit: 20,
      maxLimit: 100,
    })
    const searchResult = readBoundedSearchParam(searchParams)
    if (!paginationResult.ok) {
      return NextResponse.json(
        { success: false, error: paginationResult.error },
        { status: 400 },
      )
    }
    if (!searchResult.ok) {
      return NextResponse.json(
        { success: false, error: searchResult.error },
        { status: 400 },
      )
    }
    const { page, limit, offset } = paginationResult.value
    const search = searchResult.value
    const rawUserType = searchParams.get('user_type')
    if (rawUserType && !VALID_USER_TYPES.has(rawUserType)) {
      return NextResponse.json(
        { success: false, error: '无效的用户类型' },
        { status: 400 },
      )
    }
    const userType = rawUserType || ''

    let query = `SELECT ${SAFE_USER_FIELDS} FROM users WHERE 1=1`
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
    queryParams.push(offset, limit)

    const result = await db.query(query, queryParams)
    const users = result.rows as Record<string, unknown>[]

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
    const total = Number((countResult.rows as { total: number | string }[])[0]?.total) || 0
    const pagination = createPaginationMetadata(total, paginationResult.value)

    return NextResponse.json({
      success: true,
      data: {
        users,
        total: pagination.total,
        page,
        limit,
        totalPages: pagination.totalPages,
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

    const body = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_ADMIN_USER_BODY_BYTES,
    )
    const allowedFields = new Set([
      'userId',
      'userType',
      'user_type',
      'isActive',
      'is_active',
      'isAdmin',
      'is_admin',
    ])
    if (Object.keys(body).some(key => !allowedFields.has(key))) {
      return NextResponse.json(
        { success: false, error: '请求包含不支持的字段' },
        { status: 400 },
      )
    }
    const userId = Number(body.userId)
    const userType = body.userType ?? body.user_type
    const isActive = body.isActive ?? body.is_active
    const isAdmin = body.isAdmin ?? body.is_admin

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return NextResponse.json(
        { success: false, error: '无效的用户ID' },
        { status: 400 }
      )
    }

    if (userType !== undefined && (typeof userType !== 'string' || !VALID_USER_TYPES.has(userType))) {
      return NextResponse.json(
        { success: false, error: '无效的用户类型' },
        { status: 400 }
      )
    }
    if (isActive !== undefined && typeof isActive !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'is_active 必须是布尔值' },
        { status: 400 }
      )
    }
    if (isAdmin !== undefined && typeof isAdmin !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'is_admin 必须是布尔值' },
        { status: 400 }
      )
    }

    if (userId === auth.user.id && (isActive === false || isAdmin === false)) {
      return NextResponse.json(
        { success: false, error: '不能停用自己的账号或移除自己的管理员权限' },
        { status: 400 },
      )
    }

    // 构建参数化 UPDATE 语句
    const setClauses: string[] = []
    const updateParams: (string | number | boolean)[] = []

    if (userType !== undefined) {
      setClauses.push('user_type = ?')
      updateParams.push(userType)
    }
    if (isActive !== undefined) {
      setClauses.push('is_active = ?')
      updateParams.push(isActive ? 1 : 0)
    }
    if (isAdmin !== undefined) {
      setClauses.push('is_admin = ?')
      updateParams.push(isAdmin ? 1 : 0)
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { success: false, error: '没有需要更新的字段' },
        { status: 400 }
      )
    }

    setClauses.push('session_version = COALESCE(session_version, 1) + 1')
    setClauses.push('updated_at = NOW()')
    updateParams.push(userId)
    const updateResult = await db.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`,
      updateParams
    )

    const affectedRows = Number((updateResult.rows as { affectedRows?: number }).affectedRows)
    if (affectedRows > 1) {
      throw new Error('Admin update affected more than one user')
    }
    if (affectedRows === 0) {
      const existingResult = await db.query('SELECT id FROM users WHERE id = ? LIMIT 1', [userId])
      if ((existingResult.rows as Record<string, unknown>[]).length > 0) {
        return NextResponse.json({ success: true, message: '用户权限未发生变化' })
      }
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '用户权限更新成功'
    })
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('更新用户权限失败:', error)
    return NextResponse.json(
      { success: false, error: '更新用户权限失败' },
      { status: 500 }
    )
  }
}

// DELETE - 删除用户（管理员权限）
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 403 })
    }

    const body = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_ADMIN_USER_BODY_BYTES,
    )
    if (Object.keys(body).some(key => key !== 'userId')) {
      return NextResponse.json(
        { success: false, error: '请求包含不支持的字段' },
        { status: 400 },
      )
    }
    const userId = Number(body.userId)

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return NextResponse.json(
        { success: false, error: '无效的用户ID' },
        { status: 400 }
      )
    }

    // 不能删除自己
    if (userId === auth.user.id) {
      return NextResponse.json(
        { success: false, error: '不能删除自己的账号' },
        { status: 400 }
      )
    }

    const deleteResult = await db.query('DELETE FROM users WHERE id = ?', [userId])
    if (Number((deleteResult.rows as { affectedRows?: number }).affectedRows) !== 1) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      message: '用户已删除'
    })
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('删除用户失败:', error)
    return NextResponse.json(
      { success: false, error: '删除用户失败' },
      { status: 500 }
    )
  }
}

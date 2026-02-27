import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAuth } from '@/lib/auth'
import db from '@/lib/mysql-database'

// POST - 修改密码
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const user_id = auth.user.id
    const body = await request.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return NextResponse.json({
        success: false,
        error: '请提供当前密码和新密码'
      }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({
        success: false,
        error: '新密码长度不能少于6位'
      }, { status: 400 })
    }

    // 获取用户信息
    const user = await db.getUserById(user_id)
    if (!user) {
      return NextResponse.json({
        success: false,
        error: '用户不存在'
      }, { status: 404 })
    }

    // 验证当前密码
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash)
    if (!isPasswordValid) {
      return NextResponse.json({
        success: false,
        error: '当前密码错误'
      }, { status: 401 })
    }

    // 加密新密码
    const newPasswordHash = await bcrypt.hash(newPassword, 10)

    // 更新密码
    await db.query(
      'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
      [newPasswordHash, user_id]
    )

    return NextResponse.json({
      success: true,
      message: '密码修改成功'
    })
  } catch (error) {
    console.error('修改密码失败:', error)
    return NextResponse.json(
      { success: false, error: '修改密码失败' },
      { status: 500 }
    )
  }
}

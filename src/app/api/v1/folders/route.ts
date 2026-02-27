import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 获取用户文件夹列表
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    const folders = await db.getFoldersByUserId(userId)

    return NextResponse.json({
      success: true,
      data: folders
    })
  } catch (error) {
    console.error('Get folders error:', error)
    return NextResponse.json(
      { success: false, error: '获取文件夹失败' },
      { status: 500 }
    )
  }
}

// POST - 创建新文件夹
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    const { name, parent_id } = await request.json()

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: '文件夹名称不能为空' },
        { status: 400 }
      )
    }

    const folder = await db.createFolder({
      name: name.trim(),
      user_id: userId,
      parent_id: parent_id || null
    })

    return NextResponse.json({
      success: true,
      data: folder
    })
  } catch (error) {
    console.error('Create folder error:', error)
    return NextResponse.json(
      { success: false, error: '创建文件夹失败' },
      { status: 500 }
    )
  }
}

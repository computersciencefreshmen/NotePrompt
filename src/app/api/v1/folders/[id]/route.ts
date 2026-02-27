import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 获取单个文件夹
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    const { id: idStr } = await params
    const id = parseInt(idStr)

    const folder = await db.getFolderById(id)
    if (!folder || (folder as Record<string, unknown>).user_id !== userId) {
      return NextResponse.json(
        { success: false, error: '文件夹不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: folder
    })
  } catch (error) {
    console.error('Get folder error:', error)
    return NextResponse.json(
      { success: false, error: '获取文件夹失败' },
      { status: 500 }
    )
  }
}

// PUT - 更新文件夹
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    const { id: idStr } = await params
    const id = parseInt(idStr)
    const { name } = await request.json()

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: '文件夹名称不能为空' },
        { status: 400 }
      )
    }

    // 更新文件夹名称
    const updatedFolder = await db.updateFolder(id, {
      name: name.trim()
    })

    if (!updatedFolder) {
      return NextResponse.json(
        { success: false, error: '文件夹不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: updatedFolder
    })
  } catch (error) {
    console.error('Update folder error:', error)
    return NextResponse.json(
      { success: false, error: '更新文件夹失败' },
      { status: 500 }
    )
  }
}

// DELETE - 删除文件夹
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    const { id: idStr } = await params
    const id = parseInt(idStr)

    // 检查文件夹是否存在
    const folder = await db.getFolderById(id)
    if (!folder || folder.user_id !== userId) {
      return NextResponse.json(
        { success: false, error: '文件夹不存在' },
        { status: 404 }
      )
    }

    // 删除文件夹（不影响提示词）
    await db.deleteFolder(id)

    return NextResponse.json({
      success: true,
      data: null,
      message: '文件夹删除成功，提示词已保留'
    })
  } catch (error) {
    console.error('Delete folder error:', error)
    return NextResponse.json(
      { success: false, error: '删除文件夹失败' },
      { status: 500 }
    )
  }
} 
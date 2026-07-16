import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'

const MAX_FOLDER_BODY_BYTES = 8 * 1024
const MAX_FOLDER_NAME_CHARS = 100

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
    const id = parsePositiveResourceId(idStr)
    if (id == null) {
      return NextResponse.json(
        { success: false, error: '文件夹不存在' },
        { status: 404 }
      )
    }

    const folder = await db.getOwnedFolderById(id, userId)
    if (!folder) {
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
    const id = parsePositiveResourceId(idStr)
    if (id == null) {
      return NextResponse.json(
        { success: false, error: '文件夹不存在' },
        { status: 404 }
      )
    }
    const body = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_FOLDER_BODY_BYTES,
    )
    if (Object.keys(body).some(key => key !== 'name')) {
      return NextResponse.json(
        { success: false, error: '请求包含不支持的字段' },
        { status: 400 },
      )
    }
    const { name } = body

    if (typeof name !== 'string' || !name.trim() || name.trim().length > MAX_FOLDER_NAME_CHARS) {
      return NextResponse.json(
        { success: false, error: `文件夹名称必须为 1-${MAX_FOLDER_NAME_CHARS} 个字符` },
        { status: 400 }
      )
    }

    const updateResult = await db.query(
      'UPDATE folders SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [name.trim(), id, userId],
    )
    const affectedRows = Number((updateResult.rows as { affectedRows?: number }).affectedRows)
    const updatedFolder = await db.getOwnedFolderById(id, userId)
    if (!updatedFolder || affectedRows > 1) {
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
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
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
    const id = parsePositiveResourceId(idStr)
    if (id == null) {
      return NextResponse.json(
        { success: false, error: '文件夹不存在' },
        { status: 404 }
      )
    }

    // 外键负责将 user_prompts.folder_id 置空并清理关联表；所有权和删除在同一语句内判定。
    const deleteResult = await db.query(
      'DELETE FROM folders WHERE id = ? AND user_id = ?',
      [id, userId],
    )
    if (Number((deleteResult.rows as { affectedRows?: number }).affectedRows) !== 1) {
      return NextResponse.json(
        { success: false, error: '文件夹不存在' },
        { status: 404 }
      )
    }

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

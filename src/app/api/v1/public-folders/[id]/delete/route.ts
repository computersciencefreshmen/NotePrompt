import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'

type MutationResult = { affectedRows?: number }

// DELETE - 用户删除自己发布的公共文件夹
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
        { success: false, error: '公共文件夹不存在' },
        { status: 404 }
      )
    }

    const result = await db.query(
      'DELETE FROM public_folders WHERE id = ? AND user_id = ?',
      [id, userId],
    )
    if (Number((result.rows as MutationResult).affectedRows) === 0) {
      return NextResponse.json(
        { success: false, error: '公共文件夹不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '公共文件夹删除成功'
    })
  } catch (error) {
    console.error('Delete public folder error')
    return NextResponse.json(
      { success: false, error: '删除公共文件夹失败' },
      { status: 500 }
    )
  }
}

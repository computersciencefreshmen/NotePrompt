import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    const folderId = parsePositiveResourceId(id)

    if (folderId == null) {
      return NextResponse.json(
        { success: false, error: '无效的文件夹ID' },
        { status: 400 }
      )
    }

    const success = await db.deleteUserImportedFolder(folderId, userId)

    if (success) {
      return NextResponse.json({
        success: true,
        data: null
      })
    } else {
      return NextResponse.json(
        { success: false, error: '导入文件夹不存在' },
        { status: 404 }
      )
    }
  } catch (error) {
    console.error('删除用户导入文件夹失败:', error)
    return NextResponse.json(
      { success: false, error: '删除导入文件夹失败' },
      { status: 500 }
    )
  }
} 
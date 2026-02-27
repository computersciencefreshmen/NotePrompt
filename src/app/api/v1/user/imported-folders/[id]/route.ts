import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    const folderId = parseInt(params.id)

    if (!folderId || isNaN(folderId)) {
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
        { success: false, error: '删除导入文件夹失败' },
        { status: 500 }
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
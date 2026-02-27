import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// DELETE - 用户删除自己发布的公共文件夹
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('开始删除公共文件夹...')
    
    const auth = await requireAuth(request)
    if ('error' in auth) {
      console.log('认证失败:', auth.error)
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    
    const { id: idStr } = await params
    const id = parseInt(idStr)
    console.log('要删除的文件夹ID:', id)

    // 检查公共文件夹是否存在
    const result = await db.query(`
      SELECT pf.*, u.username as author
      FROM public_folders pf
      JOIN users u ON pf.user_id = u.id
      WHERE pf.id = ?
    `, [id])

    if (!result.rows || (result.rows as any[]).length === 0) {
      console.log('文件夹不存在')
      return NextResponse.json(
        { success: false, error: '公共文件夹不存在' },
        { status: 404 }
      )
    }

    const folder = (result.rows as any[])[0]
    console.log('找到文件夹:', folder)

    // 检查权限 - 只能删除自己发布的文件夹
    if (folder.user_id !== userId) {
      console.log('权限检查失败:', { folderUserId: folder.user_id, currentUserId: userId })
      return NextResponse.json(
        { success: false, error: '没有权限删除此文件夹' },
        { status: 403 }
      )
    }

    // 删除公共文件夹
    console.log('开始删除文件夹...')
    await db.query('DELETE FROM public_folders WHERE id = ?', [id])
    console.log('文件夹删除成功')

    return NextResponse.json({
      success: true,
      message: '公共文件夹删除成功'
    })
  } catch (error) {
    console.error('Delete public folder error:', error)
    return NextResponse.json(
      { success: false, error: '删除公共文件夹失败', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 
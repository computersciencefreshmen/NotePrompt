import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// DELETE - 用户删除自己发布的公共提示词
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('开始删除公共提示词...')
    
    const auth = await requireAuth(request)
    if ('error' in auth) {
      console.log('认证失败:', auth.error)
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    
    const { id: idStr } = await params
    const id = parseInt(idStr)
    console.log('要删除的提示词ID:', id)

    // 检查公共提示词是否存在
    const result = await db.query(`
      SELECT pp.*, u.username as author
      FROM public_prompts pp
      JOIN users u ON pp.author_id = u.id
      WHERE pp.id = ?
    `, [id])

    if (!result.rows || (result.rows as any[]).length === 0) {
      console.log('提示词不存在')
      return NextResponse.json(
        { success: false, error: '公共提示词不存在' },
        { status: 404 }
      )
    }

    const prompt = (result.rows as any[])[0]
    console.log('找到提示词:', prompt)

    // 检查权限 - 只能删除自己发布的提示词
    if (prompt.author_id !== userId) {
      console.log('权限检查失败:', { promptAuthorId: prompt.author_id, currentUserId: userId })
      return NextResponse.json(
        { success: false, error: '没有权限删除此提示词' },
        { status: 403 }
      )
    }

    // 删除公共提示词
    console.log('开始删除提示词...')
    await db.query('DELETE FROM public_prompts WHERE id = ?', [id])
    console.log('提示词删除成功')

    return NextResponse.json({
      success: true,
      message: '公共提示词删除成功'
    })
  } catch (error) {
    console.error('Delete public prompt error:', error)
    return NextResponse.json(
      { success: false, error: '删除公共提示词失败', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 
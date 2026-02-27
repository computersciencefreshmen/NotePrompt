import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// DELETE - 取消收藏（需要认证）
export async function DELETE(request: NextRequest, context: { params: Promise<{ promptId: string }> }) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    
    const { promptId } = await context.params
    const publicPromptId = parseInt(promptId)
    const user_id = auth.user.id

    // 先检查是否已经收藏
    const isFavorited = await db.isFavoritedByUser(user_id, publicPromptId)
    
    if (!isFavorited) {
      return NextResponse.json(
        { success: false, error: '该提示词未在收藏列表中' },
        { status: 404 }
      )
    }

    // 删除收藏
    const success = await db.removeFavorite(user_id, publicPromptId)
    
    if (!success) {
      return NextResponse.json(
        { success: false, error: '取消收藏失败，请稍后重试' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '取消收藏成功'
    })
  } catch (error) {
    console.error('取消收藏失败:', error)
    return NextResponse.json(
      { success: false, error: '取消收藏失败' },
      { status: 500 }
    )
  }
}

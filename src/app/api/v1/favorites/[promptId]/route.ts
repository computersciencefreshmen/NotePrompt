import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import {
  getCuratedPublicPromptById,
  removeCuratedPromptFavorite,
  resolvePublicPromptSource,
} from '@/lib/curated-public-prompts'
import db from '@/lib/mysql-database'
import { parsePositiveResourceId } from '@/lib/resource-authorization'

type MutationResult = { affectedRows?: number }

// DELETE - 取消收藏（需要认证）
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ promptId: string }> },
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { promptId: rawPromptId } = await context.params
    const promptId = parsePositiveResourceId(rawPromptId)
    if (promptId == null) {
      return NextResponse.json(
        { success: false, error: '无效的提示词ID' },
        { status: 400 },
      )
    }
    const source = resolvePublicPromptSource(
      promptId,
      new URL(request.url).searchParams.get('source'),
    )
    if (!source) {
      return NextResponse.json(
        { success: false, error: '无效的提示词来源' },
        { status: 400 },
      )
    }

    let removed = false
    if (source === 'curated') {
      if (!getCuratedPublicPromptById(promptId)) {
        return NextResponse.json(
          { success: false, error: '精选提示词不存在' },
          { status: 404 },
        )
      }
      removed = await removeCuratedPromptFavorite(auth.user.id, promptId)
    } else {
      const result = await db.query(
        'DELETE FROM user_favorites WHERE user_id = ? AND public_prompt_id = ?',
        [auth.user.id, promptId],
      )
      removed = Number((result.rows as MutationResult).affectedRows) === 1
    }

    if (!removed) {
      return NextResponse.json(
        { success: false, error: '该提示词未在收藏列表中' },
        { status: 404 },
      )
    }

    return NextResponse.json({ success: true, message: '取消收藏成功' })
  } catch (error) {
    console.error('取消收藏失败:', error)
    return NextResponse.json(
      { success: false, error: '取消收藏失败，请稍后重试' },
      { status: 500 },
    )
  }
}

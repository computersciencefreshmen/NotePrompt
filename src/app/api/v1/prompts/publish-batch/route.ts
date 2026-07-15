import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { normalizeResourceIds } from '@/lib/resource-authorization'

// POST - 批量发布用户提示词到公共库
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { prompt_ids } = await request.json()

    if (!Array.isArray(prompt_ids) || prompt_ids.length === 0 || prompt_ids.length > 100) {
      return NextResponse.json(
        { success: false, error: '请提供 1 到 100 个有效的提示词ID' },
        { status: 400 }
      )
    }

    const promptIds = normalizeResourceIds(prompt_ids)
    if (!promptIds) {
      return NextResponse.json(
        { success: false, error: '提示词ID必须是唯一的正整数' },
        { status: 400 }
      )
    }

    // 所有权检查、公共记录创建和标签复制在同一事务中完成。
    // 任一资源不存在或不属于当前用户时，整个批次回滚。
    const publishedPrompts = await db.publishOwnedUserPrompts(auth.user.id, promptIds)
    if (!publishedPrompts) {
      return NextResponse.json(
        { success: false, error: '提示词不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: publishedPrompts,
      message: `成功发布 ${publishedPrompts.length} 个提示词`
    })
  } catch (error) {
    console.error('Batch publish prompts error:', error)
    return NextResponse.json(
      { success: false, error: '批量发布提示词失败' },
      { status: 500 }
    )
  }
}

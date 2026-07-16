import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { normalizeResourceIds } from '@/lib/resource-authorization'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'

const MAX_BATCH_PUBLISH_BODY_BYTES = 16 * 1024

// POST - 批量发布用户提示词到公共库
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const body = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_BATCH_PUBLISH_BODY_BYTES,
    )
    if (Object.keys(body).some(key => key !== 'prompt_ids')) {
      return NextResponse.json(
        { success: false, error: '请求包含不支持的字段' },
        { status: 400 },
      )
    }
    const prompt_ids = body.prompt_ids

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
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('Batch publish prompts error:', error)
    return NextResponse.json(
      { success: false, error: '批量发布提示词失败' },
      { status: 500 }
    )
  }
}

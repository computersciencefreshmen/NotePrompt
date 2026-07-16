import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import {
  getCuratedPublicPromptById,
  hydrateCuratedPublicPrompt,
  incrementCuratedPromptViews,
  resolvePublicPromptSource,
} from '@/lib/curated-public-prompts'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'

type PromptUpdate = {
  title?: string
  content?: string
  description?: string | null
}

type MutationResult = { affectedRows?: number }

const MAX_PUBLIC_PROMPT_UPDATE_BODY_BYTES = 64 * 1024

async function getOptionalUserId(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (!('error' in auth)) return auth.user.id
  } catch {
    return null
  }
  return null
}

// GET - 获取公共提示词详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const id = parsePositiveResourceId(idStr)
    const { searchParams } = new URL(request.url)
    const lang = searchParams.get('lang') || 'zh'

    // 验证ID是否为有效数字
    if (id == null) {
      return NextResponse.json(
        { success: false, error: lang === 'en' ? 'Invalid prompt ID' : '无效的提示词ID' },
        { status: 400 }
      )
    }

    const source = resolvePublicPromptSource(id, searchParams.get('source'))
    if (!source) {
      return NextResponse.json(
        { success: false, error: lang === 'en' ? 'Invalid prompt source' : '无效的提示词来源' },
        { status: 400 },
      )
    }

    if (source === 'curated') {
      const curatedPrompt = getCuratedPublicPromptById(id)
      if (!curatedPrompt) {
        return NextResponse.json(
          { success: false, error: lang === 'en' ? 'Prompt not found' : '提示词不存在' },
          { status: 404 },
        )
      }
      await incrementCuratedPromptViews(curatedPrompt)
      const hydratedPrompt = await hydrateCuratedPublicPrompt(
        curatedPrompt,
        await getOptionalUserId(request),
      )

      return NextResponse.json({
        success: true,
        data: hydratedPrompt,
      })
    }

    // The source-qualified path keeps a genuine high-ID publication addressable even when
    // its numeric ID is also a legacy curated catalog ID.
    const prompt = await db.getPublicPromptById(id)
    if (!prompt) {
      return NextResponse.json(
        { success: false, error: '提示词不存在' },
        { status: 404 }
      )
    }

    await db.incrementPromptViews(id)
    const viewedPrompt = await db.getPublicPromptById(id)

    return NextResponse.json({
      success: true,
      data: { ...(viewedPrompt || prompt), source: 'published' }
    })
  } catch (error) {
    console.error('Get public prompt error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch prompt' }, { status: 500 })
  }
}

// PUT - 用户编辑自己发布的公共提示词
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
      return NextResponse.json({ success: false, error: '无效的提示词ID' }, { status: 400 })
    }

    const input = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_PUBLIC_PROMPT_UPDATE_BODY_BYTES,
    )
    if (Object.keys(input).some(key => !['title', 'content', 'description'].includes(key))) {
      return NextResponse.json({ success: false, error: '请求包含不支持的字段' }, { status: 400 })
    }

    const updateData: PromptUpdate = {}
    if (input.title !== undefined) {
      if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200) {
        return NextResponse.json({ success: false, error: '标题必须为 1-200 个字符' }, { status: 400 })
      }
      updateData.title = input.title.trim()
    }
    if (input.content !== undefined) {
      if (typeof input.content !== 'string' || !input.content.trim() || input.content.length > 50_000) {
        return NextResponse.json({ success: false, error: '内容必须为 1-50000 个字符' }, { status: 400 })
      }
      updateData.content = input.content
    }
    if (input.description !== undefined) {
      if (input.description !== null && (typeof input.description !== 'string' || input.description.length > 2_000)) {
        return NextResponse.json({ success: false, error: '描述不能超过 2000 个字符' }, { status: 400 })
      }
      updateData.description = input.description as string | null
    }

    const fields = Object.keys(updateData) as Array<keyof PromptUpdate>
    if (fields.length === 0) {
      return NextResponse.json({ success: false, error: '没有可更新的字段' }, { status: 400 })
    }

    // 所有权检查与写入放在同一条语句中，避免检查后资源归属变化的竞态。
    const values = fields.map((field) => updateData[field])
    const result = await db.query(
      `UPDATE public_prompts
       SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND author_id = ?`,
      [...values, id, userId],
    )
    const affectedRows = Number((result.rows as MutationResult).affectedRows)
    if (affectedRows > 1) throw new Error('Public prompt update affected more than one row')
    if (affectedRows === 0) {
      const existingResult = await db.query(
        'SELECT id FROM public_prompts WHERE id = ? AND author_id = ? LIMIT 1',
        [id, userId],
      )
      if ((existingResult.rows as Record<string, unknown>[]).length === 0) {
        return NextResponse.json({ success: false, error: '公共提示词不存在' }, { status: 404 })
      }
    }

    const updatedPrompt = await db.getPublicPromptById(id)

    return NextResponse.json({
      success: true,
      data: updatedPrompt ? { ...updatedPrompt, source: 'published' as const } : null,
      message: '公共提示词更新成功'
    })
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('Update public prompt error:', error)
    return NextResponse.json({ success: false, error: '更新公共提示词失败' }, { status: 500 })
  }
}

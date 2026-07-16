import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAdminAuth } from '@/lib/auth'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { normalizePromptTagNames, TagValidationError } from '@/lib/tag-policy'

type DatabaseRow = Record<string, unknown>

const MAX_ADMIN_PROMPT_BODY_BYTES = 64 * 1024
const MAX_PROMPT_TITLE_CHARS = 200
const MAX_PROMPT_CONTENT_CHARS = 50_000
const MAX_PROMPT_DESCRIPTION_CHARS = 10_000

// GET - 获取单个公共提示词详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { id: idStr } = await params
    const id = parsePositiveResourceId(idStr)
    if (id == null) {
      return NextResponse.json(
        { success: false, error: '公共提示词不存在' },
        { status: 404 },
      )
    }

    // 获取公共提示词详情
    const result = await db.query(`
      SELECT pp.*, u.username as author
      FROM public_prompts pp
      JOIN users u ON pp.author_id = u.id
      WHERE pp.id = ?
    `, [id])

    if (!result.rows || (result.rows as DatabaseRow[]).length === 0) {
      return NextResponse.json(
        { success: false, error: '公共提示词不存在' },
        { status: 404 }
      )
    }

    const prompt = (result.rows as DatabaseRow[])[0]

    // 获取标签信息
    const tagsResult = await db.getPublicPromptTags(id)
    const tags = tagsResult.map(tag => tag.name)

    return NextResponse.json({
      success: true,
      data: {
        id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        description: prompt.description,
        author_id: prompt.author_id,
        author: prompt.author,
        category_id: prompt.category_id,
        is_featured: prompt.is_featured || false,
        tags: tags,
        created_at: prompt.created_at,
        updated_at: prompt.updated_at
      }
    })
  } catch (error) {
    console.error('Get admin public prompt error:', error)
    return NextResponse.json(
      { success: false, error: '获取公共提示词失败' },
      { status: 500 }
    )
  }
}

// PUT - 更新公共提示词
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { id: idStr } = await params
    const id = parsePositiveResourceId(idStr)
    if (id == null) {
      return NextResponse.json(
        { success: false, error: '公共提示词不存在' },
        { status: 404 },
      )
    }
    const body = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_ADMIN_PROMPT_BODY_BYTES,
    )
    const allowedFields = new Set(['title', 'content', 'description', 'is_featured', 'tags'])
    if (Object.keys(body).some(key => !allowedFields.has(key))) {
      return NextResponse.json(
        { success: false, error: '请求包含不支持的字段' },
        { status: 400 },
      )
    }

    const updates: Partial<{
      title: string
      content: string
      description: string | null
      is_featured: boolean
      tags: string[]
    }> = {}

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > MAX_PROMPT_TITLE_CHARS) {
        return NextResponse.json(
          { success: false, error: `标题必须为 1-${MAX_PROMPT_TITLE_CHARS} 个字符` },
          { status: 400 },
        )
      }
      updates.title = body.title.trim()
    }
    if (body.content !== undefined) {
      if (typeof body.content !== 'string' || !body.content.trim() || body.content.length > MAX_PROMPT_CONTENT_CHARS) {
        return NextResponse.json(
          { success: false, error: `内容必须为 1-${MAX_PROMPT_CONTENT_CHARS} 个字符` },
          { status: 400 },
        )
      }
      updates.content = body.content
    }
    if (body.description !== undefined) {
      if (
        body.description !== null &&
        (typeof body.description !== 'string' || body.description.length > MAX_PROMPT_DESCRIPTION_CHARS)
      ) {
        return NextResponse.json(
          { success: false, error: `描述不能超过 ${MAX_PROMPT_DESCRIPTION_CHARS} 个字符` },
          { status: 400 },
        )
      }
      updates.description = body.description === null ? null : body.description.trim() || null
    }
    if (body.is_featured !== undefined) {
      if (typeof body.is_featured !== 'boolean') {
        return NextResponse.json(
          { success: false, error: 'is_featured 必须是布尔值' },
          { status: 400 },
        )
      }
      updates.is_featured = body.is_featured
    }

    if (body.tags !== undefined) {
      updates.tags = normalizePromptTagNames(body.tags)
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: '没有提供更新字段' },
        { status: 400 }
      )
    }

    if (!await db.updatePublicPromptWithTags(id, updates)) {
      return NextResponse.json(
        { success: false, error: '公共提示词不存在' },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      message: '公共提示词更新成功'
    })
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    if (error instanceof TagValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 },
      )
    }
    console.error('Update admin public prompt error:', error)
    return NextResponse.json(
      { success: false, error: '更新公共提示词失败' },
      { status: 500 }
    )
  }
}

// DELETE - 管理员删除公共提示词
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { id: idStr } = await params
    const id = parsePositiveResourceId(idStr)
    if (id == null) {
      return NextResponse.json(
        { success: false, error: '公共提示词不存在' },
        { status: 404 },
      )
    }

    // 删除公共提示词
    const deleteResult = await db.query('DELETE FROM public_prompts WHERE id = ?', [id])
    if (Number((deleteResult.rows as { affectedRows?: number }).affectedRows) !== 1) {
      return NextResponse.json(
        { success: false, error: '公共提示词不存在' },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      message: '公共提示词删除成功'
    })
  } catch (error) {
    console.error('Delete admin public prompt error:', error)
    return NextResponse.json(
      { success: false, error: '删除公共提示词失败' },
      { status: 500 }
    )
  }
}

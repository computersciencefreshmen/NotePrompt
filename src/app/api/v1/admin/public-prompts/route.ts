import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAdminAuth } from '@/lib/auth'
import {
  createPaginationMetadata,
  parseBoundedPagination,
  readBoundedSearchParam,
} from '@/lib/pagination-policy'
import {
  contentWasTruncated,
  PROMPT_LIST_DESCRIPTION_CHARS,
  PROMPT_LIST_PREVIEW_CHARS,
} from '@/lib/prompt-list-policy'

// GET - 管理员获取公共提示词列表
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const paginationResult = parseBoundedPagination(searchParams, {
      defaultLimit: 50,
      maxLimit: 100,
    })
    const searchResult = readBoundedSearchParam(searchParams)
    if (!paginationResult.ok) {
      return NextResponse.json(
        { success: false, error: paginationResult.error },
        { status: 400 },
      )
    }
    if (!searchResult.ok) {
      return NextResponse.json(
        { success: false, error: searchResult.error },
        { status: 400 },
      )
    }
    const { limit, offset } = paginationResult.value
    const queryParams: Array<string | number> = []
    let whereClause = ''
    if (searchResult.value) {
      whereClause = `WHERE pp.title LIKE ?
        OR pp.description LIKE ?
        OR u.username LIKE ?`
      const pattern = `%${searchResult.value}%`
      queryParams.push(pattern, pattern, pattern)
    }

    const countResult = await db.query(
      `SELECT COUNT(*) AS total
         FROM public_prompts pp
         JOIN users u ON pp.author_id = u.id
         ${whereClause}`,
      queryParams,
    )
    const total = Number((countResult.rows as Array<{ total?: number | string }>)[0]?.total) || 0

    const result = await db.query(`
      SELECT pp.id,
             pp.title,
             LEFT(pp.content, ${PROMPT_LIST_PREVIEW_CHARS}) AS content,
             CHAR_LENGTH(pp.content) AS content_length,
             LEFT(pp.description, ${PROMPT_LIST_DESCRIPTION_CHARS}) AS description,
             pp.author_id,
             pp.category_id,
             pp.is_featured,
             pp.created_at,
             pp.updated_at,
             u.username as author
      FROM public_prompts pp
      JOIN users u ON pp.author_id = u.id
      ${whereClause}
      ORDER BY pp.created_at DESC
      LIMIT ? OFFSET ?
    `, [...queryParams, limit, offset])

    const prompts = (result.rows as Array<Record<string, unknown>>).map(prompt => ({
      id: prompt.id,
      title: prompt.title,
      content: prompt.content,
      content_is_truncated: contentWasTruncated(prompt.content_length),
      description: prompt.description,
      author_id: prompt.author_id,
      author: prompt.author,
      category_id: prompt.category_id,
      is_featured: Boolean(prompt.is_featured),
      created_at: prompt.created_at,
      updated_at: prompt.updated_at
    }))

    const pagination = createPaginationMetadata(total, paginationResult.value)
    return NextResponse.json({
      success: true,
      data: prompts,
      pagination,
    })
  } catch (error) {
    console.error('Get admin public prompts error:', error)
    return NextResponse.json(
      { success: false, error: '获取公共提示词失败' },
      { status: 500 }
    )
  }
}

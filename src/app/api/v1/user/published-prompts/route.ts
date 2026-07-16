import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
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

type PublishedPromptRow = Record<string, unknown> & { tags_json?: unknown; content_length?: unknown }

function parseTags(value: unknown): string[] {
  const parsed = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value) as unknown
        } catch {
          return []
        }
      })()
    : value
  return Array.isArray(parsed)
    ? parsed.filter((tag): tag is string => typeof tag === 'string')
    : []
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  try {
    const { searchParams } = new URL(request.url)
    const paginationResult = parseBoundedPagination(searchParams, {
      defaultLimit: 10,
      maxLimit: 50,
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
    const { page, limit, offset } = paginationResult.value
    const search = searchResult.value

    const conditions = ['pp.author_id = ?']
    const queryParams: Array<string | number> = [auth.user.id]
    if (search) {
      conditions.push('(pp.title LIKE ? OR pp.content LIKE ? OR pp.description LIKE ?)')
      const pattern = `%${search}%`
      queryParams.push(pattern, pattern, pattern)
    }
    const whereClause = `WHERE ${conditions.join(' AND ')}`

    const countResult = await db.query(
      `SELECT COUNT(*) AS total FROM public_prompts pp ${whereClause}`,
      queryParams,
    )
    const total = Number((countResult.rows as Record<string, unknown>[])[0]?.total) || 0

    const result = await db.query(
      `SELECT
         pp.id,
         pp.title,
         LEFT(pp.content, ${PROMPT_LIST_PREVIEW_CHARS}) AS content,
         CHAR_LENGTH(pp.content) AS content_length,
         LEFT(pp.description, ${PROMPT_LIST_DESCRIPTION_CHARS}) AS description,
         pp.author_id,
         pp.category_id,
         pp.views_count,
         pp.is_featured,
         pp.created_at,
         pp.updated_at,
         u.username AS author,
         (SELECT COUNT(*) FROM user_favorites uf WHERE uf.public_prompt_id = pp.id) AS favorites_count,
         (SELECT JSON_ARRAYAGG(t.name)
            FROM public_prompt_tags ppt
            JOIN tags t ON t.id = ppt.tag_id
           WHERE ppt.public_prompt_id = pp.id) AS tags_json
       FROM public_prompts pp
       JOIN users u ON u.id = pp.author_id
       ${whereClause}
       ORDER BY pp.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset],
    )

    const items = (result.rows as PublishedPromptRow[]).map(({ tags_json, content_length, ...prompt }) => ({
      ...prompt,
      content_is_truncated: contentWasTruncated(content_length),
      source: 'published' as const,
      tags: parseTags(tags_json),
      views_count: Number(prompt.views_count) || 0,
      favorites_count: Number(prompt.favorites_count) || 0,
      is_featured: Boolean(prompt.is_featured),
    }))
    const pagination = createPaginationMetadata(total, paginationResult.value)

    return NextResponse.json({
      success: true,
      data: {
        items,
        total: pagination.total,
        page,
        limit,
        totalPages: pagination.totalPages,
      },
    })
  } catch (error) {
    console.error('Get user published prompts error:', error)
    return NextResponse.json(
      { success: false, error: '获取发布的提示词失败' },
      { status: 500 },
    )
  }
}

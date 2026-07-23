
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { getCuratedPublicPrompts, hydrateCuratedPublicPrompts } from '@/lib/curated-public-prompts'
import { mergedPaginationWindow } from '@/lib/merged-pagination'
import {
  contentWasTruncated,
  PROMPT_LIST_DESCRIPTION_CHARS,
  PROMPT_LIST_PREVIEW_CHARS,
} from '@/lib/prompt-list-policy'
import {
  createPaginationMetadata,
  parseBoundedPagination,
  readBoundedQueryParam,
  readBoundedSearchParam,
} from '@/lib/pagination-policy'
import {
  checkIpRateLimit,
  createRateLimitResponse,
  rateLimitHttpStatus,
} from '@/lib/rate-limit'

function sortPublicPrompts<T extends { id: number; source?: string; created_at: string; favorites_count: number; views_count: number }>(items: T[], sort: string) {
  return [...items].sort((a, b) => {
    const recency = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    const stableIdentity = (b.id - a.id) || String(a.source || '').localeCompare(String(b.source || ''))
    if (sort === 'latest') return recency || stableIdentity
    return (b.favorites_count - a.favorites_count)
      || (b.views_count - a.views_count)
      || recency
      || stableIdentity
  })
}

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

function databaseBoolean(value: unknown) {
  return value === true || value === 1 || value === '1'
}

async function getOptionalUserId(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (!('error' in auth)) return auth.user.id
  } catch {
    return null
  }
  return null
}

export async function GET(request: NextRequest) {
  try {
    const rateLimit = await checkIpRateLimit(
      request,
      'public-prompts-list',
      { windowMs: 60_000, maxRequests: 120 },
    )
    if (!rateLimit.allowed) {
      return NextResponse.json(
        createRateLimitResponse(rateLimit),
        { status: rateLimitHttpStatus(rateLimit) },
      )
    }

    const { searchParams } = new URL(request.url)
    const paginationResult = parseBoundedPagination(searchParams, {
      defaultLimit: 10,
      maxLimit: 50,
    })
    const searchResult = readBoundedSearchParam(searchParams)
    const tagResult = readBoundedQueryParam(searchParams, 'tag', 100)
    if (!paginationResult.ok) {
      return NextResponse.json({ success: false, error: paginationResult.error }, { status: 400 })
    }
    if (!searchResult.ok) {
      return NextResponse.json({ success: false, error: searchResult.error }, { status: 400 })
    }
    if (!tagResult.ok) {
      return NextResponse.json({ success: false, error: tagResult.error }, { status: 400 })
    }
    const { page, limit, offset } = paginationResult.value
    const search = searchResult.value
    const tag = tagResult.value
    const lang = searchParams.get('lang') || 'zh'
    const requestedSort = searchParams.get('sort')
    const sort = requestedSort === 'popular' || requestedSort === 'favorites'
      ? 'popular'
      : 'latest'

    const userId = await getOptionalUserId(request)

    if (lang === 'en') {
      const normalizedSearch = search.trim().toLowerCase()
      const normalizedTag = tag.trim().toLowerCase()
      const filteredItems = getCuratedPublicPrompts('en').filter(prompt => {
        const matchesSearch = !normalizedSearch || [prompt.title, prompt.description || '', prompt.content, prompt.category, ...prompt.tags]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch)
        const matchesTag = !normalizedTag || prompt.tags.some(item => item.toLowerCase() === normalizedTag) || prompt.category.toLowerCase() === normalizedTag
        return matchesSearch && matchesTag
      })
      const hydratedItems = await hydrateCuratedPublicPrompts(filteredItems, userId)
      const sortedItems = sortPublicPrompts(hydratedItems, sort)
      const pagedItems = sortedItems.slice(offset, offset + limit)
      const total = sortedItems.length

      return NextResponse.json({
        success: true,
        data: {
          items: pagedItems,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      })
    }
    
    const normalizedSearch = search.toLowerCase()
    const normalizedTag = tag.toLowerCase()
    const curatedItems = getCuratedPublicPrompts('zh').filter(prompt => {
      const matchesSearch = !normalizedSearch || [prompt.title, prompt.description || '', prompt.content, prompt.category, ...prompt.tags]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch)
      const matchesTag = !normalizedTag || prompt.tags.some(item => item.toLowerCase() === normalizedTag) || prompt.category.toLowerCase() === normalizedTag
      return matchesSearch && matchesTag
    })
    const hydratedCuratedItems = await hydrateCuratedPublicPrompts(curatedItems, userId)

    // Curated catalog IDs live in their own table. Business publications may legitimately
    // have any positive AUTO_INCREMENT value, including values above the old 900000 range.
    // The public catalog is a consumer surface. Withdrawn snapshots keep their
    // stable database identity but must not affect either rows or pagination.
    const whereConditions: string[] = ["pp.publication_state = 'published'"]
    const queryParams: (string | number)[] = []
    
    if (search) {
      whereConditions.push('(pp.title LIKE ? OR pp.content LIKE ? OR pp.description LIKE ?)')
      const searchPattern = `%${search}%`
      queryParams.push(searchPattern, searchPattern, searchPattern)
    }
    
    if (tag) {
      whereConditions.push('EXISTS (SELECT 1 FROM public_prompt_tags ppt JOIN tags t ON ppt.tag_id = t.id WHERE ppt.public_prompt_id = pp.id AND t.name = ?)')
      queryParams.push(tag)
    }
    
    const whereClause = `WHERE ${whereConditions.join(' AND ')}`
    
    const countResult = await db.query(
      `SELECT COUNT(*) AS total FROM public_prompts pp ${whereClause}`,
      queryParams,
    )
    const databaseTotal = Number((countResult.rows as Record<string, unknown>[])[0]?.total) || 0

    // A merged page can be reconstructed from a narrow database rank window plus
    // the complete (small, reviewed) curated set. This keeps deep pages from loading
    // every preceding publication into application memory.
    const mergeWindow = mergedPaginationWindow(offset, limit, hydratedCuratedItems.length)
    const orderClause = sort === 'latest'
      ? 'pp.created_at DESC, pp.id DESC'
      : 'favorites_count DESC, pp.views_count DESC, pp.created_at DESC, pp.id DESC'
    const result = await db.query(
      `SELECT
         pp.id,
         pp.title,
         LEFT(pp.content, ${PROMPT_LIST_PREVIEW_CHARS}) AS content,
         CHAR_LENGTH(pp.content) AS content_length,
         LEFT(pp.description, ${PROMPT_LIST_DESCRIPTION_CHARS}) AS description,
         pp.author_id,
         pp.views_count,
         pp.created_at,
         pp.updated_at,
         pp.is_featured,
         u.username AS author,
         c.name AS category,
         (SELECT COUNT(*) FROM user_favorites uf WHERE uf.public_prompt_id = pp.id) AS favorites_count,
         EXISTS(
           SELECT 1 FROM user_favorites current_favorite
           WHERE current_favorite.public_prompt_id = pp.id AND current_favorite.user_id = ?
         ) AS is_favorited,
         (SELECT JSON_ARRAYAGG(t.name)
            FROM public_prompt_tags ppt
            JOIN tags t ON t.id = ppt.tag_id
           WHERE ppt.public_prompt_id = pp.id) AS tags_json
       FROM public_prompts pp
       JOIN users u ON pp.author_id = u.id
       LEFT JOIN categories c ON c.id = pp.category_id
       ${whereClause}
       ORDER BY ${orderClause}
       LIMIT ? OFFSET ?`,
      [userId || 0, ...queryParams, mergeWindow.databaseLimit, mergeWindow.databaseOffset],
    )
    const processedItems = (result.rows as Record<string, unknown>[]).map((item) => ({
      id: Number(item.id),
      source: 'published' as const,
      title: String(item.title || ''),
      content: String(item.content || ''),
      content_is_truncated: contentWasTruncated(item.content_length),
      description: item.description == null ? '' : String(item.description),
      author_id: Number(item.author_id),
      views_count: Number(item.views_count) || 0,
      favorites_count: Number(item.favorites_count) || 0,
      created_at: String(item.created_at || ''),
      updated_at: String(item.updated_at || ''),
      author: String(item.author || ''),
      tags: parseTags(item.tags_json),
      category: item.category == null ? '' : String(item.category),
      is_featured: databaseBoolean(item.is_featured),
      is_favorited: databaseBoolean(item.is_favorited),
    }))
    const allItems = sortPublicPrompts([...processedItems, ...hydratedCuratedItems], sort)

    const pagedItems = allItems.slice(
      mergeWindow.localOffset,
      mergeWindow.localOffset + limit,
    )
    const total = databaseTotal + hydratedCuratedItems.length
    
    const pagination = createPaginationMetadata(total, paginationResult.value)
    
    return NextResponse.json({
      success: true,
      data: { 
        items: pagedItems,
        total: pagination.total,
        page, 
        limit, 
        totalPages: pagination.totalPages,
      }
    })
  } catch (error) {
    console.error('获取公共提示词失败:', error)
    return NextResponse.json(
      { success: false, error: '获取公共提示词列表失败' },
      { status: 500 }
    )
  }
}

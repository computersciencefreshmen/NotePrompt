import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import {
  addCuratedPromptFavorite,
  getCuratedPublicPromptById,
  hydrateCuratedPublicPrompts,
  resolvePublicPromptSource,
} from '@/lib/curated-public-prompts'
import db from '@/lib/mysql-database'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { createPaginationMetadata, parseBoundedPagination } from '@/lib/pagination-policy'
import {
  contentWasTruncated,
  PROMPT_LIST_DESCRIPTION_CHARS,
  PROMPT_LIST_PREVIEW_CHARS,
} from '@/lib/prompt-list-policy'

type FavoriteReference = {
  source: 'curated' | 'published'
  prompt_id: number
  favorited_at: string
}

type PublicFavoriteRow = Record<string, unknown> & { id: number; tags_json?: unknown }
type MutationResult = { affectedRows?: number }

const MAX_FAVORITE_BODY_BYTES = 8 * 1024

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

// GET - 获取收藏列表（需要认证）
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const paginationResult = parseBoundedPagination(searchParams, {
      defaultLimit: 10,
      maxLimit: 50,
    })
    if (!paginationResult.ok) {
      return NextResponse.json(
        { success: false, error: paginationResult.error },
        { status: 400 },
      )
    }
    const { page, limit, offset } = paginationResult.value

    const [referenceResult, totalResult] = await Promise.all([
      db.query(
        `SELECT source, prompt_id, favorited_at
           FROM (
             SELECT 'published' AS source,
                    favorite.public_prompt_id AS prompt_id,
                    favorite.created_at AS favorited_at
               FROM user_favorites favorite
              WHERE favorite.user_id = ?
             UNION ALL
             SELECT 'curated' AS source,
                    favorite.catalog_id AS prompt_id,
                    favorite.created_at AS favorited_at
               FROM curated_prompt_favorites favorite
              WHERE favorite.user_id = ?
           ) combined_favorites
          ORDER BY favorited_at DESC, source ASC, prompt_id ASC
          LIMIT ? OFFSET ?`,
        [auth.user.id, auth.user.id, limit, offset],
      ),
      db.query(
        `SELECT
           (SELECT COUNT(*) FROM user_favorites WHERE user_id = ?)
           + (SELECT COUNT(*) FROM curated_prompt_favorites WHERE user_id = ?) AS total`,
        [auth.user.id, auth.user.id],
      ),
    ])
    const totalCount = Number(
      (totalResult.rows as Array<{ total?: number | string }>)[0]?.total,
    ) || 0
    const pagination = createPaginationMetadata(totalCount, paginationResult.value)
    const references = referenceResult.rows as FavoriteReference[]
    const publishedIds = references
      .filter(reference => reference.source === 'published')
      .map(reference => Number(reference.prompt_id))
    const curatedPrompts = references
      .filter(reference => reference.source === 'curated')
      .map(reference => getCuratedPublicPromptById(Number(reference.prompt_id)))
      .filter((prompt): prompt is NonNullable<typeof prompt> => prompt != null)

    const [publishedResult, hydratedCurated] = await Promise.all([
      publishedIds.length > 0
        ? db.query(
            `SELECT
               publication.id,
               publication.title,
               LEFT(publication.content, ${PROMPT_LIST_PREVIEW_CHARS}) AS content,
               CHAR_LENGTH(publication.content) AS content_length,
               LEFT(publication.description, ${PROMPT_LIST_DESCRIPTION_CHARS}) AS description,
               publication.author_id,
               publication.views_count,
               publication.is_featured,
               publication.created_at,
               publication.updated_at,
               author.username AS author,
               category.name AS category,
               (SELECT COUNT(*)
                  FROM user_favorites aggregate_favorite
                 WHERE aggregate_favorite.public_prompt_id = publication.id) AS favorites_count,
               (SELECT JSON_ARRAYAGG(tag.name)
                  FROM public_prompt_tags prompt_tag
                  JOIN tags tag ON tag.id = prompt_tag.tag_id
                 WHERE prompt_tag.public_prompt_id = publication.id) AS tags_json
             FROM public_prompts publication
             JOIN users author ON author.id = publication.author_id
             LEFT JOIN categories category ON category.id = publication.category_id
             WHERE publication.id IN (${publishedIds.map(() => '?').join(',')})`,
            publishedIds,
          )
        : Promise.resolve({ rows: [] }),
      hydrateCuratedPublicPrompts(curatedPrompts, auth.user.id),
    ])

    const publishedById = new Map(
      (publishedResult.rows as PublicFavoriteRow[]).map(({ tags_json, content_length, ...row }) => [
        Number(row.id),
        {
          ...row,
          id: Number(row.id),
          source: 'published' as const,
          content_is_truncated: contentWasTruncated(content_length),
          tags: parseTags(tags_json),
          views_count: Number(row.views_count) || 0,
          favorites_count: Number(row.favorites_count) || 0,
          is_featured: Boolean(row.is_featured),
          is_favorited: true,
        },
      ]),
    )
    const curatedById = new Map(hydratedCurated.map(prompt => [prompt.id, prompt]))
    const items = references.flatMap(reference => {
      const id = Number(reference.prompt_id)
      const prompt = reference.source === 'curated'
        ? curatedById.get(id)
        : publishedById.get(id)
      return prompt ? [{ ...prompt, favorited_at: reference.favorited_at }] : []
    })

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
    console.error('获取收藏列表失败:', error)
    return NextResponse.json(
      { success: false, error: '获取收藏列表失败' },
      { status: 500 },
    )
  }
}

// POST - 添加收藏（需要认证）
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const body = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_FAVORITE_BODY_BYTES,
    )
    if (Object.keys(body).some(key => !['public_prompt_id', 'source'].includes(key))) {
      return NextResponse.json(
        { success: false, error: '请求包含不支持的字段' },
        { status: 400 },
      )
    }

    const promptId = parsePositiveResourceId(body.public_prompt_id)
    if (promptId == null) {
      return NextResponse.json(
        { success: false, error: '无效的提示词ID' },
        { status: 400 },
      )
    }
    const source = resolvePublicPromptSource(
      promptId,
      typeof body.source === 'string' ? body.source : body.source == null ? null : 'invalid',
    )
    if (!source) {
      return NextResponse.json(
        { success: false, error: '无效的提示词来源' },
        { status: 400 },
      )
    }

    let added = false
    if (source === 'curated') {
      const prompt = getCuratedPublicPromptById(promptId)
      if (!prompt) {
        return NextResponse.json(
          { success: false, error: '精选提示词不存在' },
          { status: 404 },
        )
      }
      added = await addCuratedPromptFavorite(auth.user.id, prompt)
    } else {
      const promptResult = await db.query(
        'SELECT id FROM public_prompts WHERE id = ? LIMIT 1',
        [promptId],
      )
      if ((promptResult.rows as unknown[]).length === 0) {
        return NextResponse.json(
          { success: false, error: '公共提示词不存在' },
          { status: 404 },
        )
      }
      const result = await db.query(
        'INSERT IGNORE INTO user_favorites (user_id, public_prompt_id) VALUES (?, ?)',
        [auth.user.id, promptId],
      )
      added = Number((result.rows as MutationResult).affectedRows) === 1
    }

    if (!added) {
      return NextResponse.json(
        { success: false, error: '该提示词已经在收藏列表中' },
        { status: 409 },
      )
    }

    return NextResponse.json({ success: true, message: '收藏成功' })
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('添加收藏失败:', error)
    return NextResponse.json(
      { success: false, error: '收藏失败，请稍后重试' },
      { status: 500 },
    )
  }
}

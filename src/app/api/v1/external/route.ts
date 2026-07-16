import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey, type ApiKeyPrincipal } from '@/lib/auth'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import db from '@/lib/mysql-database'
import {
  checkAccountRateLimit,
  checkIpRateLimit,
  createRateLimitResponse,
  rateLimitHttpStatus,
} from '@/lib/rate-limit'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import {
  EXTERNAL_PUBLICATION_ACCOUNT_LIMIT,
  EXTERNAL_PUBLICATION_DAILY_LIMIT,
} from '@/lib/external-api-policy'
import {
  contentWasTruncated,
  PROMPT_LIST_DESCRIPTION_CHARS,
  PROMPT_LIST_PREVIEW_CHARS,
} from '@/lib/prompt-list-policy'
import {
  createPaginationMetadata,
  parseBoundedPagination,
  readBoundedSearchParam,
} from '@/lib/pagination-policy'

type DbRow = Record<string, unknown>
const EXTERNAL_IP_LIMIT = { windowMs: 60_000, maxRequests: 120 }
const EXTERNAL_KEY_LIMIT = { windowMs: 60_000, maxRequests: 60 }
const MAX_EXTERNAL_BODY_BYTES = 256 * 1024

function extractApiKey(request: NextRequest): string | null {
  const headerKey = request.headers.get('x-api-key')?.trim() || null
  const authorization = request.headers.get('authorization')?.trim() || ''
  const bearerKey = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : null

  if (headerKey && bearerKey && headerKey !== bearerKey) return null
  return headerKey || bearerKey
}

async function authenticateExternalRequest(
  request: NextRequest,
): Promise<{ principal: ApiKeyPrincipal } | { response: NextResponse }> {
  const ipLimit = await checkIpRateLimit(request, 'external', EXTERNAL_IP_LIMIT)
  if (!ipLimit.allowed) {
    return {
      response: NextResponse.json(
        createRateLimitResponse(ipLimit),
        { status: rateLimitHttpStatus(ipLimit) },
      ),
    }
  }

  const apiKey = extractApiKey(request)
  if (!apiKey) {
    return {
      response: NextResponse.json(
        { error: '缺少或冲突的 API 密钥', code: 'MISSING_API_KEY' },
        { status: 401 },
      ),
    }
  }

  const principal = await authenticateApiKey(apiKey)
  if (!principal) {
    return {
      response: NextResponse.json(
        { error: '无效的 API 密钥', code: 'INVALID_API_KEY' },
        { status: 401 },
      ),
    }
  }

  const keyLimit = await checkAccountRateLimit('external', principal.keyId, EXTERNAL_KEY_LIMIT)
  if (!keyLimit.allowed) {
    return {
      response: NextResponse.json(
        createRateLimitResponse(keyLimit),
        { status: rateLimitHttpStatus(keyLimit) },
      ),
    }
  }

  return { principal }
}

// GET - 获取公共提示词列表
export async function GET(request: NextRequest) {
  const authentication = await authenticateExternalRequest(request)
  if ('response' in authentication) return authentication.response

  try {
    const { searchParams } = new URL(request.url)
    const paginationResult = parseBoundedPagination(searchParams, {
      defaultLimit: 20,
      maxLimit: 50,
    })
    const searchResult = readBoundedSearchParam(searchParams)
    if (!paginationResult.ok) {
      return NextResponse.json(
        { error: paginationResult.error, code: 'INVALID_PAGINATION' },
        { status: 400 },
      )
    }
    if (!searchResult.ok) {
      return NextResponse.json(
        { error: searchResult.error, code: 'INVALID_SEARCH' },
        { status: 400 },
      )
    }
    const { page, limit, offset } = paginationResult.value
    const search = searchResult.value
    const rawCategory = searchParams.get('category')
    const categoryId = rawCategory ? parsePositiveResourceId(rawCategory) : null
    if (rawCategory && categoryId == null) {
      return NextResponse.json(
        { error: '分类 ID 无效', code: 'INVALID_CATEGORY' },
        { status: 400 },
      )
    }

    const conditions: string[] = []
    const queryParams: Array<string | number> = []
    if (search) {
      conditions.push('(pp.title LIKE ? OR pp.content LIKE ?)')
      queryParams.push(`%${search}%`, `%${search}%`)
    }
    if (categoryId != null) {
      conditions.push('pp.category_id = ?')
      queryParams.push(categoryId)
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const [countRows] = await db.execute(
      `SELECT COUNT(*) AS total FROM public_prompts pp ${whereClause}`,
      queryParams,
    )
    const total = Number((countRows as DbRow[])[0]?.total) || 0
    const [rows] = await db.execute(
      `SELECT
         pp.id,
         pp.title,
         LEFT(pp.content, ${PROMPT_LIST_PREVIEW_CHARS}) AS content,
         CHAR_LENGTH(pp.content) AS content_length,
         LEFT(pp.description, ${PROMPT_LIST_DESCRIPTION_CHARS}) AS description,
         pp.category_id,
         pp.views_count,
         pp.is_featured,
         pp.created_at,
         pp.updated_at,
         u.username AS author_name,
         c.name AS category_name
       FROM public_prompts pp
       JOIN users u ON pp.author_id = u.id
       LEFT JOIN categories c ON pp.category_id = c.id
       ${whereClause}
       ORDER BY pp.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset],
    )

    const pagination = createPaginationMetadata(total, paginationResult.value)
    return NextResponse.json({
      success: true,
      data: {
        prompts: (rows as DbRow[]).map(({ content_length, ...row }) => ({
          ...row,
          source: 'published' as const,
          content_is_truncated: contentWasTruncated(content_length),
        })),
        pagination: {
          page,
          limit,
          total: pagination.total,
          totalPages: pagination.totalPages,
        },
      },
    })
  } catch (error) {
    console.error('External API list error:', error)
    return NextResponse.json(
      { error: '服务器内部错误', code: 'INTERNAL_ERROR' },
      { status: 500 },
    )
  }
}

// POST - 创建新的公共提示词
export async function POST(request: NextRequest) {
  const authentication = await authenticateExternalRequest(request)
  if ('response' in authentication) return authentication.response

  const writeLimit = await checkAccountRateLimit(
    'external-publication-daily',
    authentication.principal.keyId,
    EXTERNAL_PUBLICATION_DAILY_LIMIT,
  )
  if (!writeLimit.allowed) {
    return NextResponse.json(
      createRateLimitResponse(writeLimit),
      { status: rateLimitHttpStatus(writeLimit) },
    )
  }

  try {
    const body = await readLimitedJson<Record<string, unknown>>(request, MAX_EXTERNAL_BODY_BYTES)
    if (Object.keys(body).some(key => ![
      'title',
      'content',
      'description',
      'category_id',
    ].includes(key))) {
      return NextResponse.json(
        { error: '请求包含不支持的字段', code: 'INVALID_FIELDS' },
        { status: 400 },
      )
    }
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    const description = body.description == null
      ? null
      : typeof body.description === 'string'
        ? body.description.trim()
        : undefined
    const categoryId = body.category_id == null
      ? null
      : parsePositiveResourceId(body.category_id)

    if (!title || title.length > 200 || !content || content.length > 100_000) {
      return NextResponse.json(
        { error: '标题须为 1-200 字符，内容须为 1-100000 字符', code: 'INVALID_FIELDS' },
        { status: 400 },
      )
    }
    if (description === undefined || (description && description.length > 2_000)) {
      return NextResponse.json(
        { error: '描述格式无效或超过 2000 字符', code: 'INVALID_DESCRIPTION' },
        { status: 400 },
      )
    }
    if (body.category_id != null && categoryId == null) {
      return NextResponse.json(
        { error: '分类 ID 无效', code: 'INVALID_CATEGORY' },
        { status: 400 },
      )
    }

    if (categoryId != null) {
      const [categoryRows] = await db.execute(
        'SELECT id FROM categories WHERE id = ? AND is_active = 1 LIMIT 1',
        [categoryId],
      )
      if ((categoryRows as DbRow[]).length === 0) {
        return NextResponse.json(
          { error: '分类不存在', code: 'CATEGORY_NOT_FOUND' },
          { status: 400 },
        )
      }
    }

    const creation = await db.createExternalPublicPrompt(
      {
        title,
        content,
        description,
        category_id: categoryId,
        author_id: authentication.principal.userId,
      },
      EXTERNAL_PUBLICATION_ACCOUNT_LIMIT,
    )
    if (creation.status === 'account_limit_reached') {
      return NextResponse.json(
        {
          error: `每个账户最多可通过外部 API 创建 ${EXTERNAL_PUBLICATION_ACCOUNT_LIMIT} 条公共提示词`,
          code: 'PUBLICATION_LIMIT_REACHED',
        },
        { status: 409 },
      )
    }
    if (creation.status === 'author_not_found') {
      return NextResponse.json(
        { error: 'API 密钥所属账户不可用', code: 'ACCOUNT_UNAVAILABLE' },
        { status: 403 },
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: { ...creation.prompt, source: 'published' as const },
        message: '提示词创建成功',
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_REQUEST' },
        { status: error.status },
      )
    }
    console.error('External API create error:', error)
    return NextResponse.json(
      { error: '服务器内部错误', code: 'INTERNAL_ERROR' },
      { status: 500 },
    )
  }
}

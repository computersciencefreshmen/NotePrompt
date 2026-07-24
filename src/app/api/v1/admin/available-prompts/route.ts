import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAdminAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import {
  createPaginationMetadata,
  parseBoundedPagination,
  readBoundedSearchParam,
} from '@/lib/pagination-policy'
import { PUBLIC_FOLDER_SNAPSHOT_VISIBILITY_SQL } from '@/lib/public-folder-snapshot-policy'
import {
  contentWasTruncated,
  PROMPT_LIST_DESCRIPTION_CHARS,
  PROMPT_LIST_PREVIEW_CHARS,
} from '@/lib/prompt-list-policy'

// GET - 获取可加入公共文件夹快照的已发布提示词
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
    const search = searchResult.value
    const folderIdValue = searchParams.get('folderId')
    const folderId = folderIdValue == null ? null : parsePositiveResourceId(folderIdValue)
    if (folderIdValue != null && folderId == null) {
      return NextResponse.json({ success: false, error: '无效的公共文件夹ID' }, { status: 400 })
    }

    let whereClause = `WHERE pp.publication_state = 'published'`
    const queryParams: (string | number)[] = []

    if (search) {
      whereClause += ' AND (pp.title LIKE ? OR pp.content LIKE ? OR pp.description LIKE ?)'
      const searchPattern = `%${search}%`
      queryParams.push(searchPattern, searchPattern, searchPattern)
    }

    if (folderId != null) {
      whereClause += ` AND NOT EXISTS (
        SELECT 1
        FROM public_folder_prompts snapshot
        JOIN public_folders published_folder
          ON published_folder.id = snapshot.public_folder_id
        WHERE snapshot.public_folder_id = ?
          AND snapshot.source_public_prompt_id = pp.id
          AND ${PUBLIC_FOLDER_SNAPSHOT_VISIBILITY_SQL}
      )`
      queryParams.push(folderId)
    }

    const { countResult, result } = await db.withConsistentReadSnapshot(async query => {
      const countResult = await query(
        `SELECT COUNT(*) AS total
           FROM public_prompts pp
           ${whereClause}`,
        queryParams,
      )
      const result = await query(`
        SELECT pp.id,
               pp.title,
               LEFT(pp.content, ${PROMPT_LIST_PREVIEW_CHARS}) AS content,
               CHAR_LENGTH(pp.content) AS content_length,
               LEFT(pp.description, ${PROMPT_LIST_DESCRIPTION_CHARS}) AS description,
               pp.author_id,
               pp.category_id,
               pp.is_featured,
               pp.publication_state,
               pp.created_at,
               pp.updated_at,
               u.username AS author,
               c.name AS category
        FROM public_prompts pp
        JOIN users u ON pp.author_id = u.id
        LEFT JOIN categories c ON pp.category_id = c.id
        ${whereClause}
        ORDER BY pp.created_at DESC, pp.id DESC
        LIMIT ? OFFSET ?
      `, [...queryParams, limit, offset])
      return { countResult, result }
    })
    const total = Number((countResult.rows as Array<{ total?: number | string }>)[0]?.total) || 0

    const prompts = (result.rows as Array<Record<string, unknown>>).map(prompt => ({
      id: prompt.id,
      title: prompt.title,
      content: prompt.content,
      content_is_truncated: contentWasTruncated(prompt.content_length),
      description: prompt.description,
      author_id: prompt.author_id,
      author: prompt.author,
      category_id: prompt.category_id,
      category: prompt.category,
      is_featured: Boolean(prompt.is_featured),
      publication_state: prompt.publication_state,
      created_at: prompt.created_at,
      updated_at: prompt.updated_at,
    }))

    const pagination = createPaginationMetadata(total, paginationResult.value)
    return NextResponse.json({
      success: true,
      data: prompts,
      pagination,
    })
  } catch (error) {
    console.error('Get available prompts error:', error)
    return NextResponse.json(
      { success: false, error: '获取可选提示词失败' },
      { status: 500 }
    )
  }
}

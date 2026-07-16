import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAdminAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
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

// GET - 获取可选的提示词列表（用于添加到文件夹）
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

    // 构建查询条件
    let whereClause = 'WHERE 1=1'
    const queryParams: (string | number)[] = []

    if (search) {
      whereClause += ' AND (up.title LIKE ? OR up.content LIKE ?)'
      const searchPattern = `%${search}%`
      queryParams.push(searchPattern, searchPattern)
    }

    // Exclude prompts already copied into this publication snapshot.
    if (folderId != null) {
      whereClause += ` AND NOT EXISTS (
        SELECT 1
        FROM public_folder_prompts snapshot
        WHERE snapshot.public_folder_id = ? AND snapshot.source_prompt_id = up.id
      )`
      queryParams.push(folderId)
    }

    const countResult = await db.query(
      `SELECT COUNT(*) AS total
         FROM user_prompts up
         JOIN users u ON up.user_id = u.id
         ${whereClause}`,
      queryParams,
    )
    const total = Number((countResult.rows as Array<{ total?: number | string }>)[0]?.total) || 0

    const result = await db.query(`
      SELECT up.id, up.title,
             LEFT(up.content, ${PROMPT_LIST_PREVIEW_CHARS}) AS content,
             CHAR_LENGTH(up.content) AS content_length,
             LEFT(up.description, ${PROMPT_LIST_DESCRIPTION_CHARS}) AS description,
             up.created_at, up.updated_at,
             u.username as author
      FROM user_prompts up
      JOIN users u ON up.user_id = u.id
      ${whereClause}
      ORDER BY up.created_at DESC
      LIMIT ? OFFSET ?
    `, [...queryParams, limit, offset])

    const prompts = (result.rows as Array<Record<string, unknown>>).map(prompt => ({
      id: prompt.id,
      title: prompt.title,
      content: prompt.content,
      content_is_truncated: contentWasTruncated(prompt.content_length),
      description: prompt.description,
      author: prompt.author,
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
    console.error('Get available prompts error:', error)
    return NextResponse.json(
      { success: false, error: '获取可选提示词失败' },
      { status: 500 }
    )
  }
}

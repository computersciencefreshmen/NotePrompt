import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAdminAuth } from '@/lib/auth'
import {
  createPaginationMetadata,
  parseBoundedPagination,
  readBoundedSearchParam,
} from '@/lib/pagination-policy'

// GET - 管理员获取公共文件夹列表
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
      whereClause = 'WHERE pf.name LIKE ? OR pf.description LIKE ? OR u.username LIKE ?'
      const pattern = `%${searchResult.value}%`
      queryParams.push(pattern, pattern, pattern)
    }

    const countResult = await db.query(
      `SELECT COUNT(*) AS total
         FROM public_folders pf
         JOIN users u ON pf.user_id = u.id
         ${whereClause}`,
      queryParams,
    )
    const total = Number((countResult.rows as Array<{ total?: number | string }>)[0]?.total) || 0

    const result = await db.query(`
      SELECT pf.*, u.username as author,
             COALESCE(prompt_counts.count, 0) as prompt_count
      FROM public_folders pf
      JOIN users u ON pf.user_id = u.id
      LEFT JOIN (
        SELECT snapshot.public_folder_id, COUNT(*) as count
        FROM public_folder_prompts snapshot
        GROUP BY snapshot.public_folder_id
      ) prompt_counts ON prompt_counts.public_folder_id = pf.id
      ${whereClause}
      ORDER BY pf.created_at DESC
      LIMIT ? OFFSET ?
    `, [...queryParams, limit, offset])

    const folders = (result.rows as Array<Record<string, unknown>>).map(folder => ({
      id: folder.id,
      name: folder.name,
      description: folder.description,
      user_id: folder.user_id,
      author: folder.author,
      original_folder_id: folder.original_folder_id,
      is_featured: Boolean(folder.is_featured),
      prompt_count: Number(folder.prompt_count) || 0,
      created_at: folder.created_at,
      updated_at: folder.updated_at
    }))

    const pagination = createPaginationMetadata(total, paginationResult.value)
    return NextResponse.json({
      success: true,
      data: folders,
      pagination,
    })
  } catch (error) {
    console.error('Get admin public folders error:', error)
    return NextResponse.json(
      { success: false, error: '获取公共文件夹失败' },
      { status: 500 }
    )
  }
}

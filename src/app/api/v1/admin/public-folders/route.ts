import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAdminAuth } from '@/lib/auth'
import {
  createPaginationMetadata,
  parseBoundedPagination,
  readBoundedSearchParam,
} from '@/lib/pagination-policy'
import { PUBLIC_FOLDER_SNAPSHOT_VISIBILITY_SQL } from '@/lib/public-folder-snapshot-policy'

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

    const countQuery = `SELECT COUNT(*) AS total
                          FROM public_folders pf
                          JOIN users u ON pf.user_id = u.id
                          ${whereClause}`

    const itemQuery = `
      SELECT page_folder.id, page_folder.name, page_folder.description,
             page_folder.user_id, page_folder.is_featured,
             page_folder.created_at, page_folder.updated_at, page_folder.author,
             (SELECT COUNT(*) FROM public_folder_prompts snapshot
               JOIN public_folders published_folder
                 ON published_folder.id = snapshot.public_folder_id
              WHERE snapshot.public_folder_id = page_folder.id
                AND ${PUBLIC_FOLDER_SNAPSHOT_VISIBILITY_SQL}) AS prompt_count
        FROM (
          SELECT pf.id, pf.name, pf.description, pf.user_id, pf.is_featured,
                 pf.created_at, pf.updated_at, u.username AS author
            FROM public_folders pf
            JOIN users u ON pf.user_id = u.id
            ${whereClause}
           ORDER BY pf.created_at DESC, pf.id DESC
           LIMIT ? OFFSET ?
        ) page_folder
       ORDER BY page_folder.created_at DESC, page_folder.id DESC
    `
    const { countResult, result } = await db.withConsistentReadSnapshot(async snapshotQuery => {
      const countResult = await snapshotQuery(countQuery, queryParams)
      const result = await snapshotQuery(itemQuery, [...queryParams, limit, offset])
      return { countResult, result }
    })
    const total = Number((countResult.rows as Array<{ total?: number | string }>)[0]?.total) || 0

    const folders = (result.rows as Array<Record<string, unknown>>).map(folder => ({
      id: folder.id,
      name: folder.name,
      description: folder.description,
      user_id: folder.user_id,
      author: folder.author,
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

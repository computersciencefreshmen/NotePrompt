import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import {
  createPaginationMetadata,
  parseBoundedPagination,
  readBoundedSearchParam,
} from '@/lib/pagination-policy'
import { PUBLIC_FOLDER_SNAPSHOT_VISIBILITY_SQL } from '@/lib/public-folder-snapshot-policy'

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

    const conditions = ['pf.user_id = ?']
    const queryParams: Array<string | number> = [auth.user.id]
    if (search) {
      conditions.push('(pf.name LIKE ? OR pf.description LIKE ?)')
      const pattern = `%${search}%`
      queryParams.push(pattern, pattern)
    }
    const whereClause = `WHERE ${conditions.join(' AND ')}`

    const countQuery = `SELECT COUNT(*) AS total FROM public_folders pf ${whereClause}`
    const itemQuery = `SELECT
         pf.id,
         pf.name,
         pf.description,
         pf.user_id,
         pf.is_featured,
         pf.created_at,
         pf.updated_at,
         u.username AS author,
         (SELECT COUNT(*) FROM user_imported_folders uif WHERE uif.public_folder_id = pf.id) AS import_count,
         (
           SELECT COUNT(*)
           FROM public_folder_prompts snapshot
           JOIN public_folders published_folder ON published_folder.id = snapshot.public_folder_id
           WHERE snapshot.public_folder_id = pf.id
             AND ${PUBLIC_FOLDER_SNAPSHOT_VISIBILITY_SQL}
         ) AS prompt_count
       FROM public_folders pf
       JOIN users u ON u.id = pf.user_id
       ${whereClause}
       ORDER BY pf.created_at DESC, pf.id DESC
       LIMIT ? OFFSET ?`
    const { countResult, result } = await db.withConsistentReadSnapshot(async snapshotQuery => {
      const countResult = await snapshotQuery(countQuery, queryParams)
      const result = await snapshotQuery(itemQuery, [...queryParams, limit, offset])
      return { countResult, result }
    })
    const total = Number((countResult.rows as Record<string, unknown>[])[0]?.total) || 0

    const items = (result.rows as Record<string, unknown>[]).map((folder) => ({
      id: folder.id,
      name: folder.name,
      description: folder.description,
      user_id: folder.user_id,
      author: folder.author,
      import_count: Number(folder.import_count) || 0,
      prompt_count: Number(folder.prompt_count) || 0,
      is_featured: Boolean(folder.is_featured),
      created_at: folder.created_at,
      updated_at: folder.updated_at,
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
    console.error('Get user published folders error:', error)
    return NextResponse.json(
      { success: false, error: '获取发布的文件夹失败' },
      { status: 500 },
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { englishFeaturedFolders, type EnglishFeaturedFolder } from '@/data/english-featured-folders'
import type { PublicFolder } from '@/types'
import {
  createPaginationMetadata,
  parseBoundedPagination,
  readBoundedSearchParam,
} from '@/lib/pagination-policy'
import {
  checkIpRateLimit,
  createRateLimitResponse,
  rateLimitHttpStatus,
} from '@/lib/rate-limit'
import { PUBLIC_FOLDER_SNAPSHOT_VISIBILITY_SQL } from '@/lib/public-folder-snapshot-policy'


function toPublicFolderReaderDto(folder: EnglishFeaturedFolder): PublicFolder {
  return {
    id: folder.id,
    name: folder.name,
    description: folder.description,
    user_id: folder.user_id,
    is_featured: folder.is_featured,
    created_at: folder.created_at,
    updated_at: folder.updated_at,
    author: folder.author,
    prompt_count: folder.prompt_count,
  }
}
export async function GET(request: NextRequest) {
  try {
    const rateLimit = await checkIpRateLimit(
      request,
      'public-folders-list',
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
    const lang = searchParams.get('lang') || 'zh'
    if (lang !== 'zh' && lang !== 'en') {
      return NextResponse.json(
        { success: false, error: 'lang 仅支持 zh 或 en' },
        { status: 400 },
      )
    }

    if (lang === 'en') {
      const normalizedSearch = search.trim().toLowerCase()
      const filteredItems = englishFeaturedFolders.filter(folder => {
        if (!normalizedSearch) return true
        return [folder.name, folder.description, folder.author].join(' ').toLowerCase().includes(normalizedSearch)
      }).map(toPublicFolderReaderDto)
      const pagedItems = filteredItems.slice(offset, offset + limit)
      const pagination = createPaginationMetadata(filteredItems.length, paginationResult.value)

      return NextResponse.json({
        success: true,
        data: {
          items: pagedItems,
          total: pagination.total,
          page: pagination.page,
          limit: pagination.limit,
          totalPages: pagination.totalPages,
        },
      })
    }
    
    // 构建查询条件
    const whereConditions: string[] = []
    const queryParams: (string | number)[] = []
    
    if (search) {
      whereConditions.push('(pf.name LIKE ? OR pf.description LIKE ?)')
      const searchPattern = `%${search}%`
      queryParams.push(searchPattern, searchPattern)
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''
    
    // 主查询 - 使用正确的字段名，并计算提示词数量
    const itemQuery = `
      SELECT page_folder.id, page_folder.name, page_folder.description,
             page_folder.user_id, page_folder.is_featured,
             page_folder.created_at, page_folder.updated_at, page_folder.author,
             (SELECT COUNT(*)
                FROM public_folder_prompts snapshot
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
    
    // 计数查询
    const countQuery = `
      SELECT COUNT(DISTINCT pf.id) as total
      FROM public_folders pf
      JOIN users u ON pf.user_id = u.id
      ${whereClause}
    `
    
    const { countResult, result } = await db.withConsistentReadSnapshot(async snapshotQuery => {
      const countResult = await snapshotQuery(countQuery, queryParams)
      const result = await snapshotQuery(itemQuery, [...queryParams, limit, offset])
      return { countResult, result }
    })
    const total = Number((countResult.rows as Array<{ total?: number | string }>)[0]?.total) || 0
    const items = result.rows || []
    
    // 处理数据，确保返回正确的字段
    const processedItems = (items as Array<{
      id: number;
      name: string;
      description: string;
      user_id: number;
      is_featured: boolean;
      created_at: string;
      updated_at: string;
      author: string;
      prompt_count: number;
    }>).map(item => ({
      id: Number(item.id),
      name: String(item.name ?? ''),
      description: String(item.description ?? ''),
      user_id: Number(item.user_id),
      is_featured: Boolean(item.is_featured),
      created_at: String(item.created_at ?? ''),
      updated_at: String(item.updated_at ?? ''),
      author: String(item.author ?? ''),
      prompt_count: Number(item.prompt_count) || 0
    }))
    
    const pagination = createPaginationMetadata(total, paginationResult.value)
    
    return NextResponse.json({
      success: true,
      data: { 
        items: processedItems, 
        total: pagination.total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: pagination.totalPages,
      }
    })
  } catch (error) {
    console.error('Failed to fetch public folders:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch public folder list' },
      { status: 500 }
    )
  }
}

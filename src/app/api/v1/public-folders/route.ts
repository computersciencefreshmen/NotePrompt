import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { englishFeaturedFolders } from '@/data/english-featured-folders'
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
      })
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
    const query = `
      SELECT pf.id, pf.name, pf.description, pf.user_id, pf.original_folder_id, pf.is_featured,
             pf.created_at, pf.updated_at, u.username as author,
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
    `
    
    // 计数查询
    const countQuery = `
      SELECT COUNT(DISTINCT pf.id) as total
      FROM public_folders pf
      JOIN users u ON pf.user_id = u.id
      ${whereClause}
    `
    
    const countResult = await db.query(countQuery, queryParams)
    const total = (countResult.rows as { total: number }[])[0]?.total || 0

    const result = await db.query(query, [...queryParams, limit, offset])
    const items = result.rows || []
    
    // 处理数据，确保返回正确的字段
    const processedItems = (items as Array<{
      id: number;
      name: string;
      description: string;
      user_id: number;
      original_folder_id: number | null;
      is_featured: boolean;
      created_at: string;
      updated_at: string;
      author: string;
      prompt_count: number;
    }>).map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      user_id: item.user_id,
      original_folder_id: item.original_folder_id,
      is_featured: item.is_featured || false,
      created_at: item.created_at,
      updated_at: item.updated_at,
      author: item.author,
      prompt_count: item.prompt_count || 0
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

import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { parseBoundedPagination, readBoundedQueryParam } from '@/lib/pagination-policy'
import {
  checkAccountRateLimit,
  createRateLimitResponse,
  rateLimitHttpStatus,
} from '@/lib/rate-limit'

const MAX_SEARCH_QUERY_CHARS = 200

// GET - 全局搜索
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const paginationResult = parseBoundedPagination(searchParams, {
      defaultLimit: 20,
      maxLimit: 50,
    })
    const keywordResult = readBoundedQueryParam(searchParams, 'q', MAX_SEARCH_QUERY_CHARS)
    if (!paginationResult.ok) {
      return NextResponse.json({ success: false, error: paginationResult.error }, { status: 400 })
    }
    if (!keywordResult.ok) {
      return NextResponse.json({ success: false, error: keywordResult.error }, { status: 400 })
    }
    const { page, limit } = paginationResult.value
    const keyword = keywordResult.value

    const rateLimit = await checkAccountRateLimit(
      'search',
      auth.user.id,
      { windowMs: 60_000, maxRequests: 60 },
    )
    if (!rateLimit.allowed) {
      return NextResponse.json(
        createRateLimitResponse(rateLimit),
        { status: rateLimitHttpStatus(rateLimit) },
      )
    }

    if (!keyword) {
      return NextResponse.json({
        success: true,
        data: {
          userPrompts: { items: [], total: 0 },
          publicPrompts: { items: [], total: 0 },
          folders: { items: [] }
        }
      })
    }

    const results = await db.globalSearch(auth.user.id, keyword, { page, limit })

    return NextResponse.json({
      success: true,
      data: results
    })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { success: false, error: '搜索失败' },
      { status: 500 }
    )
  }
}

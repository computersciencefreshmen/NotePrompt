import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 全局搜索
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const keyword = searchParams.get('q') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    if (!keyword.trim()) {
      return NextResponse.json({
        success: true,
        data: {
          userPrompts: { items: [], total: 0 },
          publicPrompts: { items: [], total: 0 },
          folders: { items: [] }
        }
      })
    }

    const results = await db.globalSearch(auth.user.id, keyword.trim(), { page, limit })

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

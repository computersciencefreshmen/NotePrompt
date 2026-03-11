import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAdminAuth } from '@/lib/auth'

// GET - 获取各用户AI使用统计
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 403 })
    }

    const result = await db.query(
      `SELECT 
        u.id as user_id,
        u.username,
        u.email,
        u.user_type,
        COALESCE(s.ai_optimize_count, 0) as ai_optimize_count,
        COALESCE(s.ai_generate_count, 0) as ai_generate_count,
        COALESCE(s.total_ai_usage, 0) as total_ai_usage,
        COALESCE(s.monthly_usage, 0) as monthly_usage,
        s.last_reset_date,
        s.updated_at as last_used_at
      FROM users u
      LEFT JOIN user_usage_stats s ON u.id = s.user_id
      ORDER BY COALESCE(s.total_ai_usage, 0) DESC`
    )

    return NextResponse.json({
      success: true,
      data: result.rows
    })
  } catch (error) {
    console.error('获取AI用量统计失败:', error)
    return NextResponse.json(
      { success: false, error: '获取AI用量统计失败' },
      { status: 500 }
    )
  }
}

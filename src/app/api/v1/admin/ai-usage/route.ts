import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAdminAuth } from '@/lib/auth'

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// GET - 获取各用户AI使用统计
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 403 })
    }

    await db.ensureAIUsageDailyTable()

    const now = new Date()
    const monthStart = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1))
    const nextMonthStart = formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 1))

    const result = await db.query(
      `SELECT 
        u.id as user_id,
        u.username,
        u.email,
        u.user_type,
        COALESCE(s.ai_optimize_count, 0) as ai_optimize_count,
        COALESCE(s.ai_generate_count, 0) as ai_generate_count,
        COALESCE(s.total_ai_usage, 0) as total_ai_usage,
        COALESCE(m.monthly_usage, 0) as monthly_usage,
        COALESCE(s.last_reset_date, DATE(s.created_at), CURRENT_DATE) as last_reset_date,
        COALESCE(s.updated_at, s.created_at) as last_used_at
      FROM users u
      LEFT JOIN user_usage_stats s ON u.id = s.user_id
      LEFT JOIN (
        SELECT user_id, SUM(total_count) as monthly_usage
        FROM ai_usage_daily
        WHERE usage_date >= ? AND usage_date < ?
        GROUP BY user_id
      ) m ON u.id = m.user_id
      ORDER BY COALESCE(m.monthly_usage, 0) DESC, COALESCE(s.total_ai_usage, 0) DESC`,
      [monthStart, nextMonthStart]
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

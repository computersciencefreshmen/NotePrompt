import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 获取用户 AI 使用热力图数据（最近 6 个月）
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id

    // 获取最近 6 个月的每日使用数据
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const startDate = sixMonthsAgo.toISOString().split('T')[0]

    const result = await db.query(
      `SELECT usage_date, optimize_count, generate_count, total_count
       FROM ai_usage_daily
       WHERE user_id = ? AND usage_date >= ?
       ORDER BY usage_date ASC`,
      [String(userId), startDate]
    )

    const dailyData = result.rows as Array<{
      usage_date: string
      optimize_count: number
      generate_count: number
      total_count: number
    }>

    // 计算统计摘要
    let totalOptimize = 0
    let totalGenerate = 0
    let totalAll = 0
    let maxDaily = 0
    let activeDays = 0

    for (const day of dailyData) {
      totalOptimize += day.optimize_count
      totalGenerate += day.generate_count
      totalAll += day.total_count
      if (day.total_count > maxDaily) maxDaily = day.total_count
      if (day.total_count > 0) activeDays++
    }

    return NextResponse.json({
      success: true,
      data: {
        daily: dailyData,
        summary: {
          totalOptimize,
          totalGenerate,
          totalAll,
          maxDaily,
          activeDays,
          totalDays: dailyData.length,
        }
      }
    })
  } catch (error) {
    console.error('获取热力图数据失败:', error)
    return NextResponse.json(
      { success: false, error: '获取热力图数据失败' },
      { status: 500 }
    )
  }
}

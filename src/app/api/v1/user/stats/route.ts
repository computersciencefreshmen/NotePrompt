import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function getCurrentMonthUsage(userId: number) {
  const now = new Date()
  const monthStart = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1))
  const nextMonthStart = formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 1))
  const result = await db.query(
    `SELECT COALESCE(SUM(total_count), 0) as monthly_usage
     FROM ai_usage_daily
     WHERE user_id = ? AND usage_date >= ? AND usage_date < ?`,
    [userId, monthStart, nextMonthStart]
  )
  const row = (result.rows as { monthly_usage?: number | string }[])[0]
  return Number(row?.monthly_usage) || 0
}

async function getFavoriteCount(userId: number) {
  const result = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM user_favorites WHERE user_id = ?)
       + (SELECT COUNT(*) FROM curated_prompt_favorites WHERE user_id = ?) AS total`,
    [userId, userId],
  )
  return Number((result.rows as Array<{ total?: number | string }>)[0]?.total) || 0
}

function buildStatsResponse(data: {
  totalPrompts: number
  totalFolders: number
  totalFavorites: number
  monthlyUsage: number
  maxPrompts: number
  userStats?: Record<string, unknown> | null
}) {
  return {
    total_prompts: data.totalPrompts,
    total_folders: data.totalFolders,
    total_favorites: data.totalFavorites,
    monthly_usage: data.monthlyUsage,
    ai_optimize_count: Number(data.userStats?.ai_optimize_count) || 0,
    ai_generate_count: Number(data.userStats?.ai_generate_count) || 0,
    total_ai_usage: Number(data.userStats?.total_ai_usage) || 0,
    max_prompts: data.maxPrompts
  }
}

// GET - 获取用户统计
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    let userStats = await db.getUserStats(userId)
    
    if (!userStats) {
      await db.createUserStats(userId)
      userStats = await db.getUserStats(userId)
    }

    const [monthlyUsage, totalPrompts, totalFolders, totalFavorites] = await Promise.all([
      getCurrentMonthUsage(userId),
      db.getUserPromptCount(userId),
      db.getUserFolderCount(userId),
      getFavoriteCount(userId)
    ])
    const maxPrompts = auth.user.user_type === 'free' ? 50 : -1

    return NextResponse.json({
      success: true,
      data: buildStatsResponse({ totalPrompts, totalFolders, totalFavorites, monthlyUsage, maxPrompts, userStats })
    })
  } catch (error) {
    console.error('Get user stats error:', error)
    return NextResponse.json(
      { success: false, error: '获取统计数据失败' },
      { status: 500 }
    )
  }
}

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
  await db.ensureAIUsageDailyTable()
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

async function safeCount(label: string, getCount: () => Promise<number>) {
  try {
    return await getCount()
  } catch (error) {
    console.warn(`User stats count fallback for ${label}:`, error)
    return 0
  }
}

function buildStatsResponse(data: {
  totalPrompts: number
  totalFolders: number
  totalFavorites: number
  monthlyUsage: number
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
    max_prompts: 50
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
    await db.ensureAIUsageDailyTable()
    let userStats = await db.getUserStats(userId)
    
    if (!userStats) {
      await db.createUserStats(userId)
      userStats = await db.getUserStats(userId)
    }

    const [monthlyUsage, totalPrompts, totalFolders, totalFavorites] = await Promise.all([
      getCurrentMonthUsage(userId),
      safeCount('prompts', () => db.getUserPromptCount(userId)),
      safeCount('folders', () => db.getUserFolderCount(userId)),
      safeCount('favorites', () => db.getUserFavoriteCount(userId))
    ])

    return NextResponse.json({
      success: true,
      data: buildStatsResponse({ totalPrompts, totalFolders, totalFavorites, monthlyUsage, userStats })
    })
  } catch (error) {
    console.error('Get user stats error:', error)
    const details = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { success: false, error: '获取统计数据失败', details: process.env.NODE_ENV === 'development' ? details : undefined },
      { status: 500 }
    )
  }
}

// PUT - 更新用户统计
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    const body = await request.json()

    // 更新统计数据
    const updates: Partial<{
      ai_optimize_count: number;
      monthly_usage: number;
      last_reset_date: string;
    }> = {}
    
    if (body.ai_optimize_count !== undefined) {
      updates.ai_optimize_count = body.ai_optimize_count
    }
    
    if (body.monthly_usage !== undefined) {
      updates.monthly_usage = body.monthly_usage
    }

    if (Object.keys(updates).length > 0) {
      await db.updateUserStats(userId, updates)
    }

    // 返回更新后的统计
    const updatedStats = await db.getUserStats(userId)
    const totalPrompts = await db.getUserPromptCount(userId)
    const totalFolders = await db.getUserFolderCount(userId)
    const totalFavorites = await db.getUserFavoriteCount(userId)

    return NextResponse.json({
      success: true,
      data: {
        total_prompts: totalPrompts,
        total_folders: totalFolders,
        total_favorites: totalFavorites,
        monthly_usage: await getCurrentMonthUsage(userId),
        ai_optimize_count: updatedStats?.ai_optimize_count || 0,
        max_prompts: 50
      }
    })
  } catch (error) {
    console.error('Update user stats error:', error)
    return NextResponse.json(
      { success: false, error: '更新统计数据失败' },
      { status: 500 }
    )
  }
}

// POST - 增加AI优化使用次数
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    const body = await request.json()
    
    if (body.action === 'increment_ai_usage') {
      // 增加AI优化使用次数
      const aiMode = body.aiMode || 'ai_optimize'
      await db.incrementAIUsage(userId, aiMode)
      
      // 返回更新后的统计
      const updatedStats = await db.getUserStats(userId)
      const monthlyUsage = await getCurrentMonthUsage(userId)
      const totalPrompts = await db.getUserPromptCount(userId)
      const totalFolders = await db.getUserFolderCount(userId)
      const totalFavorites = await db.getUserFavoriteCount(userId)

      return NextResponse.json({
        success: true,
        data: {
          total_prompts: totalPrompts,
          total_folders: totalFolders,
          total_favorites: totalFavorites,
          monthly_usage: monthlyUsage,
          ai_optimize_count: updatedStats?.ai_optimize_count || 0,
          ai_generate_count: updatedStats?.ai_generate_count || 0,
          total_ai_usage: updatedStats?.total_ai_usage || 0,
          max_prompts: 50
        }
      })
    }

    return NextResponse.json(
      { success: false, error: '无效的操作' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Increment AI usage error:', error)
    return NextResponse.json(
      { success: false, error: '增加使用次数失败' },
      { status: 500 }
    )
  }
}

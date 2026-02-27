import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 获取用户统计
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    const userStats = await db.getUserStats(userId)
    
    if (!userStats) {
      // 如果用户没有统计记录，创建一个
      await db.createUserStats(userId)
      const newStats = await db.getUserStats(userId)
      
      return NextResponse.json({
        success: true,
        data: {
          total_prompts: 0,
          total_folders: 0,
          total_favorites: 0,
          monthly_usage: newStats?.monthly_usage || 0,
          ai_optimize_count: newStats?.ai_optimize_count || 0,
          max_prompts: 50 // 免费用户限制
        }
      })
    }

    // 获取用户的其他统计数据
    const totalPrompts = await db.getUserPromptCount(userId)
    const totalFolders = await db.getUserFolderCount(userId)
    const totalFavorites = await db.getUserFavoriteCount(userId)

    // 检查是否需要月度重置
    const now = new Date()
    const lastReset = new Date(userStats.last_reset_date || userStats.created_at)
    const isNewMonth = now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()

    if (isNewMonth) {
      // 重置月度使用量
      await db.updateUserStats(userId, {
        monthly_usage: 0,
        last_reset_date: now.toISOString().split('T')[0]
      })
      userStats.monthly_usage = 0
    }

    return NextResponse.json({
      success: true,
      data: {
        total_prompts: totalPrompts,
        total_folders: totalFolders,
        total_favorites: totalFavorites,
        monthly_usage: userStats.monthly_usage,
        ai_optimize_count: userStats.ai_optimize_count || 0,
        max_prompts: 50 // 免费用户限制
      }
    })
  } catch (error) {
    console.error('Get user stats error:', error)
    return NextResponse.json(
      { success: false, error: '获取统计数据失败' },
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
        monthly_usage: updatedStats?.monthly_usage || 0,
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
      const totalPrompts = await db.getUserPromptCount(userId)
      const totalFolders = await db.getUserFolderCount(userId)
      const totalFavorites = await db.getUserFavoriteCount(userId)

      return NextResponse.json({
        success: true,
        data: {
          total_prompts: totalPrompts,
          total_folders: totalFolders,
          total_favorites: totalFavorites,
          monthly_usage: updatedStats?.monthly_usage || 0,
          ai_optimize_count: updatedStats?.ai_optimize_count || 0,
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

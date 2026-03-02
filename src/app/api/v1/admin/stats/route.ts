import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAdminAuth } from '@/lib/auth'

// GET - 获取管理员统计数据
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 403 })
    }

    // 并行获取所有统计数据
    const [
      usersResult,
      promptsResult,
      publicPromptsResult,
      publicFoldersResult,
      favoritesResult,
      recentUsersResult,
      recentPromptsResult
    ] = await Promise.all([
      db.query('SELECT COUNT(*) as total, SUM(CASE WHEN is_admin = 1 THEN 1 ELSE 0 END) as admins, SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active FROM users'),
      db.query('SELECT COUNT(*) as total FROM user_prompts'),
      db.query('SELECT COUNT(*) as total, SUM(CASE WHEN is_featured = 1 THEN 1 ELSE 0 END) as featured FROM public_prompts'),
      db.query('SELECT COUNT(*) as total FROM public_folders'),
      db.query('SELECT COUNT(*) as total FROM user_favorites'),
      db.query('SELECT id, username, email, user_type, is_admin, created_at FROM users ORDER BY created_at DESC'),
      db.query(`
        SELECT pp.id, pp.title, pp.created_at, pp.views_count,
          (SELECT COUNT(*) FROM user_favorites uf WHERE uf.public_prompt_id = pp.id) as favorites_count,
          u.username as author
        FROM public_prompts pp
        LEFT JOIN users u ON pp.author_id = u.id
        ORDER BY pp.created_at DESC
      `)
    ])

    const users = (usersResult.rows as Record<string, number>[])[0]
    const prompts = (promptsResult.rows as { total: number }[])[0]
    const publicPrompts = (publicPromptsResult.rows as Record<string, number>[])[0]
    const publicFolders = (publicFoldersResult.rows as { total: number }[])[0]
    const favorites = (favoritesResult.rows as { total: number }[])[0]

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalUsers: users.total,
          adminUsers: users.admins,
          activeUsers: users.active,
          totalPrompts: prompts.total,
          totalPublicPrompts: publicPrompts.total,
          featuredPrompts: publicPrompts.featured,
          totalPublicFolders: publicFolders.total,
          totalFavorites: favorites.total,
        },
        recentUsers: recentUsersResult.rows,
        recentPrompts: recentPromptsResult.rows
      }
    })
  } catch (error) {
    console.error('获取统计数据失败:', error)
    return NextResponse.json(
      { success: false, error: '获取统计数据失败' },
      { status: 500 }
    )
  }
}

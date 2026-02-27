import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import db from '@/lib/mysql-database'

// GET - 导出用户数据
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const user_id = auth.user.id

    // 获取用户信息
    const user = await db.getUserById(user_id)
    const { password_hash, ...userWithoutPassword } = user

    // 获取用户文件夹
    const foldersResult = await db.query('SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC', [user_id])
    const folders = (foldersResult.rows as any[]).map(f => ({
      id: f.id,
      name: f.name,
      created_at: f.created_at,
      updated_at: f.updated_at
    }))

    // 获取用户提示词
    const promptsResult = await db.query(
      `SELECT p.*, f.name as folder_name
       FROM user_prompts p
       LEFT JOIN folders f ON p.folder_id = f.id
       WHERE p.user_id = ?
       ORDER BY p.updated_at DESC`,
      [user_id]
    )

    const prompts = await Promise.all(
      (promptsResult.rows as any[]).map(async (p) => {
        // 获取提示词标签
        const tagsResult = await db.query(
          `SELECT t.name, t.color
           FROM user_prompt_tags upt
           JOIN tags t ON upt.tag_id = t.id
           WHERE upt.user_prompt_id = ?`,
          [p.id]
        )
        const tags = (tagsResult.rows as any[]).map(t => ({ name: t.name, color: t.color }))

        return {
          id: p.id,
          title: p.title,
          content: p.content,
          description: p.description,
          folder_name: p.folder_name,
          created_at: p.created_at,
          updated_at: p.updated_at,
          tags
        }
      })
    )

    // 获取收藏列表
    const favoritesResult = await db.query(
      `SELECT pp.*, f.created_at as favorited_at
       FROM favorites f
       JOIN public_prompts pp ON f.public_prompt_id = pp.id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`,
      [user_id]
    )

    const favorites = (favoritesResult.rows as any[]).map(f => ({
      id: f.id,
      title: f.title,
      content: f.content,
      description: f.description,
      category_id: f.category_id,
      views: f.views,
      favorited_at: f.favorited_at
    }))

    // 获取导入的文件夹
    const importedFoldersResult = await db.query(
      `SELECT * FROM imported_folders WHERE user_id = ? ORDER BY imported_at DESC`,
      [user_id]
    )

    const imported_folders = (importedFoldersResult.rows as any[]).map(f => ({
      id: f.id,
      name: f.name,
      imported_at: f.imported_at
    }))

    // 获取用户统计
    const statsResult = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM user_prompts WHERE user_id = ?) as total_prompts,
         (SELECT COUNT(*) FROM folders WHERE user_id = ?) as total_folders,
         (SELECT COUNT(*) FROM favorites WHERE user_id = ?) as total_favorites,
         (SELECT COUNT(*) FROM imported_folders WHERE user_id = ?) as total_imported_folders`,
      [user_id, user_id, user_id, user_id]
    )

    const stats = (statsResult.rows as any[])[0]

    return NextResponse.json({
      success: true,
      data: {
        user: userWithoutPassword,
        folders,
        prompts,
        favorites,
        imported_folders,
        stats
      }
    })
  } catch (error) {
    console.error('导出数据失败:', error)
    return NextResponse.json(
      { success: false, error: '导出数据失败' },
      { status: 500 }
    )
  }
}

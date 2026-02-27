import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 管理员获取公共文件夹列表
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    
    // 检查管理员权限
    if (!auth.user.is_admin) {
      return NextResponse.json(
        { success: false, error: '需要管理员权限' },
        { status: 403 }
      )
    }

    // 获取所有公共文件夹
    const result = await db.query(`
      SELECT pf.*, u.username as author,
             COALESCE(prompt_counts.count, 0) as prompt_count
      FROM public_folders pf
      JOIN users u ON pf.user_id = u.id
      LEFT JOIN (
        SELECT upf.folder_id, COUNT(*) as count
        FROM user_prompt_folders upf
        GROUP BY upf.folder_id
      ) prompt_counts ON prompt_counts.folder_id = pf.original_folder_id
      ORDER BY pf.created_at DESC
    `)

    const folders = (result.rows as any[]).map(folder => ({
      id: folder.id,
      name: folder.name,
      description: folder.description,
      user_id: folder.user_id,
      author: folder.author,
      original_folder_id: folder.original_folder_id,
      is_featured: folder.is_featured || false,
      prompt_count: folder.prompt_count || 0,
      created_at: folder.created_at,
      updated_at: folder.updated_at
    }))

    return NextResponse.json({
      success: true,
      data: folders
    })
  } catch (error) {
    console.error('Get admin public folders error:', error)
    return NextResponse.json(
      { success: false, error: '获取公共文件夹失败' },
      { status: 500 }
    )
  }
} 
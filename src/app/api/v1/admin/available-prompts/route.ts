import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 获取可选的提示词列表（用于添加到文件夹）
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

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const folderId = searchParams.get('folderId')

    // 构建查询条件
    let whereClause = 'WHERE 1=1'
    const queryParams: (string | number)[] = []

    if (search) {
      whereClause += ' AND (up.title LIKE ? OR up.content LIKE ?)'
      const searchPattern = `%${search}%`
      queryParams.push(searchPattern, searchPattern)
    }

    // 如果指定了文件夹ID，排除已经在文件夹中的提示词
    if (folderId) {
      whereClause += ' AND up.id NOT IN (SELECT user_prompt_id FROM user_prompt_folders WHERE folder_id = ?)'
      queryParams.push(parseInt(folderId))
    }

    // 获取可选的提示词
    const result = await db.query(`
      SELECT up.id, up.title, up.content, up.description, up.created_at, up.updated_at,
             u.username as author
      FROM user_prompts up
      JOIN users u ON up.user_id = u.id
      ${whereClause}
      ORDER BY up.created_at DESC
      LIMIT 50
    `, queryParams)

    const prompts = (result.rows as any[]).map(prompt => ({
      id: prompt.id,
      title: prompt.title,
      content: prompt.content,
      description: prompt.description,
      author: prompt.author,
      created_at: prompt.created_at,
      updated_at: prompt.updated_at
    }))

    return NextResponse.json({
      success: true,
      data: prompts
    })
  } catch (error) {
    console.error('Get available prompts error:', error)
    return NextResponse.json(
      { success: false, error: '获取可选提示词失败' },
      { status: 500 }
    )
  }
} 
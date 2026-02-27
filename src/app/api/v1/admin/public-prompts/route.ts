import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 管理员获取公共提示词列表
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

    // 获取所有公共提示词
    const result = await db.query(`
      SELECT pp.*, u.username as author
      FROM public_prompts pp
      JOIN users u ON pp.author_id = u.id
      ORDER BY pp.created_at DESC
    `)

    const prompts = (result.rows as any[]).map(prompt => ({
      id: prompt.id,
      title: prompt.title,
      content: prompt.content,
      description: prompt.description,
      author_id: prompt.author_id,
      author: prompt.author,
      category_id: prompt.category_id,
      is_featured: prompt.is_featured || false,
      created_at: prompt.created_at,
      updated_at: prompt.updated_at
    }))

    return NextResponse.json({
      success: true,
      data: prompts
    })
  } catch (error) {
    console.error('Get admin public prompts error:', error)
    return NextResponse.json(
      { success: false, error: '获取公共提示词失败' },
      { status: 500 }
    )
  }
} 
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 获取用户发布的公共提示词列表
export async function GET(request: NextRequest) {
  try {
    console.log('开始获取用户发布的提示词...')
    
    const auth = await requireAuth(request)
    if ('error' in auth) {
      console.log('认证失败:', auth.error)
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    console.log('用户ID:', userId)

    // 获取查询参数
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const search = searchParams.get('search') || ''
    const offset = (page - 1) * limit

    console.log('查询参数:', { page, limit, search, offset })

    // 简化的查询 - 先获取基本数据
    const whereConditions = ['pp.author_id = ' + userId]
    let searchConditions = ''

    if (search) {
      searchConditions = ` AND (pp.title LIKE '%${search}%' OR pp.content LIKE '%${search}%')`
    }

    // 获取总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM public_prompts pp
      WHERE ${whereConditions.join(' AND ')}${searchConditions}
    `
    console.log('计数查询:', countQuery)
    
    const countResult = await db.queryRaw(countQuery)
    const total = (countResult.rows as Record<string, unknown>[])[0]?.total as number || 0
    console.log('总数:', total)

    // 获取基本数据
    const dataQuery = `
      SELECT pp.id, pp.title, pp.content, pp.description, pp.created_at, pp.updated_at,
             u.username as author
      FROM public_prompts pp
      JOIN users u ON pp.author_id = u.id
      WHERE ${whereConditions.join(' AND ')}${searchConditions}
      ORDER BY pp.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
    console.log('数据查询:', dataQuery)
    
    const result = await db.queryRaw(dataQuery)
    const prompts = result.rows || []
    console.log('原始数据:', prompts)

    // 处理数据格式
    const processedPrompts = (prompts as Record<string, unknown>[]).map(prompt => ({
      id: prompt.id as number,
      title: prompt.title as string,
      content: prompt.content as string,
      description: prompt.description as string,
      author: prompt.author as string,
      favorites_count: 0, // 暂时设为0
      is_featured: false, // 暂时设为false
      created_at: prompt.created_at as string,
      updated_at: prompt.updated_at as string,
      tags: [] // 暂时设为空数组
    }))

    const totalPages = Math.ceil(total / limit)
    console.log('处理后的数据:', processedPrompts)

    return NextResponse.json({
      success: true,
      data: {
        items: processedPrompts,
        total,
        page,
        limit,
        totalPages
      }
    })
  } catch (error) {
    console.error('Get user published prompts error:', error)
    return NextResponse.json(
      { success: false, error: '获取发布的提示词失败', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 
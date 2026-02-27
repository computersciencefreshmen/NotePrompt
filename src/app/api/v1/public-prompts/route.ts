
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    console.log('开始处理公共提示词列表请求...')
    
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const search = searchParams.get('search') || ''
    const tag = searchParams.get('tag') || ''
    const sort = searchParams.get('sort') || 'latest'
    
    console.log('请求参数:', { page, limit, search, tag, sort })
    
    // 尝试获取用户信息（可选）
    let userId: number | null = null
    try {
      const auth = await requireAuth(request)
      if (!('error' in auth)) {
        userId = auth.user.id
      }
    } catch (authError) {
      // 用户未登录，继续执行
      console.log('用户未登录，继续获取公共提示词')
    }
    
    // 构建查询条件
    const whereConditions: string[] = []
    const queryParams: (string | number)[] = []
    
    if (search) {
      whereConditions.push('(pp.title LIKE ? OR pp.content LIKE ? OR pp.description LIKE ?)')
      const searchPattern = `%${search}%`
      queryParams.push(searchPattern, searchPattern, searchPattern)
    }
    
    if (tag) {
      whereConditions.push('EXISTS (SELECT 1 FROM public_prompt_tags ppt JOIN tags t ON ppt.tag_id = t.id WHERE ppt.public_prompt_id = pp.id AND t.name = ?)')
      queryParams.push(tag)
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''
    
    // 排序
    let orderClause = 'ORDER BY pp.created_at DESC'
    if (sort === 'favorites') {
      orderClause = 'ORDER BY pp.views_count DESC, pp.created_at DESC'
    }
    
    // 分页计算
    const offset = (page - 1) * limit
    
    // 主查询
    const query = `
      SELECT pp.id, pp.title, pp.content, pp.description, pp.views_count,
             pp.created_at, pp.updated_at, pp.is_featured, u.username as author,
             (SELECT COUNT(*) FROM user_favorites uf WHERE uf.public_prompt_id = pp.id) as favorites_count
      FROM public_prompts pp
      JOIN users u ON pp.author_id = u.id
      ${whereClause}
      ${orderClause}
      LIMIT ${limit} OFFSET ${offset}
    `
    
    // 计数查询
    const countQuery = `
      SELECT COUNT(*) as total
      FROM public_prompts pp
      JOIN users u ON pp.author_id = u.id
      ${whereClause}
    `
    
    console.log('执行计数查询...')
    const countResult = await db.query(countQuery, queryParams)
    const total = (countResult.rows as { total: number }[])[0]?.total || 0
    console.log('总数:', total)
    
    console.log('执行主查询...')
    const result = await db.query(query, queryParams)
    const items = result.rows || []
    console.log('查询结果数量:', Array.isArray(items) ? items.length : 0)
    
    // 处理数据，获取标签信息和收藏状态
    const processedItems = await Promise.all((items as Array<{
      id: number;
      title: string;
      content: string;
      description: string;
      views_count: number;
      created_at: string;
      updated_at: string;
      is_featured: boolean;
      author: string;
      favorites_count: number;
    }>).map(async (item) => {
      // 获取提示词的标签
      const tagsResult = await db.getPublicPromptTags(item.id)
      const tags = tagsResult.map(tag => tag.name)
      
      // 检查用户是否收藏了该提示词
      let isFavorited = false
      if (userId) {
        try {
          isFavorited = await db.isFavoritedByUser(userId, item.id)
        } catch (favoriteError) {
          console.error('检查收藏状态失败:', favoriteError)
        }
      }
      
      return {
        id: item.id,
        title: item.title,
        content: item.content,
        description: item.description,
        views_count: item.views_count || 0,
        favorites_count: item.favorites_count || 0,
        created_at: item.created_at,
        updated_at: item.updated_at,
        author: item.author,
        tags: tags,
        category: null,
        is_featured: item.is_featured || false,
        is_favorited: isFavorited
      }
    }))
    
    const totalPages = Math.ceil(total / limit)
    
    console.log('返回数据:', { 
      itemsCount: processedItems.length, 
      total, 
      page, 
      limit, 
      totalPages 
    })
    
    return NextResponse.json({
      success: true,
      data: { 
        items: processedItems, 
        total, 
        page, 
        limit, 
        totalPages 
      }
    })
  } catch (error) {
    console.error('获取公共提示词失败:', error)
    console.error('错误详情:', {
      message: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    })
    return NextResponse.json(
      { 
        success: false, 
        error: '获取公共提示词列表失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}

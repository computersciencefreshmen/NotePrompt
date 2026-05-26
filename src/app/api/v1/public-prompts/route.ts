
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { getCuratedPublicPrompts, hydrateCuratedPublicPrompts } from '@/lib/curated-public-prompts'

function sortPublicPrompts<T extends { created_at: string; favorites_count: number; views_count: number }>(items: T[], sort: string) {
  return [...items].sort((a, b) => {
    if (sort === 'latest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    return (b.favorites_count - a.favorites_count) || (b.views_count - a.views_count) || (new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  })
}

async function getOptionalUserId(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (!('error' in auth)) return auth.user.id
  } catch {
    return null
  }
  return null
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10')))
    const search = searchParams.get('search') || ''
    const tag = searchParams.get('tag') || ''
    const lang = searchParams.get('lang') || 'zh'
    const sort = searchParams.get('sort') || 'latest'

    const userId = await getOptionalUserId(request)

    if (lang === 'en') {
      const normalizedSearch = search.trim().toLowerCase()
      const normalizedTag = tag.trim().toLowerCase()
      const filteredItems = getCuratedPublicPrompts('en').filter(prompt => {
        const matchesSearch = !normalizedSearch || [prompt.title, prompt.description || '', prompt.content, prompt.category, ...prompt.tags]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch)
        const matchesTag = !normalizedTag || prompt.tags.some(item => item.toLowerCase() === normalizedTag) || prompt.category.toLowerCase() === normalizedTag
        return matchesSearch && matchesTag
      })
      const hydratedItems = await hydrateCuratedPublicPrompts(filteredItems, userId)
      const sortedItems = sortPublicPrompts(hydratedItems, sort)
      const offset = (page - 1) * limit
      const pagedItems = sortedItems.slice(offset, offset + limit)
      const total = sortedItems.length

      return NextResponse.json({
        success: true,
        data: {
          items: pagedItems,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      })
    }
    
    // 构建查询条件
    const whereConditions: string[] = ['pp.id < 900000']
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
    
    // 主查询
    const query = `
      SELECT pp.id, pp.title, pp.content, pp.description, pp.views_count,
             pp.created_at, pp.updated_at, pp.is_featured, u.username as author,
             (SELECT COUNT(*) FROM user_favorites uf WHERE uf.public_prompt_id = pp.id) as favorites_count
      FROM public_prompts pp
      JOIN users u ON pp.author_id = u.id
      ${whereClause}
    `
    
    const result = await db.query(query, queryParams)
    const items = result.rows || []
    
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
    const normalizedSearch = search.trim().toLowerCase()
    const normalizedTag = tag.trim().toLowerCase()
    const curatedItems = getCuratedPublicPrompts('zh').filter(prompt => {
      const matchesSearch = !normalizedSearch || [prompt.title, prompt.description || '', prompt.content, prompt.category, ...prompt.tags]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch)
      const matchesTag = !normalizedTag || prompt.tags.some(item => item.toLowerCase() === normalizedTag) || prompt.category.toLowerCase() === normalizedTag
      return matchesSearch && matchesTag
    })
    const hydratedCuratedItems = await hydrateCuratedPublicPrompts(curatedItems, userId)
    const allItems = sortPublicPrompts([...processedItems, ...hydratedCuratedItems], sort)

    const offset = (page - 1) * limit
    const pagedItems = allItems.slice(offset, offset + limit)
    const total = allItems.length
    
    const totalPages = Math.ceil(total / limit)
    
    return NextResponse.json({
      success: true,
      data: { 
        items: pagedItems,
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

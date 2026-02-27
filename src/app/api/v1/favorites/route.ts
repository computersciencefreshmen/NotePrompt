import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 获取收藏列表（需要认证）
export async function GET(request: NextRequest) {
  try {
    console.log('开始处理收藏列表请求...')
    const auth = await requireAuth(request)
    if ('error' in auth) {
      console.log('认证失败:', auth.error)
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const user_id = auth.user.id
    console.log('用户认证成功，用户ID:', user_id)
    
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    console.log('分页参数:', { page, limit })
    
    // 查询用户收藏的公共提示词（包含详细信息）
    console.log('开始查询用户收藏，用户ID:', user_id)
    const favoritePrompts = await db.getFavoritesByUserId(user_id)
    console.log('查询结果数量:', favoritePrompts.length)
    
    // 处理数据，添加标签信息和收藏状态
    const processedFavorites = await Promise.all(favoritePrompts.map(async (item: any) => {
      // 获取提示词的标签
      const tagsResult = await db.getPublicPromptTags(item.id)
      const tags = tagsResult.map((tag: any) => tag.name)
      
      return {
        id: item.id,
        title: item.title,
        content: item.content,
        description: item.description,
        views_count: item.views_count || 0,
        favorites_count: item.favorites_count || 0,
        created_at: item.created_at,
        updated_at: item.updated_at,
        author: item.username,
        author_id: item.author_id,
        tags: tags,
        category: null,
        is_favorited: true, // 在收藏夹中的都是已收藏的
        is_featured: item.is_featured || false
      }
    }))
    
    // 计算分页
    const totalCount = processedFavorites.length
    const totalPages = Math.ceil(totalCount / limit)
    const startIndex = (page - 1) * limit
    const paginatedFavorites = processedFavorites.slice(startIndex, startIndex + limit)
    
    console.log('分页结果:', { totalCount, totalPages, startIndex, currentPageItems: paginatedFavorites.length })
    
    return NextResponse.json({
      success: true,
      data: {
        items: paginatedFavorites,
        total: totalCount,
        page,
        limit,
        totalPages
      }
    })
  } catch (error) {
    console.error('获取收藏列表失败:', error)
    console.error('错误详情:', {
      message: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    })
    return NextResponse.json(
      { 
        success: false, 
        error: '获取收藏列表失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}

// POST - 添加收藏（需要认证）
export async function POST(request: NextRequest) {
  try {
    console.log('开始处理添加收藏请求...')
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const user_id = auth.user.id
    const { public_prompt_id } = await request.json()

    if (!public_prompt_id) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      )
    }

    // 先检查是否已经收藏
    const isAlreadyFavorited = await db.isFavoritedByUser(user_id, public_prompt_id)
    
    if (isAlreadyFavorited) {
      return NextResponse.json(
        { success: false, error: '该提示词已经在收藏列表中' },
        { status: 409 }
      )
    }

    // 添加收藏
    const success = await db.addFavorite(user_id, public_prompt_id)
    
    if (!success) {
      return NextResponse.json(
        { success: false, error: '收藏失败，请稍后重试' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '收藏成功'
    })
  } catch (error) {
    console.error('添加收藏失败:', error)
    return NextResponse.json(
      { success: false, error: `收藏失败: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    )
  }
}

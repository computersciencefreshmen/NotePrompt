
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

type DbRow = Record<string, unknown>

export async function GET(request: NextRequest) {
  try {
    console.log('开始prompts API...')
    
    // 获取认证用户
    const auth = await requireAuth(request)
    if ('error' in auth) {
      console.log('认证失败:', auth.error)
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    console.log('用户ID:', userId)
    
    // 先检查用户是否存在
    const userCheck = await db.query('SELECT id, username FROM users WHERE id = ?', [userId])
    console.log('用户检查结果:', userCheck.rows)
    
    // 获取查询参数
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const folderId = searchParams.get('folder_id')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '12')
    const offset = (page - 1) * limit
    
    // 确保参数是有效的数字
    if (isNaN(page) || isNaN(limit) || isNaN(offset)) {
      return NextResponse.json(
        { success: false, error: 'Invalid pagination parameters' },
        { status: 400 }
      )
    }
    
    console.log('查询参数:', { search, folderId, page, limit, offset })
    
    // 简化的查询，先确保基本功能正常
    let query = `
      SELECT up.id, up.title, up.content, up.description, up.category_id,
             up.created_at, up.updated_at, u.username, u.avatar_url
      FROM user_prompts up
      LEFT JOIN users u ON up.user_id = u.id
      WHERE up.user_id = ?
    `
    
    let countQuery = `
      SELECT COUNT(*) as total
      FROM user_prompts up
      WHERE up.user_id = ?
    `
    
    const queryParams: (string | number)[] = [userId]
    
    // 添加搜索条件
    if (search && search.trim()) {
      query += ` AND (up.title LIKE ? OR up.content LIKE ? OR up.description LIKE ?)`
      countQuery += ` AND (up.title LIKE ? OR up.content LIKE ? OR up.description LIKE ?)`
      const searchPattern = `%${search.trim()}%`
      queryParams.push(searchPattern, searchPattern, searchPattern)
    }
    
    // 添加文件夹筛选条件
    if (folderId && folderId !== 'null' && folderId !== 'undefined') {
      query += ` AND up.folder_id = ?`
      countQuery += ` AND up.folder_id = ?`
      queryParams.push(parseInt(folderId))
    }
    
    query += ` ORDER BY up.created_at DESC LIMIT ${limit} OFFSET ${offset}`
    
    console.log('执行计数查询...')
    console.log('计数SQL:', countQuery)
    console.log('计数参数:', queryParams)
    const countResult = await db.query(countQuery, queryParams)
    const totalCount = (countResult.rows as Record<string, unknown>[])[0]?.total as number || 0
    console.log('计数结果:', totalCount)
    
    console.log('执行主查询...')
    console.log('主查询SQL:', query)
    const result = await db.query(query, queryParams)
    const prompts = result.rows || []
    console.log('查询结果数量:', Array.isArray(prompts) ? prompts.length : 0)
    
    // 处理数据格式并获取标签
    const processedPrompts = await Promise.all((prompts as Record<string, unknown>[]).map(async (prompt) => {
      // 获取提示词的标签
      const tagsResult = await db.getUserPromptTags(prompt.id as number)
      const tags = tagsResult.map(tag => ({ id: tag.id as number, name: tag.name as string }))
      
      return {
        id: prompt.id as number,
        title: prompt.title as string,
        content: prompt.content as string,
        description: prompt.description as string,
        folder_id: null, // 暂时设为null
        folder_ids: [],
        folder_names: [],
        category_id: prompt.category_id as number,
        created_at: prompt.created_at as string,
        updated_at: prompt.updated_at as string,
        username: prompt.username as string,
        avatar_url: prompt.avatar_url as string,
        tags: tags,
        category: null
      }
    }))
    
    const totalPages = Math.ceil(totalCount / limit)
    
    return NextResponse.json({
      success: true,
      data: {
        items: processedPrompts,
        totalPages,
        total: totalCount,
        page,
        limit
      }
    })
  } catch (error) {
    console.error('Get prompts error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch prompts', 
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

// POST - 创建新的用户提示词
export async function POST(request: NextRequest) {
  try {
    // 获取认证用户
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id

    const { title, content, description, folder_id, category_id, tags, mode, is_public } = await request.json()

    // 验证必需字段
    if (!title || !content) {
      return NextResponse.json(
        { success: false, error: 'Title and content are required' },
        { status: 400 }
      )
    }

    let newPrompt

    try {
      newPrompt = await db.createUserPrompt({
        title,
        content,
        description: description || null,
        user_id: userId,
        folder_id: folder_id ? parseInt(folder_id) : null,
        category_id: category_id ? parseInt(category_id) : null,
        mode: mode || 'normal',
        is_public: is_public || false
      })

      // 处理标签
      if (tags && Array.isArray(tags) && tags.length > 0) {
        try {
          const promptId = (newPrompt as DbRow).id as number
          await db.addUserPromptTags(promptId, tags)
        } catch (tagError) {
          console.error('Failed to add tags:', tagError)
          // 标签添加失败不影响提示词创建
        }
      }

      return NextResponse.json({
        success: true,
        data: newPrompt,
        message: 'Prompt created successfully'
      })
    } catch (dbError) {
      console.error('Database create failed:', dbError)
      return NextResponse.json(
        { success: false, error: 'Failed to create prompt in database' },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Create prompt error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create prompt',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

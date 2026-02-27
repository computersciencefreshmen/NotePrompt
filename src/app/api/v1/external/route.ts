import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '@/lib/auth'
import { db } from '@/lib/db'

// API密钥验证中间件
async function validateApiKey(request: NextRequest) {
  const apiKey = request.headers.get('X-API-Key') || 
                 request.headers.get('Authorization')?.replace('Bearer ', '')
  
  if (!apiKey) {
    return NextResponse.json(
      { error: '缺少API密钥', code: 'MISSING_API_KEY' },
      { status: 401 }
    )
  }

  const isValid = await verifyApiKey(apiKey)
  if (!isValid) {
    return NextResponse.json(
      { error: '无效的API密钥', code: 'INVALID_API_KEY' },
      { status: 401 }
    )
  }

  return null // 验证通过
}

// GET - 获取公共提示词列表
export async function GET(request: NextRequest) {
  // 验证API密钥
  const authError = await validateApiKey(request)
  if (authError) return authError

  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search') || ''
    const category = searchParams.get('category') || ''

    // 构建查询条件
    let whereClause = 'WHERE pp.is_public = 1'
    const params: any[] = []

    if (search) {
      whereClause += ' AND (pp.title LIKE ? OR pp.content LIKE ?)'
      params.push(`%${search}%`, `%${search}%`)
    }

    if (category) {
      whereClause += ' AND pp.category_id = ?'
      params.push(category)
    }

    // 获取总数
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM public_prompts pp ${whereClause}`,
      params
    )
    const total = (countResult as any)[0].total

    // 获取数据
    const offset = (page - 1) * limit
    const [rows] = await db.execute(
      `SELECT 
        pp.id,
        pp.title,
        pp.content,
        pp.description,
        pp.category_id,
        pp.created_at,
        pp.updated_at,
        u.username as author_name,
        c.name as category_name
      FROM public_prompts pp
      LEFT JOIN users u ON pp.user_id = u.id
      LEFT JOIN categories c ON pp.category_id = c.id
      ${whereClause}
      ORDER BY pp.created_at DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )

    return NextResponse.json({
      success: true,
      data: {
        prompts: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    })

  } catch (error) {
    console.error('外部API错误:', error)
    return NextResponse.json(
      { error: '服务器内部错误', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

// POST - 创建新的公共提示词
export async function POST(request: NextRequest) {
  // 验证API密钥
  const authError = await validateApiKey(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { title, content, description, category_id } = body

    // 验证必需字段
    if (!title || !content) {
      return NextResponse.json(
        { error: '标题和内容为必填字段', code: 'MISSING_REQUIRED_FIELDS' },
        { status: 400 }
      )
    }

    // 获取API密钥对应的用户ID
    const apiKey = request.headers.get('X-API-Key') || 
                   request.headers.get('Authorization')?.replace('Bearer ', '')
    const [userResult] = await db.execute(
      'SELECT user_id FROM api_keys WHERE api_key = ?',
      [apiKey]
    )
    const userId = (userResult as any)[0]?.user_id

    if (!userId) {
      return NextResponse.json(
        { error: '无效的API密钥', code: 'INVALID_API_KEY' },
        { status: 401 }
      )
    }

    // 插入新提示词
    const [result] = await db.execute(
      `INSERT INTO public_prompts (title, content, description, category_id, user_id, is_public, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [title, content, description || '', category_id || null, userId]
    )

    const promptId = (result as any).insertId

    // 获取创建的提示词
    const [promptResult] = await db.execute(
      `SELECT 
        pp.id,
        pp.title,
        pp.content,
        pp.description,
        pp.category_id,
        pp.created_at,
        pp.updated_at,
        u.username as author_name,
        c.name as category_name
      FROM public_prompts pp
      LEFT JOIN users u ON pp.user_id = u.id
      LEFT JOIN categories c ON pp.category_id = c.id
      WHERE pp.id = ?`,
      [promptId]
    )

    return NextResponse.json({
      success: true,
      data: (promptResult as any)[0],
      message: '提示词创建成功'
    })

  } catch (error) {
    console.error('创建提示词错误:', error)
    return NextResponse.json(
      { error: '服务器内部错误', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
} 
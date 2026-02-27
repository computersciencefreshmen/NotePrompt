import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 获取用户发布的公共文件夹列表
export async function GET(request: NextRequest) {
  try {
    console.log('开始获取用户发布的文件夹...')
    
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

    // 简化的查询
    const whereConditions = ['pf.user_id = ' + userId]
    let searchConditions = ''

    if (search) {
      searchConditions = ` AND (pf.name LIKE '%${search}%' OR pf.description LIKE '%${search}%')`
    }

    // 获取总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM public_folders pf
      WHERE ${whereConditions.join(' AND ')}${searchConditions}
    `
    console.log('计数查询:', countQuery)
    
    const countResult = await db.queryRaw(countQuery)
    const total = (countResult.rows as Record<string, unknown>[])[0]?.total as number || 0
    console.log('总数:', total)

    // 获取基本数据
    const dataQuery = `
      SELECT pf.id, pf.name, pf.description, pf.created_at, pf.updated_at,
             u.username as author
      FROM public_folders pf
      JOIN users u ON pf.user_id = u.id
      WHERE ${whereConditions.join(' AND ')}${searchConditions}
      ORDER BY pf.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
    console.log('数据查询:', dataQuery)
    
    const result = await db.queryRaw(dataQuery)
    const folders = result.rows || []
    console.log('原始数据:', folders)

    // 处理数据格式
    const processedFolders = (folders as Record<string, unknown>[]).map(folder => ({
      id: folder.id as number,
      name: folder.name as string,
      description: folder.description as string,
      author: folder.author as string,
      import_count: 0, // 暂时设为0
      is_featured: false, // 暂时设为false
      created_at: folder.created_at as string,
      updated_at: folder.updated_at as string
    }))

    const totalPages = Math.ceil(total / limit)
    console.log('处理后的数据:', processedFolders)

    return NextResponse.json({
      success: true,
      data: {
        items: processedFolders,
        total,
        page,
        limit,
        totalPages
      }
    })
  } catch (error) {
    console.error('Get user published folders error:', error)
    return NextResponse.json(
      { success: false, error: '获取发布的文件夹失败', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 
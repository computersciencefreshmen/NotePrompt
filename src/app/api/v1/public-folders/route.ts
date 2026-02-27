import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'

export async function GET(request: NextRequest) {
  try {
    console.log('开始处理公共文件夹列表请求...')
    
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const search = searchParams.get('search') || ''
    
    console.log('请求参数:', { page, limit, search })
    
    // 构建查询条件
    const whereConditions: string[] = []
    const queryParams: (string | number)[] = []
    
    if (search) {
      whereConditions.push('(pf.name LIKE ? OR pf.description LIKE ?)')
      const searchPattern = `%${search}%`
      queryParams.push(searchPattern, searchPattern)
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''
    
    // 分页计算
    const offset = (page - 1) * limit
    
    // 主查询 - 使用正确的字段名，并计算提示词数量
    const query = `
      SELECT pf.id, pf.name, pf.description, pf.user_id, pf.original_folder_id, pf.is_featured,
             pf.created_at, pf.updated_at, u.username as author,
             COALESCE(prompt_counts.count, 0) as prompt_count
      FROM public_folders pf
      JOIN users u ON pf.user_id = u.id
      LEFT JOIN (
        SELECT upf.folder_id, COUNT(*) as count
        FROM user_prompt_folders upf
        GROUP BY upf.folder_id
      ) prompt_counts ON prompt_counts.folder_id = pf.original_folder_id
      ${whereClause}
      ORDER BY pf.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
    
    // 计数查询
    const countQuery = `
      SELECT COUNT(DISTINCT pf.id) as total
      FROM public_folders pf
      JOIN users u ON pf.user_id = u.id
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
    
    // 处理数据，确保返回正确的字段
    const processedItems = (items as Array<{
      id: number;
      name: string;
      description: string;
      user_id: number;
      original_folder_id: number;
      is_featured: boolean;
      created_at: string;
      updated_at: string;
      author: string;
      prompt_count: number;
    }>).map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      user_id: item.user_id,
      original_folder_id: item.original_folder_id,
      is_featured: item.is_featured || false,
      created_at: item.created_at,
      updated_at: item.updated_at,
      author: item.author,
      prompt_count: item.prompt_count || 0
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
    console.error('获取公共文件夹失败:', error)
    console.error('错误详情:', {
      message: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    })
    return NextResponse.json(
      { 
        success: false, 
        error: '获取公共文件夹列表失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}
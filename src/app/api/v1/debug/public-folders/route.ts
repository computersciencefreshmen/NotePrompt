import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'

// GET - 调试公共文件夹API
export async function GET(request: NextRequest) {
  try {
    console.log('=== 调试公共文件夹API开始 ===')
    
    // 1. 测试基本数据库连接
    console.log('1. 测试数据库连接...')
    const testResult = await db.query('SELECT 1 as test')
    console.log('数据库连接测试结果:', testResult.rows)
    
    // 2. 检查public_folders表是否存在
    console.log('2. 检查public_folders表...')
    const tableResult = await db.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = 'public_folders'
    `)
    console.log('public_folders表检查结果:', tableResult.rows)
    
    // 3. 获取public_folders表的所有数据
    console.log('3. 获取public_folders表数据...')
    const foldersResult = await db.query('SELECT * FROM public_folders')
    console.log('public_folders表数据:', foldersResult.rows)
    
    // 4. 检查users表
    console.log('4. 检查users表...')
    const usersResult = await db.query('SELECT id, username FROM users LIMIT 5')
    console.log('users表数据:', usersResult.rows)
    
    // 5. 尝试简单查询
    console.log('5. 尝试简单查询...')
    let simpleQueryResult
    try {
      simpleQueryResult = await db.query(`
        SELECT pf.*, u.username as author
        FROM public_folders pf
        LEFT JOIN users u ON pf.user_id = u.id
        LIMIT 10
      `)
      console.log('简单查询结果:', simpleQueryResult.rows)
    } catch (error) {
      console.error('简单查询失败:', error)
      simpleQueryResult = { rows: [], error: error.message }
    }
    
    // 6. 尝试带参数的查询
    console.log('6. 尝试带参数的查询...')
    let paramQueryResult
    try {
      paramQueryResult = await db.query(`
        SELECT pf.*, u.username as author
        FROM public_folders pf
        LEFT JOIN users u ON pf.user_id = u.id
        ORDER BY pf.created_at DESC
        LIMIT ? OFFSET ?
      `, [10, 0])
      console.log('带参数查询结果:', paramQueryResult.rows)
    } catch (error) {
      console.error('带参数查询失败:', error)
      paramQueryResult = { rows: [], error: error.message }
    }
    
    console.log('=== 调试公共文件夹API结束 ===')
    
    return NextResponse.json({
      success: true,
      debug: {
        databaseConnection: testResult.rows,
        tableExists: tableResult.rows,
        foldersData: foldersResult.rows,
        usersData: usersResult.rows,
        simpleQuery: simpleQueryResult.rows || simpleQueryResult.error,
        paramQuery: paramQueryResult.rows || paramQueryResult.error
      }
    })
    
  } catch (error) {
    console.error('调试API错误:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: '调试失败', 
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
} 
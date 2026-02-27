import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'

// GET - 检查公共提示词数据状态
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    
    if (action === 'check') {
      // 检查所有公共提示词ID
      const result = await db.query('SELECT id, title FROM public_prompts ORDER BY id')
      const prompts = result.rows as any[]
      
      const validIds = prompts.map(p => p.id)
      const maxId = Math.max(...validIds)
      const minId = Math.min(...validIds)
      
      return NextResponse.json({
        success: true,
        data: {
          total: prompts.length,
          validIds,
          maxId,
          minId,
          missingIds: []
        }
      })
    }
    
    return NextResponse.json({
      success: false,
      error: '无效的操作'
    })
  } catch (error) {
    console.error('Debug public prompts error:', error)
    return NextResponse.json(
      { success: false, error: '调试失败' },
      { status: 500 }
    )
  }
} 
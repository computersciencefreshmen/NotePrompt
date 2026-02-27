import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'

export async function GET(request: NextRequest) {
  try {
    // 测试数据库连接
    const result = await db.query('SELECT 1 as test')

    return NextResponse.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      test_query: (result.rows as { test: number }[])[0]
    })

  } catch (error) {
    console.error('Health check failed:', error)

    return NextResponse.json({
      status: 'unhealthy',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Database connection failed'
    }, { status: 500 })
  }
}

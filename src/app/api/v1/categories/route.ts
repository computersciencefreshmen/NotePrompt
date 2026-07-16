import { NextResponse } from 'next/server'
import db from '@/lib/mysql-database'

export async function GET() {
  try {
    const result = await db.query(
      `SELECT id, name, description, color, icon, sort_order, is_active, created_at, updated_at
       FROM categories
       WHERE is_active = 1
       ORDER BY sort_order ASC, id ASC
       LIMIT 100`,
    )

    return NextResponse.json({
      success: true,
      data: result.rows,
    })
  } catch {
    return NextResponse.json(
      { success: false, error: '获取分类失败' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'

// GET - 获取所有标签
export async function GET(request: NextRequest) {
  try {
    const tags = await db.getTags()

    return NextResponse.json({
      success: true,
      data: tags
    })
  } catch (error) {
    console.error('Get tags error:', error)
    return NextResponse.json(
      { success: false, error: '获取标签失败' },
      { status: 500 }
    )
  }
}

// POST - 创建标签
export async function POST(request: NextRequest) {
  try {
    const { name, color } = await request.json()

    if (!name) {
      return NextResponse.json(
        { success: false, error: '标签名称不能为空' },
        { status: 400 }
      )
    }

    const tag = await db.createTag(name, color)

    return NextResponse.json({
      success: true,
      data: tag
    })
  } catch (error) {
    console.error('Create tag error:', error)
    return NextResponse.json(
      { success: false, error: '创建标签失败' },
      { status: 500 }
    )
  }
} 
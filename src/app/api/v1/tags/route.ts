import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'

const MAX_TAG_BODY_BYTES = 8 * 1024
const MAX_TAG_NAME_CHARS = 50
const MAX_TAG_LIST_ITEMS = 500

// GET - 获取所有标签
export async function GET(request: NextRequest) {
  try {
    const result = await db.query(
      'SELECT id, name, color, created_at FROM tags ORDER BY name ASC LIMIT ?',
      [MAX_TAG_LIST_ITEMS],
    )
    const tags = result.rows as Record<string, unknown>[]

    return NextResponse.json({
      success: true,
      data: tags
    })
  } catch (error) {
    console.error('Get tags error')
    return NextResponse.json(
      { success: false, error: '获取标签失败' },
      { status: 500 }
    )
  }
}

// POST - 创建标签
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const body = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_TAG_BODY_BYTES,
    )
    if (Object.keys(body).some(key => !['name', 'color'].includes(key))) {
      return NextResponse.json(
        { success: false, error: '请求包含不支持的字段' },
        { status: 400 },
      )
    }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const color = body.color === undefined ? '#6366f1' : body.color

    if (!name || name.length > MAX_TAG_NAME_CHARS) {
      return NextResponse.json(
        { success: false, error: `标签名称必须为 1-${MAX_TAG_NAME_CHARS} 个字符` },
        { status: 400 }
      )
    }
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return NextResponse.json(
        { success: false, error: '标签颜色必须是 #RRGGBB 格式' },
        { status: 400 },
      )
    }

    const insertResult = await db.query(
      'INSERT IGNORE INTO tags (name, color) VALUES (?, ?)',
      [name, color.toLowerCase()],
    )
    const tagResult = await db.query(
      'SELECT id, name, color, created_at FROM tags WHERE name = ? LIMIT 1',
      [name],
    )
    const tag = (tagResult.rows as Record<string, unknown>[])[0]
    if (!tag) throw new Error('Tag insert did not produce a readable row')
    const created = Number((insertResult.rows as { affectedRows?: number }).affectedRows) === 1

    return NextResponse.json({
      success: true,
      data: tag
    }, { status: created ? 201 : 200 })
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('Create tag error')
    return NextResponse.json(
      { success: false, error: '创建标签失败' },
      { status: 500 }
    )
  }
}

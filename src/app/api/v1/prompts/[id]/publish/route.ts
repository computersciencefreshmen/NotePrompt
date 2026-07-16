import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'

// POST - 发布用户提示词到公共库
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    
    const { id: idStr } = await params
    const id = parsePositiveResourceId(idStr)
    if (id == null) {
      return NextResponse.json(
        { success: false, error: '提示词不存在' },
        { status: 404 }
      )
    }

    const publishedPrompts = await db.publishOwnedUserPrompts(userId, [id])
    const publicPrompt = publishedPrompts?.[0]
    if (!publicPrompt) {
      return NextResponse.json(
        { success: false, error: '提示词不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: publicPrompt,
      message: '发布成功'
    })
  } catch (error) {
    console.error('Publish prompt error:', error)
    return NextResponse.json(
      { success: false, error: '发布提示词失败' },
      { status: 500 }
    )
  }
}

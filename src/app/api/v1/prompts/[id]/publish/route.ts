import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

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
    const id = parseInt(idStr)

    // 检查用户提示词是否存在
    const existingPrompt = await db.getUserPromptById(id)
    if (!existingPrompt) {
      return NextResponse.json(
        { success: false, error: '提示词不存在' },
        { status: 404 }
      )
    }

    // 检查权限 - 只能发布自己的提示词
    if (existingPrompt.user_id !== userId) {
      return NextResponse.json(
        { success: false, error: '没有权限发布此提示词' },
        { status: 403 }
      )
    }

    // 创建公共提示词
    const publicPrompt = await db.createPublicPrompt({
      title: existingPrompt.title as string,
      content: existingPrompt.content as string,
      description: existingPrompt.description as string | null,
      author_id: existingPrompt.user_id as number,
      category_id: existingPrompt.category_id as number | null
    })

    // 复制标签（如果有）
    try {
      const tags = await db.getUserPromptTags(id)
      if (tags && tags.length > 0) {
        const tagNames = tags.map(tag => (tag as Record<string, unknown>).name as string)
        await db.addPublicPromptTags((publicPrompt as Record<string, unknown>).id as number, tagNames)
      }
    } catch (tagError) {
      console.error('复制标签失败:', tagError)
      // 标签复制失败不影响发布
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
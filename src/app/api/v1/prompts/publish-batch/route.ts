import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'

// POST - 批量发布用户提示词到公共库
export async function POST(request: NextRequest) {
  try {
    const { prompt_ids } = await request.json()

    if (!Array.isArray(prompt_ids) || prompt_ids.length === 0) {
      return NextResponse.json(
        { success: false, error: '请提供有效的提示词ID列表' },
        { status: 400 }
      )
    }

    const publishedPrompts = []

    // 批量发布提示词
    for (const promptId of prompt_ids) {
      try {
        // 检查用户提示词是否存在
        const existingPrompt = await db.getUserPromptById(promptId)
        if (!existingPrompt) {
          console.warn(`提示词 ${promptId} 不存在，跳过`)
          continue
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
          const tags = await db.getUserPromptTags(promptId)
          if (tags && tags.length > 0) {
            const tagNames = tags.map(tag => (tag as any).name)
            await db.addPublicPromptTags((publicPrompt as any).id, tagNames)
          }
        } catch (tagError) {
          console.error(`复制标签失败 (提示词 ${promptId}):`, tagError)
          // 标签复制失败不影响发布
        }

        publishedPrompts.push(publicPrompt)
      } catch (error) {
        console.error(`发布提示词 ${promptId} 失败:`, error)
        // 继续处理其他提示词
      }
    }

    return NextResponse.json({
      success: true,
      data: publishedPrompts,
      message: `成功发布 ${publishedPrompts.length} 个提示词`
    })
  } catch (error) {
    console.error('Batch publish prompts error:', error)
    return NextResponse.json(
      { success: false, error: '批量发布提示词失败' },
      { status: 500 }
    )
  }
} 
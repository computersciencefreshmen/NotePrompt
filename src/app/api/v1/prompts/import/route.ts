import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import db from '@/lib/mysql-database'

// POST - 批量导入用户提示词
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const user_id = auth.user.id
    const body = await request.json()
    const { prompts }: { prompts: Array<{ id: number; title?: string }> } = body

    if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
      return NextResponse.json({
        success: false,
        error: '请选择要导入的提示词'
      }, { status: 400 })
    }

    // 获取用户的默认文件夹
    const folders = await db.getFoldersByUserId(user_id)
    const defaultFolder = folders[0]

    if (!defaultFolder) {
      return NextResponse.json({
        success: false,
        error: '用户没有文件夹，请先创建文件夹'
      }, { status: 400 })
    }

    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    for (const promptData of prompts) {
      try {
        // 从数据库查询公共提示词
        const publicPrompt = await db.getPublicPromptById(promptData.id)

        if (!publicPrompt) {
          errors.push(`提示词 "${promptData.title || promptData.id}" 不存在`)
          errorCount++
          continue
        }

        // 导入到用户提示词表
        await db.createUserPrompt({
          title: `[导入] ${publicPrompt.title}`,
          content: publicPrompt.content,
          description: publicPrompt.description,
          user_id: user_id,
          folder_id: defaultFolder.id,
          category_id: publicPrompt.category_id
        })

        // 复制标签
        try {
          const tags = await db.getPublicPromptTags(promptData.id)
          if (tags && tags.length > 0) {
            const importedPrompt = await db.getUserPromptsByUserId(user_id)
            const latestPrompt = importedPrompt[0]
            if (latestPrompt) {
              const tagNames = tags.map((tag: Record<string, unknown>) => tag.name as string)
              await db.addUserPromptTags(latestPrompt.id, tagNames)
            }
          }
        } catch (tagError) {
          console.error('复制标签失败:', tagError)
        }

        successCount++
      } catch (error) {
        console.error('导入提示词失败:', error)
        errors.push(`"${promptData.title || promptData.id}": ${error instanceof Error ? error.message : '未知错误'}`)
        errorCount++
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        imported: successCount,
        errors: errorCount,
        errorDetails: errors
      },
      message: `成功导入 ${successCount} 个提示词${errorCount > 0 ? `，${errorCount} 个失败` : ''}`
    })
  } catch (error) {
    console.error('批量导入提示词失败:', error)
    return NextResponse.json(
      { success: false, error: '导入失败' },
      { status: 500 }
    )
  }
}

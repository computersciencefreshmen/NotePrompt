import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import db from '@/lib/mysql-database'

// POST - 导入单个提示词到用户库
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const user_id = auth.user.id
    const { id } = params
    const promptId = parseInt(id)

    if (isNaN(promptId)) {
      return NextResponse.json({
        success: false,
        error: '无效的提示词ID'
      }, { status: 400 })
    }

    const body = await request.json()
    const { folder_id } = body

    // 获取用户的默认文件夹
    let targetFolderId = folder_id
    if (!targetFolderId) {
      const folders = await db.getFoldersByUserId(user_id)
      const defaultFolder = folders[0]

      if (!defaultFolder) {
        return NextResponse.json({
          success: false,
          error: '用户没有文件夹，请先创建文件夹'
        }, { status: 400 })
      }
      targetFolderId = defaultFolder.id
    }

    // 检查是否是公共提示词
    const publicPrompt = await db.getPublicPromptById(promptId)
    if (publicPrompt) {
      // 导入公共提示词
      const newPrompt = await db.createUserPrompt({
        title: `[导入] ${publicPrompt.title}`,
        content: publicPrompt.content,
        description: publicPrompt.description,
        user_id: user_id,
        folder_id: targetFolderId,
        category_id: publicPrompt.category_id
      })

      // 复制标签
      try {
        const tags = await db.getPublicPromptTags(promptId)
        if (tags && tags.length > 0) {
          const tagNames = tags.map((tag: Record<string, unknown>) => tag.name as string)
          await db.addUserPromptTags(newPrompt.id, tagNames)
        }
      } catch (tagError) {
        console.error('复制标签失败:', tagError)
      }

      return NextResponse.json({
        success: true,
        data: newPrompt,
        message: '导入成功'
      })
    }

    // 检查是否是其他用户的提示词
    const otherPrompt = await db.getUserPromptById(promptId)
    if (otherPrompt && otherPrompt.user_id !== user_id) {
      // 导入其他用户的提示词
      const newPrompt = await db.createUserPrompt({
        title: `[导入] ${otherPrompt.title}`,
        content: otherPrompt.content,
        description: otherPrompt.description,
        user_id: user_id,
        folder_id: targetFolderId,
        category_id: otherPrompt.category_id
      })

      // 复制标签
      try {
        const tags = await db.getUserPromptTags(promptId)
        if (tags && tags.length > 0) {
          const tagNames = tags.map((tag: Record<string, unknown>) => tag.name as string)
          await db.addUserPromptTags(newPrompt.id, tagNames)
        }
      } catch (tagError) {
        console.error('复制标签失败:', tagError)
      }

      return NextResponse.json({
        success: true,
        data: newPrompt,
        message: '导入成功'
      })
    }

    return NextResponse.json({
      success: false,
      error: '提示词不存在或无法导入'
    }, { status: 404 })
  } catch (error) {
    console.error('导入提示词失败:', error)
    return NextResponse.json(
      { success: false, error: '导入失败' },
      { status: 500 }
    )
  }
}

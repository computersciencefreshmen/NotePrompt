import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// POST - 导入公共提示词到用户提示词
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
    const { id: idStr } = await params
    const id = parseInt(idStr)
    
    // 从数据库查询公共提示词
    const publicPrompt = await db.getPublicPromptById(id)

    if (!publicPrompt) {
      console.log(`公共提示词不存在 - ID: ${id}`)
      return NextResponse.json(
        { success: false, error: '公共提示词不存在或已被删除' },
        { status: 404 }
      )
    }
    
    // 获取用户的文件夹
    const folders = await db.getFoldersByUserId(user_id)
    const defaultFolder = folders[0] // 使用第一个文件夹作为默认文件夹
    
    if (!defaultFolder) {
      return NextResponse.json(
        { success: false, error: '用户没有文件夹，请先创建文件夹' },
        { status: 400 }
      )
    }
    
    // 导入到用户提示词表
    const importedPrompt = await db.createUserPrompt({
      title: `[导入] ${publicPrompt.title as string}`,
      content: publicPrompt.content as string,
      description: publicPrompt.description as string | null,
      user_id: user_id,
      folder_id: defaultFolder.id as number,
      category_id: publicPrompt.category_id as number | null
    })

    // 复制标签（如果有）
    try {
      const tags = await db.getPublicPromptTags(id)
      if (tags && tags.length > 0) {
        const tagNames = tags.map(tag => (tag as Record<string, unknown>).name as string)
        const promptId = (importedPrompt as any)?.id
        if (promptId) {
          await db.addUserPromptTags(promptId, tagNames)
        }
      }
    } catch (tagError) {
      console.error('复制标签失败:', tagError)
      // 标签复制失败不影响导入
    }

    // 导入成功后，前端应调用fetchPrompts({ page: 1 })刷新列表
    return NextResponse.json({
      success: true,
      data: importedPrompt,
      message: '导入成功'
    })
  } catch (error) {
    console.error('导入提示词失败:', error)
    return NextResponse.json(
      { success: false, error: '导入失败' },
      { status: 500 }
    )
  }
}

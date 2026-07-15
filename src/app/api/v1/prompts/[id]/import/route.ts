import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import db from '@/lib/mysql-database'
import { ensureCuratedPublicPromptPersisted, getCuratedPublicPromptById } from '@/lib/curated-public-prompts'
import { findOwnedResource, parsePositiveResourceId } from '@/lib/resource-authorization'

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
    const { id } = await params
    const promptId = parsePositiveResourceId(id)

    if (promptId == null) {
      return NextResponse.json({
        success: false,
        error: '提示词不存在或无法导入'
      }, { status: 404 })
    }

    const body = await request.json()
    const { folder_id } = body

    const curatedPrompt = getCuratedPublicPromptById(promptId)
    if (curatedPrompt) {
      await ensureCuratedPublicPromptPersisted(curatedPrompt)
    }

    // 获取用户的默认文件夹
    let targetFolderId: number
    if (folder_id == null || folder_id === '') {
      const folders = await db.getFoldersByUserId(user_id)
      const defaultFolder = folders[0] as Record<string, unknown> | undefined

      if (!defaultFolder) {
        return NextResponse.json({
          success: false,
          error: '用户没有文件夹，请先创建文件夹'
        }, { status: 400 })
      }
      targetFolderId = Number(defaultFolder.id)
    } else {
      const parsedFolderId = parsePositiveResourceId(folder_id)
      if (parsedFolderId == null) {
        return NextResponse.json({
          success: false,
          error: '无效的文件夹ID'
        }, { status: 400 })
      }

      const targetFolder = await findOwnedResource(
        resourceId => db.getFolderById(resourceId),
        parsedFolderId,
        user_id
      )
      if (!targetFolder) {
        return NextResponse.json({
          success: false,
          error: '文件夹不存在'
        }, { status: 404 })
      }
      targetFolderId = parsedFolderId
    }

    // 只允许导入明确的公共提示词，或当前用户自己的私有提示词。
    const publicPrompt = await db.getPublicPromptById(promptId)
    const sourcePrompt = publicPrompt || await findOwnedResource(
      resourceId => db.getUserPromptById(resourceId),
      promptId,
      user_id
    )

    if (!sourcePrompt) {
      return NextResponse.json({
        success: false,
        error: '提示词不存在或无法导入'
      }, { status: 404 })
    }

    const newPrompt = await db.createUserPrompt({
      title: `[导入] ${String(sourcePrompt.title || '')}`,
      content: String(sourcePrompt.content || ''),
      description: sourcePrompt.description ? String(sourcePrompt.description) : null,
      user_id,
      folder_id: targetFolderId,
      category_id: sourcePrompt.category_id == null ? null : Number(sourcePrompt.category_id)
    })

    try {
      const tags = publicPrompt
        ? await db.getPublicPromptTags(promptId)
        : await db.getUserPromptTags(promptId)
      if (tags.length > 0) {
        const tagNames = tags.map((tag: Record<string, unknown>) => String(tag.name || ''))
          .filter(Boolean)
        if (tagNames.length > 0) {
          await db.addUserPromptTags(Number(newPrompt.id), tagNames)
        }
      }
    } catch (tagError) {
      console.error('复制标签失败:', tagError)
    }

    return NextResponse.json({
      success: true,
      data: newPrompt,
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

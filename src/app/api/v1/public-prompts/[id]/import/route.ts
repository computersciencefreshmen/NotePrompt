import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import {
  getCuratedPublicPromptById,
  resolvePublicPromptSource,
} from '@/lib/curated-public-prompts'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { entitlementLimitResponse } from '@/lib/entitlement-http'

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
    const id = parsePositiveResourceId(idStr)
    if (id == null) {
      return NextResponse.json({ success: false, error: '无效的提示词ID' }, { status: 400 })
    }
    const source = resolvePublicPromptSource(
      id,
      new URL(request.url).searchParams.get('source'),
    )
    if (!source) {
      return NextResponse.json(
        { success: false, error: '无效的提示词来源' },
        { status: 400 },
      )
    }

    const curatedPrompt = source === 'curated' ? getCuratedPublicPromptById(id) : null
    const publicPrompt = source === 'published' ? await db.getPublicPromptById(id) : null
    const sourcePrompt = curatedPrompt || publicPrompt

    if (!sourcePrompt) {
      return NextResponse.json(
        { success: false, error: '公共提示词不存在或已被删除' },
        { status: 404 }
      )
    }
    
    // 获取用户的文件夹
    const folders = await db.getFoldersByUserId(user_id)
    const defaultFolder = folders[0] as Record<string, unknown> | undefined // 使用第一个文件夹作为默认文件夹
    
    if (!defaultFolder) {
      return NextResponse.json(
        { success: false, error: '用户没有文件夹，请先创建文件夹' },
        { status: 400 }
      )
    }
    
    // 导入到用户提示词表
    const importedPrompt = await db.createUserPrompt({
      title: `[导入] ${String(sourcePrompt.title || '')}`.slice(0, 200),
      content: String(sourcePrompt.content || ''),
      description: sourcePrompt.description == null ? null : String(sourcePrompt.description),
      user_id: user_id,
      folder_id: Number(defaultFolder.id),
      category_id: 'category_id' in sourcePrompt && sourcePrompt.category_id != null
        ? Number(sourcePrompt.category_id)
        : null,
    })

    // 复制标签（如果有）
    try {
      const tagNames = curatedPrompt
        ? curatedPrompt.tags
        : (await db.getPublicPromptTags(id))
          .map((tag) => (tag as Record<string, unknown>).name)
          .filter((name): name is string => typeof name === 'string')
      if (tagNames.length > 0) {
        const promptId = parsePositiveResourceId((importedPrompt as Record<string, unknown> | null)?.id)
        if (promptId != null && tagNames.length > 0) {
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
    const limitResponse = entitlementLimitResponse(error)
    if (limitResponse) return limitResponse
    console.error('导入提示词失败:', error)
    return NextResponse.json(
      { success: false, error: '导入失败' },
      { status: 500 }
    )
  }
}

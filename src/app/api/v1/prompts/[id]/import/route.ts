import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import db from '@/lib/mysql-database'
import {
  getCuratedPublicPromptById,
  resolvePublicPromptSource,
} from '@/lib/curated-public-prompts'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import { entitlementLimitResponse } from '@/lib/entitlement-http'

const MAX_PROMPT_IMPORT_BODY_BYTES = 8 * 1024

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

    const body = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_PROMPT_IMPORT_BODY_BYTES,
    )
    if (Object.keys(body).some(key => !['folder_id', 'source'].includes(key))) {
      return NextResponse.json(
        { success: false, error: '请求包含不支持的字段' },
        { status: 400 },
      )
    }
    const folder_id = body.folder_id
    const requestedSource = body.source == null
      ? null
      : typeof body.source === 'string'
        ? body.source
        : 'invalid'
    const source = resolvePublicPromptSource(promptId, requestedSource)
    if (!source) {
      return NextResponse.json(
        { success: false, error: '无效的提示词来源' },
        { status: 400 },
      )
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
      const parsedDefaultFolderId = parsePositiveResourceId(defaultFolder.id)
      if (parsedDefaultFolderId == null) {
        return NextResponse.json({
          success: false,
          error: '默认文件夹数据无效'
        }, { status: 500 })
      }
      targetFolderId = parsedDefaultFolderId
    } else {
      const parsedFolderId = parsePositiveResourceId(folder_id)
      if (parsedFolderId == null) {
        return NextResponse.json({
          success: false,
          error: '无效的文件夹ID'
        }, { status: 400 })
      }

      const targetFolder = await db.getOwnedFolderById(parsedFolderId, user_id)
      if (!targetFolder) {
        return NextResponse.json({
          success: false,
          error: '文件夹不存在'
        }, { status: 404 })
      }
      targetFolderId = parsedFolderId
    }

    // Curated content is imported directly from the immutable catalog. It never receives a
    // surrogate row in public_prompts, so its stable catalog ID cannot advance AUTO_INCREMENT.
    const curatedPrompt = source === 'curated'
      ? getCuratedPublicPromptById(promptId)
      : null
    const publicPrompt = source === 'published'
      ? await db.getPublicPromptById(promptId)
      : null
    const privatePrompt = !curatedPrompt && !publicPrompt && requestedSource == null
      ? await db.getOwnedUserPromptById(promptId, user_id)
      : null
    const sourcePrompt = curatedPrompt || publicPrompt || privatePrompt

    if (!sourcePrompt) {
      return NextResponse.json({
        success: false,
        error: '提示词不存在或无法导入'
      }, { status: 404 })
    }

    const newPrompt = await db.createUserPrompt({
      title: `[导入] ${String(sourcePrompt.title || '')}`.slice(0, 200),
      content: String(sourcePrompt.content || ''),
      description: sourcePrompt.description ? String(sourcePrompt.description) : null,
      user_id,
      folder_id: targetFolderId,
      category_id: 'category_id' in sourcePrompt && sourcePrompt.category_id != null
        ? Number(sourcePrompt.category_id)
        : null,
    })

    try {
      const tagNames = curatedPrompt
        ? curatedPrompt.tags
        : (publicPrompt
            ? await db.getPublicPromptTags(promptId)
            : await db.getUserPromptTags(promptId))
          .map((tag: Record<string, unknown>) => String(tag.name || ''))
          .filter(Boolean)
      if (tagNames.length > 0) {
        await db.addUserPromptTags(Number(newPrompt.id), tagNames)
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
    const limitResponse = entitlementLimitResponse(error)
    if (limitResponse) return limitResponse
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('导入提示词失败:', error)
    return NextResponse.json(
      { success: false, error: '导入失败' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import { entitlementLimitResponse } from '@/lib/entitlement-http'
import {
  getCuratedPublicPromptById,
  resolvePublicPromptSource,
  type PublicPromptSource,
} from '@/lib/curated-public-prompts'
import db from '@/lib/mysql-database'
import { parsePositiveResourceId } from '@/lib/resource-authorization'

const MAX_BATCH_IMPORT_BODY_BYTES = 64 * 1024
const MAX_BATCH_IMPORT_ITEMS = 100

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  try {
    const body = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_BATCH_IMPORT_BODY_BYTES,
    )
    if (!Array.isArray(body.prompts) || body.prompts.length === 0) {
      return NextResponse.json(
        { success: false, error: '请选择要导入的提示词' },
        { status: 400 },
      )
    }
    if (body.prompts.length > MAX_BATCH_IMPORT_ITEMS) {
      return NextResponse.json(
        { success: false, error: `单次最多导入 ${MAX_BATCH_IMPORT_ITEMS} 个提示词` },
        { status: 400 },
      )
    }

    const promptReferences: Array<{ id: number; source: PublicPromptSource }> = []
    const seenReferences = new Set<string>()
    let hasInvalidReference = false
    for (const item of body.prompts) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        hasInvalidReference = true
        break
      }
      const input = item as Record<string, unknown>
      const id = parsePositiveResourceId(input.id)
      const requestedSource = input.source == null
        ? null
        : typeof input.source === 'string'
          ? input.source
          : 'invalid'
      const source = id == null ? null : resolvePublicPromptSource(id, requestedSource)
      if (id == null || !source) {
        hasInvalidReference = true
        break
      }
      const key = `${source}:${id}`
      if (seenReferences.has(key)) {
        hasInvalidReference = true
        break
      }
      seenReferences.add(key)
      promptReferences.push({ id, source })
    }
    if (hasInvalidReference || promptReferences.length !== body.prompts.length) {
      return NextResponse.json(
        { success: false, error: '提示词列表包含无效或重复资源引用' },
        { status: 400 },
      )
    }

    const folders = await db.getFoldersByUserId(auth.user.id)
    const defaultFolderId = parsePositiveResourceId((folders[0] as Record<string, unknown> | undefined)?.id)
    if (defaultFolderId == null) {
      return NextResponse.json(
        { success: false, error: '用户没有文件夹，请先创建文件夹' },
        { status: 400 },
      )
    }

    let successCount = 0
    const failures: Array<{
      id: number
      source: PublicPromptSource
      reason: 'NOT_FOUND' | 'IMPORT_FAILED' | 'QUOTA_EXCEEDED'
    }> = []

    for (const reference of promptReferences) {
      const { id: promptId, source } = reference
      try {
        const curatedPrompt = source === 'curated'
          ? getCuratedPublicPromptById(promptId)
          : null
        const publicPrompt = source === 'published'
          ? await db.getPublicPromptById(promptId)
          : null
        const sourcePrompt = curatedPrompt || publicPrompt
        if (!sourcePrompt) {
          failures.push({ id: promptId, source, reason: 'NOT_FOUND' })
          continue
        }

        const importedPrompt = await db.createUserPrompt({
          title: `[导入] ${String(sourcePrompt.title || '')}`.slice(0, 200),
          content: String(sourcePrompt.content || ''),
          description: sourcePrompt.description == null ? null : String(sourcePrompt.description),
          user_id: auth.user.id,
          folder_id: defaultFolderId,
          category_id: 'category_id' in sourcePrompt && sourcePrompt.category_id != null
            ? Number(sourcePrompt.category_id)
            : null,
          mode: 'normal',
        })
        const importedPromptId = parsePositiveResourceId(
          (importedPrompt as Record<string, unknown> | null)?.id,
        )
        if (importedPromptId == null) throw new Error('Imported prompt has no valid ID')

        const tagNames = curatedPrompt?.tags || (await db.getPublicPromptTags(promptId))
          .map((tag) => (tag as Record<string, unknown>).name)
          .filter((name): name is string => typeof name === 'string')
        if (tagNames.length > 0) await db.addUserPromptTags(importedPromptId, tagNames)
        successCount += 1
      } catch (error) {
        const limitResponse = entitlementLimitResponse(error)
        if (limitResponse) {
          failures.push({ id: promptId, source, reason: 'QUOTA_EXCEEDED' })
          if (successCount === 0) return limitResponse
          break
        }
        console.error(`Import ${source} prompt ${promptId} failed:`, error)
        failures.push({ id: promptId, source, reason: 'IMPORT_FAILED' })
      }
    }

    return NextResponse.json({
      success: successCount > 0,
      data: {
        imported: successCount,
        errors: failures.length,
        errorDetails: failures,
        partial: successCount > 0 && failures.length > 0,
      },
      message: `成功导入 ${successCount} 个提示词${failures.length > 0 ? `，${failures.length} 个失败` : ''}`,
    }, { status: failures.length > 0 && successCount === 0 ? 422 : 200 })
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('Batch import prompts error:', error)
    return NextResponse.json(
      { success: false, error: '导入失败' },
      { status: 500 },
    )
  }
}

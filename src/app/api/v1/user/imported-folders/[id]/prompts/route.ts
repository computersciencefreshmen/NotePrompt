import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import type { PublicFolderSnapshotPrompt } from '@/types'

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((tag): tag is string => typeof tag === 'string')
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : []
  } catch {
    return []
  }
}


function toImportedSnapshotPrompt(prompt: Record<string, unknown>): PublicFolderSnapshotPrompt {
  const snapshotId = parsePositiveResourceId(prompt.snapshot_id)
  if (snapshotId == null) {
    throw new Error('Imported folder snapshot identifier is invalid')
  }

  return {
    snapshot_id: snapshotId,
    title: String(prompt.title ?? ''),
    content: String(prompt.content ?? ''),
    content_is_truncated: Boolean(prompt.content_is_truncated),
    description: typeof prompt.description === 'string' ? prompt.description : null,
    author_id: Number(prompt.user_id),
    author: String(prompt.username ?? ''),
    avatar_url: typeof prompt.avatar_url === 'string' ? prompt.avatar_url : null,
    category_id: prompt.category_id == null ? null : Number(prompt.category_id),
    category: typeof prompt.category_name === 'string' ? prompt.category_name : null,
    category_color: typeof prompt.category_color === 'string' ? prompt.category_color : null,
    editor_mode: prompt.editor_mode === 'professional' ? 'professional' : 'normal',
    payload: prompt.payload as PublicFolderSnapshotPrompt['payload'],
    schema_version: Number(prompt.schema_version) || 1,
    tags: normalizeTags(prompt.tags),
    views_count: 0,
    favorites_count: 0,
    is_featured: false,
    created_at: String(prompt.created_at ?? ''),
    updated_at: String(prompt.updated_at ?? ''),
  }
}
export async function GET(
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
    const importedFolderId = parsePositiveResourceId(idStr)
    if (importedFolderId == null) {
      return NextResponse.json({ success: false, error: '无效的导入文件夹ID' }, { status: 400 })
    }

    // 检查导入文件夹是否属于当前用户
    const importedFolder = await db.getImportedFolderById(importedFolderId, userId)
    if (!importedFolder) {
      return NextResponse.json(
        { success: false, error: '导入文件夹不存在或无权限访问' },
        { status: 404 }
      )
    }

    const prompts = await db.getImportedFolderPrompts(importedFolderId, userId)

    // 转换数据格式，确保作者和收藏数信息正确
    const formattedPrompts = prompts.map(prompt => toImportedSnapshotPrompt(prompt))

    return NextResponse.json({
      success: true,
      data: formattedPrompts
    })
  } catch (error) {
    console.error('获取导入文件夹提示词失败:', error)
    return NextResponse.json(
      { success: false, error: '获取提示词失败' },
      { status: 500 }
    )
  }
}

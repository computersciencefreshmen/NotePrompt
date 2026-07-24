import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAdminAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import { createPaginationMetadata, parseBoundedPagination } from '@/lib/pagination-policy'
import { FOLDER_PROMPT_PAGE_SIZE, MAX_FOLDER_PROMPT_PAGE_SIZE } from '@/lib/prompt-list-policy'
import type { AdminFolderSnapshotPrompt } from '@/types'

const MAX_ADMIN_SNAPSHOT_BODY_BYTES = 8 * 1024

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

function toAdminFolderSnapshotPrompt(prompt: Record<string, unknown>): AdminFolderSnapshotPrompt {
  const snapshotId = parsePositiveResourceId(prompt.snapshot_id)
  if (snapshotId == null) {
    throw new Error('Admin folder snapshot identifier is invalid')
  }

  return {
    snapshot_id: snapshotId,
    title: String(prompt.title ?? ''),
    content: String(prompt.content ?? ''),
    content_is_truncated: Boolean(prompt.content_is_truncated),
    description: typeof prompt.description === 'string' ? prompt.description : null,
    author_id: Number(prompt.author_id),
    author: String(prompt.author ?? ''),
    avatar_url: typeof prompt.avatar_url === 'string' ? prompt.avatar_url : null,
    category_id: prompt.category_id == null ? null : Number(prompt.category_id),
    category: typeof prompt.category === 'string' ? prompt.category : null,
    category_color: typeof prompt.category_color === 'string' ? prompt.category_color : null,
    editor_mode: prompt.editor_mode === 'professional' ? 'professional' : 'normal',
    payload: prompt.payload as AdminFolderSnapshotPrompt['payload'],
    schema_version: Number(prompt.schema_version) || 1,
    tags: normalizeTags(prompt.tags),
    views_count: Number(prompt.views_count) || 0,
    favorites_count: Number(prompt.favorites_count) || 0,
    is_featured: Boolean(prompt.is_featured),
    created_at: String(prompt.created_at ?? ''),
    updated_at: String(prompt.updated_at ?? ''),
  }
}

// GET - read the independently materialized publication snapshot.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { id: idValue } = await params
    const folderId = parsePositiveResourceId(idValue)
    if (folderId == null) {
      return NextResponse.json({ success: false, error: '无效的公共文件夹ID' }, { status: 400 })
    }
    const paginationResult = parseBoundedPagination(new URL(request.url).searchParams, {
      defaultLimit: FOLDER_PROMPT_PAGE_SIZE,
      maxLimit: MAX_FOLDER_PROMPT_PAGE_SIZE,
    })
    if (!paginationResult.ok) {
      return NextResponse.json({ success: false, error: paginationResult.error }, { status: 400 })
    }

    const folder = await db.getPublicFolderById(folderId)
    if (!folder) {
      return NextResponse.json({ success: false, error: '公共文件夹不存在' }, { status: 404 })
    }
    const result = await db.getPublicFolderPrompts(folderId, paginationResult.value)
    const prompts = result.items.map(prompt => toAdminFolderSnapshotPrompt(prompt))
    const pagination = createPaginationMetadata(result.total, paginationResult.value)

    return NextResponse.json({
      success: true,
      data: {
        folder: {
          id: folder.id,
          name: folder.name,
          description: folder.description,
          user_id: folder.user_id,
          author: folder.author,
          is_featured: Boolean(folder.is_featured),
          prompt_count: pagination.total,
          created_at: folder.created_at,
          updated_at: folder.updated_at,
        },
        prompts,
      },
      pagination,
    })
  } catch (error) {
    console.error('Get admin folder snapshot error:', error)
    return NextResponse.json(
      { success: false, error: '获取文件夹提示词失败' },
      { status: 500 }
    )
  }
}

// POST - copy an already-published prompt into the folder snapshot.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { id: idValue } = await params
    const folderId = parsePositiveResourceId(idValue)
    const body = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_ADMIN_SNAPSHOT_BODY_BYTES,
    )
    if (Object.keys(body).some(key => key !== 'publicPromptId')) {
      return NextResponse.json({ success: false, error: '请求包含不支持的字段' }, { status: 400 })
    }
    const publicPromptId = parsePositiveResourceId(body.publicPromptId)
    if (folderId == null || publicPromptId == null) {
      return NextResponse.json(
        { success: false, error: '公共文件夹ID或已发布提示词ID无效' },
        { status: 400 }
      )
    }

    const result = await db.addPublishedPromptToPublicFolderSnapshot(folderId, publicPromptId)
    if (result.status === 'folder_not_found') {
      return NextResponse.json({ success: false, error: '公共文件夹不存在' }, { status: 404 })
    }
    if (result.status === 'publication_not_found') {
      return NextResponse.json({ success: false, error: '已发布提示词不存在' }, { status: 404 })
    }
    if (result.status === 'already_exists') {
      return NextResponse.json(
        { success: false, error: '该已发布提示词已在发布快照中' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { success: true, data: toAdminFolderSnapshotPrompt(result.prompt), message: '已发布提示词已添加到发布快照' },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('Add prompt to folder snapshot error:', error)
    return NextResponse.json(
      { success: false, error: '添加提示词失败' },
      { status: 500 }
    )
  }
}

// DELETE - promptId is the immutable snapshot row id returned by GET.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { id: idValue } = await params
    const folderId = parsePositiveResourceId(idValue)
    const searchParams = new URL(request.url).searchParams
    const snapshotIdValue = searchParams.get('snapshotId')
    const legacyPromptIdValue = searchParams.get('promptId')
    const canonicalSnapshotId = snapshotIdValue == null ? null : parsePositiveResourceId(snapshotIdValue)
    const legacySnapshotId = legacyPromptIdValue == null ? null : parsePositiveResourceId(legacyPromptIdValue)
    const hasInvalidId = (snapshotIdValue != null && canonicalSnapshotId == null)
      || (legacyPromptIdValue != null && legacySnapshotId == null)
    const hasConflictingIds = canonicalSnapshotId != null && legacySnapshotId != null
      && canonicalSnapshotId !== legacySnapshotId
    const snapshotId = canonicalSnapshotId ?? legacySnapshotId
    if (folderId == null || snapshotId == null || hasInvalidId || hasConflictingIds) {
      return NextResponse.json(
        { success: false, error: '公共文件夹ID或快照提示词ID无效' },
        { status: 400 }
      )
    }

    const result = await db.removePublicFolderSnapshotPrompt(folderId, snapshotId)
    if (result === 'folder_not_found') {
      return NextResponse.json({ success: false, error: '公共文件夹不存在' }, { status: 404 })
    }
    if (result === 'prompt_not_found') {
      return NextResponse.json({ success: false, error: '快照提示词不存在' }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: '提示词已从发布快照移除' })
  } catch (error) {
    console.error('Remove prompt from folder snapshot error:', error)
    return NextResponse.json(
      { success: false, error: '移除提示词失败' },
      { status: 500 }
    )
  }
}

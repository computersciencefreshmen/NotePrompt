import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAdminAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import { createPaginationMetadata, parseBoundedPagination } from '@/lib/pagination-policy'
import { FOLDER_PROMPT_PAGE_SIZE, MAX_FOLDER_PROMPT_PAGE_SIZE } from '@/lib/prompt-list-policy'

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
    const prompts = result.items.map(prompt => ({
      ...prompt,
      tags: normalizeTags(prompt.tags),
    }))
    const pagination = createPaginationMetadata(result.total, paginationResult.value)

    return NextResponse.json({
      success: true,
      data: {
        folder: {
          ...folder,
          is_featured: Boolean(folder.is_featured),
          prompt_count: pagination.total,
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

// POST - copy a private prompt into the publication; never mutate its private membership.
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
    if (Object.keys(body).some(key => key !== 'promptId')) {
      return NextResponse.json({ success: false, error: '请求包含不支持的字段' }, { status: 400 })
    }
    const promptId = parsePositiveResourceId(body.promptId)
    if (folderId == null || promptId == null) {
      return NextResponse.json(
        { success: false, error: '公共文件夹ID或提示词ID无效' },
        { status: 400 }
      )
    }

    const result = await db.addPublicFolderSnapshotPrompt(folderId, promptId)
    if (result.status === 'folder_not_found') {
      return NextResponse.json({ success: false, error: '公共文件夹不存在' }, { status: 404 })
    }
    if (result.status === 'prompt_not_found') {
      return NextResponse.json({ success: false, error: '提示词不存在' }, { status: 404 })
    }
    if (result.status === 'already_exists') {
      return NextResponse.json(
        { success: false, error: '提示词已在该发布快照中' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { success: true, data: result.prompt, message: '提示词已添加到发布快照' },
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
    const snapshotId = parsePositiveResourceId(new URL(request.url).searchParams.get('promptId'))
    if (folderId == null || snapshotId == null) {
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

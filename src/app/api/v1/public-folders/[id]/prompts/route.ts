import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { getEnglishFeaturedFolderPrompts } from '@/data/english-featured-folders'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { createPaginationMetadata, parseBoundedPagination } from '@/lib/pagination-policy'
import { FOLDER_PROMPT_PAGE_SIZE, MAX_FOLDER_PROMPT_PAGE_SIZE } from '@/lib/prompt-list-policy'
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


function toPublicFolderSnapshotPrompt(prompt: Record<string, unknown>): PublicFolderSnapshotPrompt {
  const snapshotId = Number(prompt.snapshot_id)
  if (!Number.isSafeInteger(snapshotId) || snapshotId <= 0) {
    throw new Error('Public folder snapshot identifier is invalid')
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
    payload: prompt.payload as PublicFolderSnapshotPrompt['payload'],
    schema_version: Number(prompt.schema_version) || 1,
    tags: normalizeTags(prompt.tags),
    views_count: Number(prompt.views_count) || 0,
    favorites_count: Number(prompt.favorites_count) || 0,
    is_featured: Boolean(prompt.is_featured),
    created_at: String(prompt.created_at ?? ''),
    updated_at: String(prompt.updated_at ?? ''),
  }
}
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const id = parsePositiveResourceId(idStr)
    const { searchParams } = new URL(request.url)
    const lang = searchParams.get('lang') || 'zh'
    if (lang !== 'zh' && lang !== 'en') {
      return NextResponse.json(
        { success: false, error: 'lang must be zh or en' },
        { status: 400 },
      )
    }
    const paginationResult = parseBoundedPagination(searchParams, {
      defaultLimit: FOLDER_PROMPT_PAGE_SIZE,
      maxLimit: MAX_FOLDER_PROMPT_PAGE_SIZE,
    })
    if (!paginationResult.ok) {
      return NextResponse.json({ success: false, error: paginationResult.error }, { status: 400 })
    }
    const { offset, limit } = paginationResult.value

    if (id == null) {
      return NextResponse.json(
        { success: false, error: lang === 'en' ? 'Invalid folder ID' : '无效的文件夹ID' },
        { status: 400 }
      )
    }

    if (lang === 'en') {
      const prompts = getEnglishFeaturedFolderPrompts(id)
      if (!prompts) {
        return NextResponse.json(
          { success: false, error: 'Folder not found' },
          { status: 404 }
        )
      }

      const snapshotPrompts = prompts.map(prompt => toPublicFolderSnapshotPrompt({ ...prompt, snapshot_id: prompt.id }))
      const pagination = createPaginationMetadata(snapshotPrompts.length, paginationResult.value)
      return NextResponse.json({
        success: true,
        data: snapshotPrompts.slice(offset, offset + limit),
        pagination,
      })
    }

    const publicFolder = await db.getPublicFolderById(id)
    if (!publicFolder) {
      return NextResponse.json(
        { success: false, error: '文件夹不存在' },
        { status: 404 }
      )
    }

    const result = await db.getPublicFolderPrompts(id, paginationResult.value)
    const prompts = result.items.map(prompt => toPublicFolderSnapshotPrompt(prompt))
    const pagination = createPaginationMetadata(result.total, paginationResult.value)

    return NextResponse.json({
      success: true,
      data: prompts,
      pagination,
    })

  } catch (error) {
    console.error('Failed to fetch public folder prompts:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch folder prompts' },
      { status: 500 }
    )
  }
}

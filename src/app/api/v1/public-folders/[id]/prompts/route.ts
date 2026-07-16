import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { getEnglishFeaturedFolderPrompts } from '@/data/english-featured-folders'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { createPaginationMetadata, parseBoundedPagination } from '@/lib/pagination-policy'
import { FOLDER_PROMPT_PAGE_SIZE, MAX_FOLDER_PROMPT_PAGE_SIZE } from '@/lib/prompt-list-policy'

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const id = parsePositiveResourceId(idStr)
    const { searchParams } = new URL(request.url)
    const lang = searchParams.get('lang') || 'zh'
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

      const pagination = createPaginationMetadata(prompts.length, paginationResult.value)
      return NextResponse.json({
        success: true,
        data: prompts.slice(offset, offset + limit),
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
    const prompts = result.items.map(prompt => ({
      ...prompt,
      tags: normalizeTags(prompt.tags),
    }))
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

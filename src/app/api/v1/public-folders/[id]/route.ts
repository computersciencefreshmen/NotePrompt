import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { findEnglishFeaturedFolder, type EnglishFeaturedFolder } from '@/data/english-featured-folders'
import type { PublicFolder } from '@/types'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'

const MAX_PUBLIC_FOLDER_UPDATE_BODY_BYTES = 8 * 1024

type FolderUpdate = {
  name?: string
  description?: string | null
}


function toPublicFolderReaderDto(folder: EnglishFeaturedFolder | Record<string, unknown>): PublicFolder {
  return {
    id: Number(folder.id),
    name: String(folder.name ?? ''),
    description: String(folder.description ?? ''),
    user_id: Number(folder.user_id),
    is_featured: Boolean(folder.is_featured),
    created_at: String(folder.created_at ?? ''),
    updated_at: String(folder.updated_at ?? ''),
    author: String(folder.author ?? ''),
    prompt_count: Number(folder.prompt_count) || 0,
  }
}
type MutationResult = { affectedRows?: number }

// GET - 获取公共文件夹详情
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

    // 验证ID是否为有效数字
    if (id == null) {
      return NextResponse.json(
        { success: false, error: lang === 'en' ? 'Invalid folder ID' : '无效的文件夹ID' },
        { status: 400 }
      )
    }

    if (lang === 'en') {
      const folder = findEnglishFeaturedFolder(id)
      if (!folder) {
        return NextResponse.json(
          { success: false, error: 'Folder not found' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        success: true,
        data: toPublicFolderReaderDto(folder),
      })
    }

    // 获取文件夹详情
    const folder = await db.getPublicFolderById(id)
    if (!folder) {
      return NextResponse.json(
        { success: false, error: '文件夹不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: toPublicFolderReaderDto(folder)
    })
  } catch (error) {
    console.error('Get public folder error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch folder' },
      { status: 500 }
    )
  }
}

// PUT - 用户编辑自己发布的公共文件夹
export async function PUT(
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
    const id = parsePositiveResourceId(idStr)
    if (id == null) {
      return NextResponse.json({ success: false, error: '无效的文件夹ID' }, { status: 400 })
    }

    const input = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_PUBLIC_FOLDER_UPDATE_BODY_BYTES,
    )
    if (Object.keys(input).some(key => !['name', 'description'].includes(key))) {
      return NextResponse.json({ success: false, error: '请求包含不支持的字段' }, { status: 400 })
    }
    const updateData: FolderUpdate = {}
    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100) {
        return NextResponse.json({ success: false, error: '名称必须为 1-100 个字符' }, { status: 400 })
      }
      updateData.name = input.name.trim()
    }
    if (input.description !== undefined) {
      if (input.description !== null && (typeof input.description !== 'string' || input.description.length > 1_000)) {
        return NextResponse.json({ success: false, error: '描述不能超过 1000 个字符' }, { status: 400 })
      }
      updateData.description = input.description as string | null
    }

    const fields = Object.keys(updateData) as Array<keyof FolderUpdate>
    if (fields.length === 0) {
      return NextResponse.json({ success: false, error: '没有可更新的字段' }, { status: 400 })
    }

    const result = await db.query(
      `UPDATE public_folders
       SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [...fields.map((field) => updateData[field]), id, userId],
    )
    const affectedRows = Number((result.rows as MutationResult).affectedRows)
    if (affectedRows > 1) throw new Error('Public folder update affected more than one row')
    if (affectedRows === 0) {
      const existingResult = await db.query(
        'SELECT id FROM public_folders WHERE id = ? AND user_id = ? LIMIT 1',
        [id, userId],
      )
      if ((existingResult.rows as Record<string, unknown>[]).length === 0) {
        return NextResponse.json({ success: false, error: '公共文件夹不存在' }, { status: 404 })
      }
    }

    const updatedFolder = await db.getPublicFolderById(id)

    return NextResponse.json({
      success: true,
      data: updatedFolder,
      message: '公共文件夹更新成功'
    })
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('Update public folder error:', error)
    return NextResponse.json({ success: false, error: '更新公共文件夹失败' }, { status: 500 })
  }
}

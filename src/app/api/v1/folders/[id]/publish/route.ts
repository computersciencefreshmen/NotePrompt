import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'

const MAX_FOLDER_PUBLISH_BODY_BYTES = 8 * 1024

// POST - 发布文件夹到公共库（需要认证）
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { id } = await context.params
    const folderId = parsePositiveResourceId(id)
    const userId = auth.user.id
    if (folderId == null) {
      return NextResponse.json(
        { success: false, error: '文件夹不存在' },
        { status: 404 }
      )
    }

    const input = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_FOLDER_PUBLISH_BODY_BYTES,
    )
    if (Object.keys(input).some(key => key !== 'description')) {
      return NextResponse.json({ success: false, error: '请求包含不支持的字段' }, { status: 400 })
    }
    if (input.description !== undefined && typeof input.description !== 'string') {
      return NextResponse.json({ success: false, error: '描述格式无效' }, { status: 400 })
    }
    const description = typeof input.description === 'string' ? input.description.trim() : ''
    if (description.length > 2_000) {
      return NextResponse.json({ success: false, error: '描述不能超过 2000 个字符' }, { status: 400 })
    }

    const publicFolder = await db.publishOwnedFolderSnapshot(folderId, userId, description)
    if (!publicFolder) {
      return NextResponse.json(
        { success: false, error: '文件夹不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: publicFolder,
      message: '文件夹发布成功'
    })
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('发布文件夹失败:', error)
    return NextResponse.json(
      { success: false, error: '发布文件夹失败' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { findOwnedResource, parsePositiveResourceId } from '@/lib/resource-authorization'

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

    // 获取请求体
    const body = await request.json()
    const { description } = body

    // 检查文件夹是否存在且属于当前用户
    const folder = await findOwnedResource(
      resourceId => db.getFolderById(resourceId),
      folderId,
      userId
    )
    if (!folder) {
      return NextResponse.json(
        { success: false, error: '文件夹不存在' },
        { status: 404 }
      )
    }

    // 创建公共文件夹
    const publicFolder = await db.createPublicFolder({
      name: String(folder.name || ''),
      description: description || '',
      user_id: userId,
      original_folder_id: folderId
    })

    return NextResponse.json({
      success: true,
      data: publicFolder,
      message: '文件夹发布成功'
    })
  } catch (error) {
    console.error('发布文件夹失败:', error)
    console.error('错误详情:', {
      message: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    })
    return NextResponse.json(
      { success: false, error: '发布文件夹失败' },
      { status: 500 }
    )
  }
}

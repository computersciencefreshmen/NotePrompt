import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

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
    const importedFolderId = parseInt(idStr)

    // 检查导入文件夹是否属于当前用户
    const importedFolder = await db.getImportedFolderById(importedFolderId)
    if (!importedFolder || (importedFolder as Record<string, unknown>).user_id !== userId) {
      return NextResponse.json(
        { success: false, error: '导入文件夹不存在或无权限访问' },
        { status: 404 }
      )
    }

    const prompts = await db.getImportedFolderPrompts(importedFolderId)

    // 转换数据格式，确保作者和收藏数信息正确
    const formattedPrompts = prompts.map((prompt: Record<string, unknown>) => ({
      id: prompt.id as number,
      title: prompt.title as string,
      content: prompt.content as string,
      description: prompt.description as string,
      author: (prompt.username as string) || '未知用户',
      author_id: prompt.user_id as number,
      category: (prompt.category_name as string) || '未分类',
      tags: (prompt.tags_string as string) ? (prompt.tags_string as string).split(',').map((tag: string) => tag.trim()) : [],
      views_count: (prompt.views_count as number) || 0,
      favorites_count: 0, // 导入的提示词没有收藏数，因为它们是用户提示词
      is_featured: false,
      created_at: prompt.created_at as string,
      updated_at: prompt.updated_at as string,
      is_favorited: false // 导入的提示词默认不是收藏状态
    }))

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
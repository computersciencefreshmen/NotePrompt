import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { getEnglishFeaturedFolderPrompts } from '@/data/english-featured-folders'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const id = parseInt(idStr)
    const { searchParams } = new URL(request.url)
    const lang = searchParams.get('lang') || 'zh'

    if (isNaN(id)) {
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

      return NextResponse.json({
        success: true,
        data: prompts,
      })
    }

    // 获取公共文件夹信息
    const publicFolder = await db.getPublicFolderById(id)
    if (!publicFolder) {
      return NextResponse.json(
        { success: false, error: '文件夹不存在' },
        { status: 404 }
      )
    }

    // 获取原始文件夹ID
    const originalFolderId = publicFolder.original_folder_id

    // 查询该文件夹下的所有提示词（通过关联表）
    const query = `
      SELECT up.id, up.title, up.content, up.description, up.created_at, up.updated_at,
             u.username as author, u.avatar_url
      FROM user_prompts up
      JOIN users u ON up.user_id = u.id
      JOIN user_prompt_folders upf ON up.id = upf.user_prompt_id
      WHERE upf.folder_id = ?
      ORDER BY up.created_at DESC
    `

    const result = await db.query(query, [originalFolderId])
    const prompts = (result.rows as Record<string, unknown>[]) || []

    return NextResponse.json({
      success: true,
      data: prompts
    })

  } catch (error) {
    console.error('Failed to fetch public folder prompts:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch folder prompts' },
      { status: 500 }
    )
  }
} 
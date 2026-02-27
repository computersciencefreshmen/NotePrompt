import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const id = parseInt(idStr)

    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: '无效的文件夹ID' },
        { status: 400 }
      )
    }

    console.log('获取公共文件夹提示词，文件夹ID:', id)

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

    console.log('查询到的提示词数量:', prompts.length)

    return NextResponse.json({
      success: true,
      data: prompts
    })

  } catch (error) {
    console.error('获取公共文件夹提示词失败:', error)
    return NextResponse.json(
      { success: false, error: '获取文件夹提示词失败' },
      { status: 500 }
    )
  }
} 
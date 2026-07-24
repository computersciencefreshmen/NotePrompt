import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id

    const importedFolders = await db.getUserImportedFolders(userId)
    
    const foldersWithCount = (importedFolders as Record<string, unknown>[]).map(folder => ({
      id: Number(folder.id),
      user_id: Number(folder.user_id),
      public_folder_id: Number(folder.public_folder_id),
      name: String(folder.name ?? ''),
      description: typeof folder.description === 'string' ? folder.description : null,
      created_at: String(folder.created_at ?? ''),
      updated_at: String(folder.updated_at ?? ''),
      original_name: String(folder.original_name ?? ''),
      original_description: typeof folder.original_description === 'string'
        ? folder.original_description
        : null,
      author: String(folder.author ?? ''),
      original_created_at: String(folder.original_created_at ?? ''),
      prompt_count: Number(folder.prompt_count) || 0,
    }))

    return NextResponse.json({
      success: true,
      data: foldersWithCount
    })
  } catch (error) {
    console.error('获取用户导入文件夹失败:', error)
    return NextResponse.json(
      { success: false, error: '获取导入文件夹失败' },
      { status: 500 }
    )
  }
} 
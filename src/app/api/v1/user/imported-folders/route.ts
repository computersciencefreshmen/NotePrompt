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
    
    // 为每个导入文件夹获取提示词数目
    const foldersWithCount = await Promise.all(
      (importedFolders as Record<string, unknown>[]).map(async (folder) => {
        const promptCount = await db.getImportedFolderPromptCount(folder.id as number)
        return {
          ...folder,
          prompt_count: promptCount
        }
      })
    )

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
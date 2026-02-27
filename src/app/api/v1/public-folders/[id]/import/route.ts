import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// POST - 导入公共文件夹到用户文件夹（只创建文件夹结构）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const user_id = auth.user.id
    const { id: idStr } = await params
    const publicFolderId = parseInt(idStr)
    
    // 从数据库查询公共文件夹
    const publicFolder = await db.getPublicFolderById(publicFolderId)

    if (!publicFolder) {
      return NextResponse.json(
        { success: false, error: '公共文件夹不存在' },
        { status: 404 }
      )
    }
    
    // 检查用户是否已经导入过这个公共文件夹
    const existingImportedFolder = await db.getImportedFolderByPublicFolderId(user_id, publicFolderId)
    
    if (existingImportedFolder) {
      return NextResponse.json(
        { 
          success: true, 
          data: {
            importedFolder: existingImportedFolder,
            publicFolder
          },
          message: '文件夹已存在',
          alreadyExists: true
        },
        { status: 200 }
      )
    }
    
    // 创建导入的文件夹记录
    const importedFolder = await db.createImportedFolder({
      user_id: user_id,
      public_folder_id: publicFolderId,
      name: publicFolder.name as string,
      description: publicFolder.description as string || null
    })
    
    return NextResponse.json({
      success: true,
      data: {
        importedFolder,
        publicFolder
      },
      message: `成功导入文件夹"${publicFolder.name}"到您的文件夹`
    })
  } catch (error) {
    console.error('导入文件夹失败:', error)
    return NextResponse.json(
      { success: false, error: '导入失败' },
      { status: 500 }
    )
  }
} 
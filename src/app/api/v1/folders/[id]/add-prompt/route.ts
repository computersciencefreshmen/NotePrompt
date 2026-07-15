import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { findOwnedResource, parsePositiveResourceId } from '@/lib/resource-authorization'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    
    const { id } = await context.params
    const folderId = parsePositiveResourceId(id)
    const { prompt_id } = await request.json()
    const promptId = parsePositiveResourceId(prompt_id)
    
    // 验证参数
    if (promptId == null) {
      return NextResponse.json({ 
        success: false, 
        error: '参数无效' 
      }, { status: 400 })
    }
    
    // 检查文件夹是否属于当前用户
    const folder = folderId == null
      ? null
      : await findOwnedResource(resourceId => db.getFolderById(resourceId), folderId, userId)
    if (!folder) {
      return NextResponse.json({ 
        success: false, 
        error: '文件夹不存在'
      }, { status: 404 })
    }
    
    // 检查提示词是否属于当前用户
    const prompt = await findOwnedResource(
      resourceId => db.getUserPromptById(resourceId),
      promptId,
      userId
    )
    if (!prompt) {
      return NextResponse.json({ 
        success: false, 
        error: '提示词不存在'
      }, { status: 404 })
    }
    
    // 检查提示词是否已经在该文件夹中（防止重复）
    const existingResult = await db.query(
      'SELECT COUNT(*) as count FROM user_prompt_folders WHERE user_prompt_id = ? AND folder_id = ?',
      [promptId, folderId]
    );
    
    if (Number((existingResult.rows as Record<string, unknown>[])[0]?.count) > 0) {
      return NextResponse.json({ 
        success: false, 
        error: '提示词已在该文件夹中，请勿重复添加' 
      }, { status: 409 })
    }
    
    // 添加到关联表
    await db.query(
      'INSERT INTO user_prompt_folders (user_prompt_id, folder_id) VALUES (?, ?)',
      [promptId, folderId]
    );
    
    return NextResponse.json({ 
      success: true, 
      message: '添加成功' 
    })
  } catch (error) {
    console.error('添加提示词到文件夹失败:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : '添加失败，请稍后重试' 
    }, { status: 500 })
  }
}

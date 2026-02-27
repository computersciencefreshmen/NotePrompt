import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    console.log('开始添加提示词到文件夹...')
    
    // 验证用户认证
    const auth = await requireAuth(request)
    if ('error' in auth) {
      console.log('认证失败:', auth.error)
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    
    const { id } = await context.params
    const folderId = parseInt(id)
    const { prompt_id } = await request.json()
    
    console.log('用户ID:', userId, '文件夹ID:', folderId, '提示词ID:', prompt_id)
    
    // 验证参数
    if (!prompt_id || isNaN(folderId)) {
      return NextResponse.json({ 
        success: false, 
        error: '参数无效' 
      }, { status: 400 })
    }
    
    // 检查文件夹是否属于当前用户
    const folder = await db.getFolderById(folderId)
    if (!folder || folder.user_id !== userId) {
      return NextResponse.json({ 
        success: false, 
        error: '文件夹不存在或无权限' 
      }, { status: 403 })
    }
    
    // 检查提示词是否属于当前用户
    const prompt = await db.getUserPromptById(prompt_id)
    if (!prompt || prompt.user_id !== userId) {
      return NextResponse.json({ 
        success: false, 
        error: '提示词不存在或无权限' 
      }, { status: 403 })
    }
    
    // 检查提示词是否已经在该文件夹中（防止重复）
    const existingResult = await db.query(
      'SELECT COUNT(*) as count FROM user_prompt_folders WHERE user_prompt_id = ? AND folder_id = ?',
      [prompt_id, folderId]
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
      [prompt_id, folderId]
    );
    
    console.log('成功添加提示词到文件夹')
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
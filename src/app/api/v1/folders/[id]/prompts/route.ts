import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    console.log('开始获取文件夹下的提示词...')
    
    // 验证用户认证
    const auth = await requireAuth(request)
    if ('error' in auth) {
      console.log('认证失败:', auth.error)
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    console.log('用户认证成功，用户ID:', userId)
    
    const { id } = await context.params
    const folderId = parseInt(id)
    console.log('获取文件夹ID:', folderId, '下的提示词')
    
    // 获取用户在指定文件夹下的提示词
    const prompts = await db.getUserPromptsByUserId(userId, folderId)
    console.log('查询到的提示词数量:', prompts.length)
    
    return NextResponse.json({ 
      success: true, 
      data: prompts 
    })
  } catch (error) {
    console.error('获取文件夹提示词失败:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : '获取文件夹提示词失败' 
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    console.log('开始从文件夹移除提示词...')
    
    // 验证用户认证
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    
    const { id } = await context.params
    const folderId = parseInt(id)
    const { prompt_id } = await request.json()
    
    console.log('从文件夹', folderId, '移除提示词', prompt_id)
    
    // 将提示词从文件夹中移除（设置folder_id为NULL）
    await db.updateUserPrompt(prompt_id, { folder_id: null })
    
    return NextResponse.json({ success: true, message: '移除成功' })
  } catch (error) {
    console.error('移除提示词失败:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : '移除提示词失败' 
    }, { status: 500 })
  }
} 
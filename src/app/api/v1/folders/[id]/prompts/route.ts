import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    
    const { id } = await context.params
    const folderId = parsePositiveResourceId(id)
    if (folderId == null) {
      return NextResponse.json(
        { success: false, error: '文件夹不存在' },
        { status: 404 }
      )
    }

    const folder = await db.getOwnedFolderById(folderId, userId)
    if (!folder) {
      return NextResponse.json(
        { success: false, error: '文件夹不存在' },
        { status: 404 }
      )
    }
    
    // 获取用户在指定文件夹下的提示词
    const prompts = await db.getUserPromptsByUserId(userId, folderId)
    
    return NextResponse.json({ 
      success: true, 
      data: prompts 
    })
  } catch (error) {
    console.error('获取文件夹提示词失败:', error)
    return NextResponse.json({ 
      success: false, 
      error: '获取文件夹提示词失败',
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    
    const { id } = await context.params
    const folderId = parsePositiveResourceId(id)
    const { prompt_id } = await readLimitedJson<Record<string, unknown>>(request, 8 * 1024)
    const promptId = parsePositiveResourceId(prompt_id)

    if (promptId == null) {
      return NextResponse.json(
        { success: false, error: '无效的提示词ID' },
        { status: 400 }
      )
    }

    const folder = folderId == null
      ? null
      : await db.getOwnedFolderById(folderId, userId)
    const prompt = await db.getOwnedUserPromptById(promptId, userId)
    if (!folder || !prompt) {
      return NextResponse.json(
        { success: false, error: '文件夹或提示词不存在' },
        { status: 404 }
      )
    }

    // 两种历史文件夹模型都按用户归属条件清理，避免改动他人关联。
    await db.query(
      `DELETE upf FROM user_prompt_folders upf
       JOIN folders f ON upf.folder_id = f.id
       JOIN user_prompts up ON upf.user_prompt_id = up.id
       WHERE upf.folder_id = ? AND upf.user_prompt_id = ?
         AND f.user_id = ? AND up.user_id = ?`,
      [folderId, promptId, userId, userId]
    )
    await db.query(
      `UPDATE user_prompts up
       SET folder_id = (
         SELECT MIN(upf.folder_id)
         FROM user_prompt_folders upf
         WHERE upf.user_prompt_id = up.id
       ), updated_at = CURRENT_TIMESTAMP
       WHERE up.id = ? AND up.user_id = ? AND up.folder_id = ?`,
      [promptId, userId, folderId],
    )
    
    return NextResponse.json({ success: true, message: '移除成功' })
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('移除提示词失败:', error)
    return NextResponse.json({ 
      success: false, 
      error: '移除提示词失败',
    }, { status: 500 })
  }
}

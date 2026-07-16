import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'

type MutationResult = { affectedRows?: number }

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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
      : await db.getOwnedFolderById(folderId, userId)
    if (!folder) {
      return NextResponse.json({ 
        success: false, 
        error: '文件夹不存在'
      }, { status: 404 })
    }
    
    // 检查提示词是否属于当前用户
    const prompt = await db.getOwnedUserPromptById(promptId, userId)
    if (!prompt) {
      return NextResponse.json({ 
        success: false, 
        error: '提示词不存在'
      }, { status: 404 })
    }
    
    // 唯一键与 INSERT IGNORE 在一条写语句中处理并发重复添加。
    const insertResult = await db.query(
      'INSERT IGNORE INTO user_prompt_folders (user_prompt_id, folder_id) VALUES (?, ?)',
      [promptId, folderId]
    )
    if (Number((insertResult.rows as MutationResult).affectedRows) !== 1) {
      return NextResponse.json({
        success: false,
        error: '提示词已在该文件夹中，请勿重复添加',
      }, { status: 409 })
    }

    // `user_prompt_folders` is canonical; keep the legacy single-folder column
    // populated only as a compatibility projection for older exports/clients.
    await db.query(
      `UPDATE user_prompts
       SET folder_id = COALESCE(folder_id, ?), updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [folderId, promptId, userId],
    )
    
    return NextResponse.json({ 
      success: true, 
      message: '添加成功' 
    })
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('添加提示词到文件夹失败:', error)
    return NextResponse.json({ 
      success: false, 
      error: '添加失败，请稍后重试',
    }, { status: 500 })
  }
}

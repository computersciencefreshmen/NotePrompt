import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import db from '@/lib/mysql-database'

// DELETE - 删除账户
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const user_id = auth.user.id

    // 删除用户的所有数据
    // 1. 删除用户提示词的标签关联
    await db.query('DELETE FROM user_prompt_tags WHERE user_prompt_id IN (SELECT id FROM user_prompts WHERE user_id = ?)', [user_id])

    // 2. 删除用户的提示词
    await db.query('DELETE FROM user_prompts WHERE user_id = ?', [user_id])

    // 3. 删除用户的文件夹
    await db.query('DELETE FROM folders WHERE user_id = ?', [user_id])

    // 4. 删除用户的收藏
    await db.query('DELETE FROM favorites WHERE user_id = ?', [user_id])

    // 5. 删除用户发布的公共提示词的标签关联
    await db.query('DELETE FROM public_prompt_tags WHERE public_prompt_id IN (SELECT id FROM public_prompts WHERE author_id = ?)', [user_id])

    // 6. 删除用户发布的公共提示词
    await db.query('DELETE FROM public_prompts WHERE author_id = ?', [user_id])

    // 7. 删除用户发布的公共文件夹的提示词关联
    await db.query('DELETE FROM public_folder_prompts WHERE public_folder_id IN (SELECT id FROM public_folders WHERE user_id = ?)', [user_id])

    // 8. 删除用户发布的公共文件夹
    await db.query('DELETE FROM public_folders WHERE user_id = ?', [user_id])

    // 9. 删除用户导入的文件夹记录
    await db.query('DELETE FROM imported_folders WHERE user_id = ?', [user_id])

    // 10. 最后删除用户
    await db.query('DELETE FROM users WHERE id = ?', [user_id])

    return NextResponse.json({
      success: true,
      message: '账户已删除'
    })
  } catch (error) {
    console.error('删除账户失败:', error)
    return NextResponse.json(
      { success: false, error: '删除账户失败' },
      { status: 500 }
    )
  }
}

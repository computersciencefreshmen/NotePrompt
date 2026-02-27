import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 获取公共文件夹内的提示词
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    
    // 检查管理员权限
    if (!auth.user.is_admin) {
      return NextResponse.json(
        { success: false, error: '需要管理员权限' },
        { status: 403 }
      )
    }

    const { id: idStr } = await params
    const folderId = parseInt(idStr)

    // 获取文件夹信息
    const folderResult = await db.query(`
      SELECT pf.*, u.username as author
      FROM public_folders pf
      JOIN users u ON pf.user_id = u.id
      WHERE pf.id = ?
    `, [folderId])

    if (!folderResult.rows || (folderResult.rows as any[]).length === 0) {
      return NextResponse.json(
        { success: false, error: '公共文件夹不存在' },
        { status: 404 }
      )
    }

    const folder = (folderResult.rows as any[])[0]

    // 获取文件夹内的提示词
    const promptsResult = await db.query(`
      SELECT up.id, up.title, up.content, up.description, up.created_at, up.updated_at,
             u.username as author
      FROM user_prompts up
      JOIN users u ON up.user_id = u.id
      JOIN user_prompt_folders upf ON up.id = upf.user_prompt_id
      WHERE upf.folder_id = ?
      ORDER BY up.created_at DESC
    `, [folder.original_folder_id])

    const prompts = (promptsResult.rows as any[]).map(prompt => ({
      id: prompt.id,
      title: prompt.title,
      content: prompt.content,
      description: prompt.description,
      author: prompt.author,
      created_at: prompt.created_at,
      updated_at: prompt.updated_at
    }))

    return NextResponse.json({
      success: true,
      data: {
        folder: {
          id: folder.id,
          name: folder.name,
          description: folder.description,
          author: folder.author,
          original_folder_id: folder.original_folder_id,
          is_featured: folder.is_featured || false,
          created_at: folder.created_at,
          updated_at: folder.updated_at
        },
        prompts
      }
    })
  } catch (error) {
    console.error('Get admin folder prompts error:', error)
    return NextResponse.json(
      { success: false, error: '获取文件夹提示词失败' },
      { status: 500 }
    )
  }
}

// POST - 向公共文件夹添加提示词
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    
    // 检查管理员权限
    if (!auth.user.is_admin) {
      return NextResponse.json(
        { success: false, error: '需要管理员权限' },
        { status: 403 }
      )
    }

    const { id: idStr } = await params
    const folderId = parseInt(idStr)
    const body = await request.json()
    const { promptId } = body

    // 获取文件夹信息
    const folderResult = await db.query(`
      SELECT original_folder_id FROM public_folders WHERE id = ?
    `, [folderId])

    if (!folderResult.rows || (folderResult.rows as any[]).length === 0) {
      return NextResponse.json(
        { success: false, error: '公共文件夹不存在' },
        { status: 404 }
      )
    }

    const folder = (folderResult.rows as any[])[0]

    // 检查提示词是否已存在
    const existingResult = await db.query(`
      SELECT COUNT(*) as count
      FROM user_prompt_folders
      WHERE folder_id = ? AND user_prompt_id = ?
    `, [folder.original_folder_id, promptId])

    if (Number((existingResult.rows as any[])[0]?.count) > 0) {
      return NextResponse.json({
        success: false,
        error: '提示词已在该文件夹中'
      }, { status: 409 })
    }

    // 添加提示词到文件夹
    await db.query(`
      INSERT INTO user_prompt_folders (folder_id, user_prompt_id)
      VALUES (?, ?)
    `, [folder.original_folder_id, promptId])

    return NextResponse.json({
      success: true,
      message: '提示词已添加到文件夹'
    })
  } catch (error) {
    console.error('Add prompt to folder error:', error)
    return NextResponse.json(
      { success: false, error: '添加提示词失败' },
      { status: 500 }
    )
  }
}

// DELETE - 从公共文件夹移除提示词
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    
    // 检查管理员权限
    if (!auth.user.is_admin) {
      return NextResponse.json(
        { success: false, error: '需要管理员权限' },
        { status: 403 }
      )
    }

    const { id: idStr } = await params
    const folderId = parseInt(idStr)
    const { searchParams } = new URL(request.url)
    const promptId = searchParams.get('promptId')

    if (!promptId) {
      return NextResponse.json(
        { success: false, error: '缺少提示词ID' },
        { status: 400 }
      )
    }

    // 获取文件夹信息
    const folderResult = await db.query(`
      SELECT original_folder_id FROM public_folders WHERE id = ?
    `, [folderId])

    if (!folderResult.rows || (folderResult.rows as any[]).length === 0) {
      return NextResponse.json(
        { success: false, error: '公共文件夹不存在' },
        { status: 404 }
      )
    }

    const folder = (folderResult.rows as any[])[0]

    // 从文件夹移除提示词
    await db.query(`
      DELETE FROM user_prompt_folders
      WHERE folder_id = ? AND user_prompt_id = ?
    `, [folder.original_folder_id, parseInt(promptId)])

    return NextResponse.json({
      success: true,
      message: '提示词已从文件夹移除'
    })
  } catch (error) {
    console.error('Remove prompt from folder error:', error)
    return NextResponse.json(
      { success: false, error: '移除提示词失败' },
      { status: 500 }
    )
  }
} 
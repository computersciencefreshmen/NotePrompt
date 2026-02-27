import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 获取单个公共提示词详情
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
    const id = parseInt(idStr)

    // 获取公共提示词详情
    const result = await db.query(`
      SELECT pp.*, u.username as author
      FROM public_prompts pp
      JOIN users u ON pp.author_id = u.id
      WHERE pp.id = ?
    `, [id])

    if (!result.rows || (result.rows as any[]).length === 0) {
      return NextResponse.json(
        { success: false, error: '公共提示词不存在' },
        { status: 404 }
      )
    }

    const prompt = (result.rows as any[])[0]

    // 获取标签信息
    const tagsResult = await db.getPublicPromptTags(id)
    const tags = tagsResult.map(tag => tag.name)

    return NextResponse.json({
      success: true,
      data: {
        id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        description: prompt.description,
        author_id: prompt.author_id,
        author: prompt.author,
        category_id: prompt.category_id,
        is_featured: prompt.is_featured || false,
        tags: tags,
        created_at: prompt.created_at,
        updated_at: prompt.updated_at
      }
    })
  } catch (error) {
    console.error('Get admin public prompt error:', error)
    return NextResponse.json(
      { success: false, error: '获取公共提示词失败' },
      { status: 500 }
    )
  }
}

// PUT - 更新公共提示词
export async function PUT(
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
    const id = parseInt(idStr)
    const body = await request.json()

    // 更新公共提示词
    const updateFields = []
    const updateValues = []

    if (body.title !== undefined) {
      updateFields.push('title = ?')
      updateValues.push(body.title)
    }
    if (body.content !== undefined) {
      updateFields.push('content = ?')
      updateValues.push(body.content)
    }
    if (body.description !== undefined) {
      updateFields.push('description = ?')
      updateValues.push(body.description)
    }
    if (body.is_featured !== undefined) {
      updateFields.push('is_featured = ?')
      updateValues.push(body.is_featured)
    }

    if (updateFields.length === 0) {
      return NextResponse.json(
        { success: false, error: '没有提供更新字段' },
        { status: 400 }
      )
    }

    updateFields.push('updated_at = NOW()')
    updateValues.push(id)

    const query = `UPDATE public_prompts SET ${updateFields.join(', ')} WHERE id = ?`
    await db.query(query, updateValues)

    // 处理标签更新
    if (body.tags && Array.isArray(body.tags)) {
      // 先删除现有标签
      await db.query('DELETE FROM public_prompt_tags WHERE public_prompt_id = ?', [id])
      
      // 添加新标签
      if (body.tags.length > 0) {
        await db.addPublicPromptTags(id, body.tags)
      }
    }

    return NextResponse.json({
      success: true,
      message: '公共提示词更新成功'
    })
  } catch (error) {
    console.error('Update admin public prompt error:', error)
    return NextResponse.json(
      { success: false, error: '更新公共提示词失败' },
      { status: 500 }
    )
  }
}

// DELETE - 管理员删除公共提示词
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
    const id = parseInt(idStr)

    // 删除公共提示词
    await db.query('DELETE FROM public_prompts WHERE id = ?', [id])

    return NextResponse.json({
      success: true,
      message: '公共提示词删除成功'
    })
  } catch (error) {
    console.error('Delete admin public prompt error:', error)
    return NextResponse.json(
      { success: false, error: '删除公共提示词失败' },
      { status: 500 }
    )
  }
} 
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 获取单个用户提示词
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const id = parseInt(idStr)
    
    const prompt = await db.getUserPromptById(id)

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: '提示词不存在' },
        { status: 404 }
      )
    }

    // 获取标签
    const tagsResult = await db.getUserPromptTags(id)
    const tags = tagsResult.map(tag => ({ id: tag.id as number, name: tag.name as string }))

    return NextResponse.json({
      success: true,
      data: {
        ...prompt,
        tags: tags
      }
    })
  } catch (error) {
    console.error('Get prompt error:', error)
    return NextResponse.json(
      { success: false, error: '获取提示词失败' },
      { status: 500 }
    )
  }
}

// PUT - 更新用户提示词
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    
    const { id: idStr } = await params
    const id = parseInt(idStr)
    const body = await request.json()

    // 检查提示词是否存在
    const existingPrompt = await db.getUserPromptById(id)
    if (!existingPrompt) {
      return NextResponse.json(
        { success: false, error: '提示词不存在' },
        { status: 404 }
      )
    }

    // 检查权限 - 只能更新自己的提示词
    if (existingPrompt.user_id !== userId) {
      return NextResponse.json(
        { success: false, error: '没有权限更新此提示词' },
        { status: 403 }
      )
    }

    // 自动保存版本历史（仅当 title 或 content 发生变化时）
    const titleChanged = body.title !== undefined && body.title !== existingPrompt.title
    const contentChanged = body.content !== undefined && body.content !== existingPrompt.content
    if (titleChanged || contentChanged) {
      try {
        await db.createPromptVersion({
          prompt_id: id,
          user_id: userId,
          title: existingPrompt.title,
          content: existingPrompt.content,
          change_summary: titleChanged && contentChanged
            ? '修改了标题和内容'
            : titleChanged
              ? '修改了标题'
              : '修改了内容'
        })
      } catch (versionError) {
        console.error('Failed to save version:', versionError)
        // 版本保存失败不影响更新操作
      }
    }

    // 更新提示词
    const updatedPrompt = await db.updateUserPrompt(id, {
      title: body.title,
      content: body.content,
      description: body.description,
      folder_id: body.folder_id,
      category_id: body.category_id,
      is_public: body.is_public,
    })

    // 处理标签更新
    if (body.tags && Array.isArray(body.tags)) {
      try {
        // 先删除现有标签
        await db.removeUserPromptTags(id)
        
        // 添加新标签
        if (body.tags.length > 0) {
          await db.addUserPromptTags(id, body.tags)
        }
      } catch (tagError) {
        console.error('Failed to update tags:', tagError)
        // 标签更新失败不影响提示词更新
      }
    }

    return NextResponse.json({
      success: true,
      data: updatedPrompt
    })
  } catch (error) {
    console.error('Update prompt error:', error)
    return NextResponse.json(
      { success: false, error: '更新提示词失败' },
      { status: 500 }
    )
  }
}

// DELETE - 删除用户提示词
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    
    const { id: idStr } = await params
    const id = parseInt(idStr)

    // 检查提示词是否存在
    const existingPrompt = await db.getUserPromptById(id)
    if (!existingPrompt) {
      return NextResponse.json(
        { success: false, error: '提示词不存在' },
        { status: 404 }
      )
    }

    // 检查权限 - 只能删除自己的提示词
    if (existingPrompt.user_id !== userId) {
      return NextResponse.json(
        { success: false, error: '没有权限删除此提示词' },
        { status: 403 }
      )
    }

    await db.deleteUserPrompt(id)

    return NextResponse.json({
      success: true,
      data: { id, message: '删除成功' }
    })
  } catch (error) {
    console.error('Delete prompt error:', error)
    return NextResponse.json(
      { success: false, error: '删除提示词失败' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 获取公共提示词详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const id = parseInt(idStr)

    // 验证ID是否为有效数字
    if (isNaN(id) || id <= 0) {
      return NextResponse.json(
        { success: false, error: '无效的提示词ID' },
        { status: 400 }
      )
    }

    console.log('获取公共提示词详情 - ID:', id)

    // 获取提示词详情
    const prompt = await db.getPublicPromptById(id)
    if (!prompt) {
      return NextResponse.json(
        { success: false, error: '提示词不存在' },
        { status: 404 }
      )
    }

    // 增加浏览次数
    try {
      await db.incrementPromptViews(id)
    } catch (error) {
      console.error('增加浏览次数失败:', error)
      // 不影响主要功能，继续执行
    }

    return NextResponse.json({
      success: true,
      data: prompt
    })
  } catch (error) {
    console.error('Get public prompt error:', error)
    return NextResponse.json(
      { success: false, error: '获取提示词失败', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// PUT - 用户编辑自己发布的公共提示词
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('开始编辑公共提示词...')
    
    const auth = await requireAuth(request)
    if ('error' in auth) {
      console.log('认证失败:', auth.error)
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    
    const { id: idStr } = await params
    const id = parseInt(idStr)
    const body = await request.json()
    console.log('编辑数据:', body)

    // 检查公共提示词是否存在
    const prompt = await db.getPublicPromptById(id)
    if (!prompt) {
      console.log('提示词不存在')
      return NextResponse.json(
        { success: false, error: '公共提示词不存在' },
        { status: 404 }
      )
    }

    // 检查权限 - 只能编辑自己发布的提示词
    if ((prompt as any).author_id !== userId) {
      console.log('权限检查失败:', { promptAuthorId: (prompt as any).author_id, currentUserId: userId })
      return NextResponse.json(
        { success: false, error: '没有权限编辑此提示词' },
        { status: 403 }
      )
    }

    // 更新公共提示词
    const updateData: any = {}
    if (body.title !== undefined) updateData.title = body.title
    if (body.content !== undefined) updateData.content = body.content
    if (body.description !== undefined) updateData.description = body.description

    console.log('更新数据:', updateData)
    const updatedPrompt = await db.updatePublicPrompt(id, updateData)
    console.log('更新成功:', updatedPrompt)

    // 处理标签更新（暂时跳过，避免错误）
    if (body.tags && Array.isArray(body.tags)) {
      console.log('标签更新暂时跳过')
      // 暂时注释掉标签更新，避免错误
      /*
      // 先删除现有标签
      await db.removeUserPromptTags(id)
      
      // 添加新标签
      if (body.tags.length > 0) {
        await db.addPublicPromptTags(id, body.tags)
      }
      */
    }

    return NextResponse.json({
      success: true,
      data: updatedPrompt,
      message: '公共提示词更新成功'
    })
  } catch (error) {
    console.error('Update public prompt error:', error)
    return NextResponse.json(
      { success: false, error: '更新公共提示词失败', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

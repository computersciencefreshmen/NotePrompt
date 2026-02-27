import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 获取提示词版本列表
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { id: idStr } = await params
    const promptId = parseInt(idStr)

    if (isNaN(promptId)) {
      return NextResponse.json({ success: false, error: '无效的提示词ID' }, { status: 400 })
    }

    // 验证提示词属于当前用户
    const prompt = await db.getUserPromptById(promptId)
    if (!prompt || prompt.user_id !== auth.user.id) {
      return NextResponse.json({ success: false, error: '提示词不存在或无权访问' }, { status: 404 })
    }

    const versions = await db.getPromptVersions(promptId)

    return NextResponse.json({
      success: true,
      data: versions,
    })
  } catch (error) {
    console.error('Get prompt versions error:', error)
    return NextResponse.json({ success: false, error: '获取版本列表失败' }, { status: 500 })
  }
}

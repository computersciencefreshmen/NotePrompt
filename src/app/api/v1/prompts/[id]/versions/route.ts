import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'

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
    const promptId = parsePositiveResourceId(idStr)

    if (promptId == null) {
      return NextResponse.json({ success: false, error: '提示词不存在' }, { status: 404 })
    }

    const prompt = await db.getOwnedUserPromptById(promptId, auth.user.id)
    if (!prompt) {
      return NextResponse.json({ success: false, error: '提示词不存在' }, { status: 404 })
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

import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 获取单个版本详情（包含完整内容）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { id: idStr, versionId: versionIdStr } = await params
    const promptId = parseInt(idStr)
    const versionId = parseInt(versionIdStr)

    if (isNaN(promptId) || isNaN(versionId)) {
      return NextResponse.json({ success: false, error: '无效的参数' }, { status: 400 })
    }

    // 验证提示词属于当前用户
    const prompt = await db.getUserPromptById(promptId)
    if (!prompt || prompt.user_id !== auth.user.id) {
      return NextResponse.json({ success: false, error: '提示词不存在或无权访问' }, { status: 404 })
    }

    const version = await db.getPromptVersion(versionId)
    if (!version || version.prompt_id !== promptId) {
      return NextResponse.json({ success: false, error: '版本不存在' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: version,
    })
  } catch (error) {
    console.error('Get prompt version error:', error)
    return NextResponse.json({ success: false, error: '获取版本详情失败' }, { status: 500 })
  }
}

// POST - 恢复到此版本
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { id: idStr, versionId: versionIdStr } = await params
    const promptId = parseInt(idStr)
    const versionId = parseInt(versionIdStr)

    if (isNaN(promptId) || isNaN(versionId)) {
      return NextResponse.json({ success: false, error: '无效的参数' }, { status: 400 })
    }

    // 验证提示词属于当前用户
    const prompt = await db.getUserPromptById(promptId)
    if (!prompt || prompt.user_id !== auth.user.id) {
      return NextResponse.json({ success: false, error: '提示词不存在或无权访问' }, { status: 404 })
    }

    const version = await db.getPromptVersion(versionId)
    if (!version || version.prompt_id !== promptId) {
      return NextResponse.json({ success: false, error: '版本不存在' }, { status: 404 })
    }

    // 先保存当前版本
    await db.createPromptVersion({
      prompt_id: promptId,
      user_id: auth.user.id,
      title: prompt.title,
      content: prompt.content,
      change_summary: '恢复前自动备份',
    })

    // 恢复到目标版本
    await db.updateUserPrompt(promptId, {
      title: version.title,
      content: version.content,
    })

    return NextResponse.json({
      success: true,
      message: `已恢复到版本 ${version.version_number}`,
    })
  } catch (error) {
    console.error('Restore prompt version error:', error)
    return NextResponse.json({ success: false, error: '恢复版本失败' }, { status: 500 })
  }
}

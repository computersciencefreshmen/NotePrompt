import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { withResolvedPromptEditorState } from '@/lib/prompt-editor-state'

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
    const promptId = parsePositiveResourceId(idStr)
    const versionId = parsePositiveResourceId(versionIdStr)

    if (promptId == null || versionId == null) {
      return NextResponse.json({ success: false, error: '无效的参数' }, { status: 400 })
    }

    const prompt = await db.getOwnedUserPromptById(promptId, auth.user.id)
    if (!prompt) {
      return NextResponse.json({ success: false, error: '提示词不存在' }, { status: 404 })
    }

    const version = await db.getPromptVersion(versionId)
    if (!version || version.prompt_id !== promptId) {
      return NextResponse.json({ success: false, error: '版本不存在' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: withResolvedPromptEditorState(version),
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
    const promptId = parsePositiveResourceId(idStr)
    const versionId = parsePositiveResourceId(versionIdStr)

    if (promptId == null || versionId == null) {
      return NextResponse.json({ success: false, error: '无效的参数' }, { status: 400 })
    }

    const restoredPrompt = await db.restoreOwnedPromptVersion(promptId, versionId, auth.user.id)
    if (!restoredPrompt) {
      return NextResponse.json({ success: false, error: '提示词或版本不存在' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: withResolvedPromptEditorState(restoredPrompt),
      message: '已恢复到选定版本',
    })
  } catch (error) {
    console.error('Restore prompt version error:', error)
    return NextResponse.json({ success: false, error: '恢复版本失败' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { entitlementLimitResponse } from '@/lib/entitlement-http'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; promptId: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const values = await params
    const publicFolderId = parsePositiveResourceId(values.id)
    const snapshotId = parsePositiveResourceId(values.promptId)
    if (publicFolderId == null || snapshotId == null) {
      return NextResponse.json(
        { success: false, error: '公共文件夹ID或快照提示词ID无效' },
        { status: 400 }
      )
    }

    const result = await db.importPublicFolderSnapshotPrompt(
      publicFolderId,
      snapshotId,
      auth.user.id
    )
    if (result.status === 'snapshot_not_found') {
      return NextResponse.json(
        { success: false, error: '发布快照中的提示词不存在' },
        { status: 404 }
      )
    }
    if (result.status === 'folder_not_found') {
      return NextResponse.json(
        { success: false, error: '请先创建一个私有文件夹' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: true, data: result.prompt, message: '已从发布快照导入提示词' },
      { status: 201 }
    )
  } catch (error) {
    const limitResponse = entitlementLimitResponse(error)
    if (limitResponse) return limitResponse
    console.error('Import public folder snapshot prompt error:', error)
    return NextResponse.json({ success: false, error: '导入失败' }, { status: 500 })
  }
}

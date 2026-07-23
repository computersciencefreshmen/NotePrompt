import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'

// DELETE - 用户撤回自己发布的公共提示词
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
    const id = parsePositiveResourceId(idStr)
    if (id == null) {
      return NextResponse.json(
        { success: false, error: '公共提示词不存在' },
        { status: 404 }
      )
    }

    const withdrawn = await db.withdrawOwnedPublicPrompt(userId, id)
    if (!withdrawn) {
      return NextResponse.json(
        { success: false, error: '公共提示词不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '公共提示词已撤回'
    })
  } catch (error) {
    console.error('Withdraw public prompt error')
    return NextResponse.json(
      { success: false, error: '撤回公共提示词失败' },
      { status: 500 }
    )
  }
}

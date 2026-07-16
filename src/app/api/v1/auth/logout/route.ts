import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth'
import { isBrowserCredentialMutationAllowed } from '@/lib/session-security'

export async function POST(request: NextRequest) {
  if (!isBrowserCredentialMutationAllowed(request.headers)) {
    return NextResponse.json(
      { success: false, error: '跨站登出请求已拒绝' },
      { status: 403 },
    )
  }

  const response = NextResponse.json({ success: true, message: '已退出登录' })
  clearSessionCookie(response)
  return response
}

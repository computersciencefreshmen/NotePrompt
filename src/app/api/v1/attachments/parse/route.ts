import { NextRequest, NextResponse } from 'next/server'
import { AttachmentParseAdmissionError } from '@/lib/attachment-parse-scheduler'
import { AttachmentParseClientAbortedError, AttachmentParseDeadlineError, parseAttachmentRequest } from '@/lib/attachment-parse-service'
import { requireAIUser, requestPolicyResponse } from '@/lib/ai-runtime-security'
import { RequestPolicyError } from '@/lib/ai-runtime-policy'

const RETRY_AFTER_SECONDS = '3'

export async function POST(request: NextRequest) {
  const auth = await requireAIUser(request, 'attachments')
  if (!auth.ok) return auth.response

  try {
    const attachments = await parseAttachmentRequest(request, auth.user.id)
    return NextResponse.json({
      success: true,
      data: { attachments },
    })
  } catch (error) {
    if (error instanceof RequestPolicyError) return requestPolicyResponse(error)
    if (error instanceof AttachmentParseAdmissionError) {
      const accountBusy = error.scope === 'account'
      return NextResponse.json(
        {
          success: false,
          error: accountBusy ? '当前账户已有附件解析任务，请稍后重试' : '附件解析服务繁忙，请稍后重试',
        },
        {
          status: accountBusy ? 429 : 503,
          headers: { 'Retry-After': RETRY_AFTER_SECONDS },
        },
      )
    }
    if (error instanceof AttachmentParseClientAbortedError) {
      return NextResponse.json({ success: false, error: '附件解析请求已取消' }, { status: 499 })
    }
    if (error instanceof AttachmentParseDeadlineError) {
      return NextResponse.json({ success: false, error: '附件解析超时，请缩小文件或稍后重试' }, { status: 504 })
    }
    return NextResponse.json({ success: false, error: '附件解析失败' }, { status: 500 })
  }
}

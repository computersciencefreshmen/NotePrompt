import { NextRequest, NextResponse } from 'next/server'
import { parseAttachmentFile } from '@/lib/attachment-parser'
import { requireAIUser, requestPolicyResponse } from '@/lib/ai-runtime-security'
import {
  MAX_AI_ATTACHMENTS,
  MAX_AI_ATTACHMENT_FILE_BYTES,
  MAX_AI_ATTACHMENT_FILES_TOTAL_BYTES,
  MAX_ATTACHMENT_UPLOAD_BODY_BYTES,
  readLimitedBody,
  RequestPolicyError,
} from '@/lib/ai-runtime-policy'

export async function POST(request: NextRequest) {
  const auth = await requireAIUser(request, 'attachments')
  if (!auth.ok) return auth.response

  try {
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
      throw new RequestPolicyError('请求必须使用 multipart/form-data', 415)
    }

    const rawBody = await readLimitedBody(request, MAX_ATTACHMENT_UPLOAD_BODY_BYTES)
    const boundedRequest = new Request(request.url, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: rawBody.buffer.slice(rawBody.byteOffset, rawBody.byteOffset + rawBody.byteLength) as ArrayBuffer,
    })
    const formData = await boundedRequest.formData()
    const files = formData
      .getAll('files')
      .filter((item): item is File => item instanceof File)

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: '请选择需要解析的附件' }, { status: 400 })
    }
    if (files.length > MAX_AI_ATTACHMENTS) {
      return NextResponse.json(
        { success: false, error: `一次最多解析 ${MAX_AI_ATTACHMENTS} 个附件` },
        { status: 413 },
      )
    }

    const oversizedFile = files.find(file => file.size > MAX_AI_ATTACHMENT_FILE_BYTES)
    if (oversizedFile) {
      return NextResponse.json(
        { success: false, error: `${oversizedFile.name} 超过 5MB，暂不支持解析。` },
        { status: 413 }
      )
    }
    const totalFileBytes = files.reduce((total, file) => total + file.size, 0)
    if (totalFileBytes > MAX_AI_ATTACHMENT_FILES_TOTAL_BYTES) {
      return NextResponse.json(
        { success: false, error: '附件总大小不能超过 15MB' },
        { status: 413 },
      )
    }

    const attachments = []
    for (const file of files) {
      attachments.push(await parseAttachmentFile(file))
    }

    return NextResponse.json({
      success: true,
      data: {
        attachments,
      },
    })
  } catch (error) {
    if (error instanceof RequestPolicyError) return requestPolicyResponse(error)
    return NextResponse.json({ success: false, error: '附件解析失败' }, { status: 500 })
  }
}

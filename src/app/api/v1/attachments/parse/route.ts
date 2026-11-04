import { NextRequest, NextResponse } from 'next/server'
import { parseAttachmentFile } from '@/lib/attachment-parser'
import { AttachmentBusyError, withAttachmentSlot } from '@/lib/attachment-work'
import { requireAuth } from '@/lib/auth'

const MAX_FILES = 12
const MAX_FILE_SIZE = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  try {
    return await withAttachmentSlot(async () => {
    const formData = await request.formData()
    const files = formData
      .getAll('files')
      .filter((item): item is File => item instanceof File)

    if (files.length > MAX_FILES) {
      return NextResponse.json({ success: false, error: '每次最多解析 12 个附件' }, { status: 400 })
    }

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: '请选择需要解析的附件' }, { status: 400 })
    }

    const oversizedFile = files.find(file => file.size > MAX_FILE_SIZE)
    if (oversizedFile) {
      return NextResponse.json(
        { success: false, error: `${oversizedFile.name} 超过 10MB，暂不支持解析。` },
        { status: 400 }
      )
    }

    // Preserve every supported format and the 12-file limit, while avoiding
    // twelve simultaneous OCR subprocesses on a small shared server.
    const attachments = []
    for (const file of files) attachments.push(await parseAttachmentFile(file))

    return NextResponse.json({
      success: true,
      data: {
        attachments,
      },
    })
    })
  } catch (error) {
    if (error instanceof AttachmentBusyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 429, headers: { 'Retry-After': '5' } })
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '附件解析失败' },
      { status: 500 }
    )
  }
}

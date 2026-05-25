import { NextRequest, NextResponse } from 'next/server'
import { parseAttachmentFile } from '@/lib/attachment-parser'

const MAX_FILES = 12
const MAX_FILE_SIZE = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData
      .getAll('files')
      .filter((item): item is File => item instanceof File)
      .slice(0, MAX_FILES)

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

    const attachments = await Promise.all(files.map(file => parseAttachmentFile(file)))

    return NextResponse.json({
      success: true,
      data: {
        attachments,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '附件解析失败' },
      { status: 500 }
    )
  }
}
import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { promisify } from 'util'
import mammoth from 'mammoth'
import { readSheet } from 'read-excel-file/node'
import {
  BoundedWorkPool,
  WorkQueueCapacityError,
  WorkQueueTimeoutError,
} from './bounded-work-pool.ts'

export type ParsedAttachment = {
  id: string
  name: string
  type: string
  size: number
  textPreview?: string
  parseStatus: 'parsed' | 'metadata' | 'failed'
  error?: string
}

const MAX_PREVIEW_LENGTH = 12000
const TEXT_EXTENSIONS = /\.(txt|md|csv|json|xml|log|yaml|yml|ini|html|css|js|ts|tsx|jsx|sql)$/i
const WORD_EXTENSIONS = /\.(docx)$/i
const PDF_EXTENSIONS = /\.(pdf)$/i
const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|webp|bmp|tif|tiff)$/i
const SPREADSHEET_EXTENSIONS = /\.(xlsx|csv|tsv)$/i
const execFileAsync = promisify(execFile)
const MAX_ARCHIVE_ENTRIES = 256
const MAX_ARCHIVE_ENTRY_BYTES = 10 * 1024 * 1024
const MAX_ARCHIVE_TOTAL_BYTES = 25 * 1024 * 1024
const MAX_ARCHIVE_COMPRESSION_RATIO = 200
const ocrWorkPool = new BoundedWorkPool(2, 8, 10_000)

class SafeAttachmentParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SafeAttachmentParseError'
  }
}

const normalizeText = (value: string) => value
  .replace(/\u0000/g, '')
  .replace(/[\t ]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim()
  .slice(0, MAX_PREVIEW_LENGTH)

const getExtension = (fileName: string) => fileName.toLowerCase().split('.').pop() || ''

const hasPrefix = (buffer: Buffer, signature: readonly number[]) =>
  signature.every((byte, index) => buffer[index] === byte)

const assertPdfSignature = (buffer: Buffer) => {
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new SafeAttachmentParseError('文件内容与 PDF 类型不匹配。')
  }
}

const assertImageSignature = (buffer: Buffer, extension: string) => {
  const signatures = {
    png: hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    jpg: hasPrefix(buffer, [0xff, 0xd8, 0xff]),
    webp: buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP',
    bmp: buffer.subarray(0, 2).toString('ascii') === 'BM',
    tiff: hasPrefix(buffer, [0x49, 0x49, 0x2a, 0x00]) || hasPrefix(buffer, [0x4d, 0x4d, 0x00, 0x2a]),
  }
  const normalizedExtension = extension === 'jpeg' ? 'jpg' : extension === 'tif' ? 'tiff' : extension
  const expected = signatures[normalizedExtension as keyof typeof signatures]
  if (expected === false || (expected === undefined && !Object.values(signatures).some(Boolean))) {
    throw new SafeAttachmentParseError('文件内容与图片类型不匹配。')
  }
}

const inspectOfficeArchive = (buffer: Buffer) => {
  const minimumEocdSize = 22
  const eocdSearchStart = Math.max(0, buffer.length - 65_557)
  let eocdOffset = -1
  for (let offset = buffer.length - minimumEocdSize; offset >= eocdSearchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset
      break
    }
  }
  if (eocdOffset < 0) throw new SafeAttachmentParseError('Office 文件不是有效的 ZIP 容器。')

  const diskNumber = buffer.readUInt16LE(eocdOffset + 4)
  const centralDiskNumber = buffer.readUInt16LE(eocdOffset + 6)
  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  const centralSize = buffer.readUInt32LE(eocdOffset + 12)
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16)
  if (diskNumber !== 0 || centralDiskNumber !== 0 || entryCount === 0 || entryCount > MAX_ARCHIVE_ENTRIES) {
    throw new SafeAttachmentParseError('Office 文件的压缩结构不受支持。')
  }
  if (centralOffset + centralSize > eocdOffset || centralOffset >= buffer.length) {
    throw new SafeAttachmentParseError('Office 文件的中央目录无效。')
  }

  const entries = new Set<string>()
  let totalUncompressedBytes = 0
  let offset = centralOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new SafeAttachmentParseError('Office 文件的压缩条目无效。')
    }

    const flags = buffer.readUInt16LE(offset + 8)
    const compressedBytes = buffer.readUInt32LE(offset + 20)
    const uncompressedBytes = buffer.readUInt32LE(offset + 24)
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const nextOffset = offset + 46 + fileNameLength + extraLength + commentLength
    if (
      nextOffset > buffer.length
      || (flags & 0x1) !== 0
      || compressedBytes === 0xffffffff
      || uncompressedBytes === 0xffffffff
      || uncompressedBytes > MAX_ARCHIVE_ENTRY_BYTES
    ) {
      throw new SafeAttachmentParseError('Office 文件包含不安全或不受支持的压缩条目。')
    }

    totalUncompressedBytes += uncompressedBytes
    if (totalUncompressedBytes > MAX_ARCHIVE_TOTAL_BYTES) {
      throw new SafeAttachmentParseError('Office 文件解压后体积过大。')
    }
    if (
      uncompressedBytes > 1024 * 1024
      && uncompressedBytes / Math.max(compressedBytes, 1) > MAX_ARCHIVE_COMPRESSION_RATIO
    ) {
      throw new SafeAttachmentParseError('Office 文件压缩比异常。')
    }

    const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength).replace(/\\/g, '/')
    if (fileName.startsWith('/') || fileName.split('/').includes('..')) {
      throw new SafeAttachmentParseError('Office 文件包含非法路径。')
    }
    entries.add(fileName)
    offset = nextOffset
  }

  return entries
}

const assertOfficeSignature = (buffer: Buffer, kind: 'docx' | 'xlsx') => {
  if (!hasPrefix(buffer, [0x50, 0x4b])) {
    throw new SafeAttachmentParseError('文件内容与 Office 类型不匹配。')
  }
  const entries = inspectOfficeArchive(buffer)
  const requiredEntry = kind === 'docx' ? 'word/document.xml' : 'xl/workbook.xml'
  if (!entries.has(requiredEntry)) {
    throw new SafeAttachmentParseError(`文件内容不是有效的 ${kind.toUpperCase()} 文档。`)
  }
}

const parseTextFile = async (buffer: Buffer) => normalizeText(buffer.toString('utf8'))

const getPdfToTextPath = () => {
  const candidates = [
    process.env.PDFTOTEXT_PATH?.trim(),
    '/usr/bin/pdftotext',
    '/usr/local/bin/pdftotext',
    path.resolve(process.cwd(), '..', '_tools', 'poppler-25.12.0', 'Library', 'bin', 'pdftotext.exe'),
  ]
  return candidates.find(candidate => candidate && existsSync(candidate)) || ''
}

const getTesseractPath = () => {
  const candidates = [
    process.env.TESSERACT_PATH?.trim(),
    '/usr/bin/tesseract',
    '/usr/local/bin/tesseract',
  ]
  return candidates.find(candidate => candidate && existsSync(candidate)) || ''
}

const parsePdfFile = async (buffer: Buffer) => {
  const pdfToTextPath = getPdfToTextPath()
  if (!pdfToTextPath) {
    throw new SafeAttachmentParseError('PDF 正文解析工具未找到，已保留文件元数据。')
  }

  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'note-prompt-pdf-'))
  const inputPath = path.join(tempDirectory, `${randomUUID()}.pdf`)

  try {
    await writeFile(inputPath, buffer)
    const { stdout } = await execFileAsync(pdfToTextPath, ['-layout', '-enc', 'UTF-8', inputPath, '-'], {
      maxBuffer: 1024 * 1024 * 4,
      timeout: 30000,
    })
    return normalizeText(stdout || '')
  } finally {
    await rm(tempDirectory, { recursive: true, force: true })
  }
}

const parseDocxFile = async (buffer: Buffer) => {
  const result = await mammoth.extractRawText({ buffer })
  return normalizeText(result.value || '')
}

const formatSpreadsheetCell = (value: unknown) => {
  if (value instanceof Date) return value.toISOString()
  if (value === null || value === undefined) return ''
  return String(value).replace(/[\r\n]+/g, ' ')
}

const parseSpreadsheetFile = async (buffer: Buffer, fileName: string) => {
  if (/\.csv$/i.test(fileName) || /\.tsv$/i.test(fileName)) {
    return normalizeText(buffer.toString('utf8'))
  }

  const rows = await readSheet(buffer)
  const text = rows
    .slice(0, 200)
    .map(row => row.slice(0, 50).map(formatSpreadsheetCell).join('\t'))
    .join('\n')

  return normalizeText(text)
}

const parseImageFile = async (buffer: Buffer) => {
  try {
    return await ocrWorkPool.run(async () => {
      const tempDirectory = await mkdtemp(path.join(tmpdir(), 'note-prompt-ocr-'))
      const inputPath = path.join(tempDirectory, `${randomUUID()}.png`)
      const tesseractPath = getTesseractPath()
      const scriptPath = path.resolve(process.cwd(), 'scripts', 'ocr-image.cjs')

      try {
        await writeFile(inputPath, buffer)
        const command = tesseractPath || process.execPath
        const args = tesseractPath
          ? [inputPath, 'stdout', '-l', 'chi_sim+eng']
          : [scriptPath, inputPath]
        const { stdout } = await execFileAsync(command, args, {
          cwd: process.cwd(),
          maxBuffer: 1024 * 1024,
          timeout: 60000,
        })
        return normalizeText(stdout || '')
      } finally {
        await rm(tempDirectory, { recursive: true, force: true })
      }
    })
  } catch (error) {
    if (error instanceof WorkQueueCapacityError || error instanceof WorkQueueTimeoutError) {
      throw new SafeAttachmentParseError('OCR 服务繁忙，请稍后重试。')
    }
    throw error
  }
}

export async function parseAttachmentFile(file: File): Promise<ParsedAttachment> {
  const name = file.name || 'unnamed'
  const type = file.type || 'application/octet-stream'
  const size = file.size
  const base = {
    id: crypto.randomUUID(),
    name,
    type,
    size,
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const extension = getExtension(name)
    const isTextLike = type.startsWith('text/') || TEXT_EXTENSIONS.test(name)
    const isPdf = type === 'application/pdf' || PDF_EXTENSIONS.test(name)
    const isWord = type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || WORD_EXTENSIONS.test(name)
    const isImage = type.startsWith('image/') || IMAGE_EXTENSIONS.test(name)
    const isSpreadsheet = SPREADSHEET_EXTENSIONS.test(name) || [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/tab-separated-values',
    ].includes(type)

    let textPreview = ''
    if (isPdf) {
      assertPdfSignature(buffer)
      textPreview = await parsePdfFile(buffer)
    } else if (isWord) {
      assertOfficeSignature(buffer, 'docx')
      textPreview = await parseDocxFile(buffer)
    } else if (isImage) {
      assertImageSignature(buffer, extension)
      textPreview = await parseImageFile(buffer)
    } else if (isSpreadsheet) {
      if (/\.xlsx$/i.test(name) || type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        assertOfficeSignature(buffer, 'xlsx')
      }
      textPreview = await parseSpreadsheetFile(buffer, name)
    } else if (isTextLike || ['json', 'xml'].includes(extension)) {
      textPreview = await parseTextFile(buffer)
    }

    if (!textPreview) {
      return {
        ...base,
        parseStatus: 'metadata',
        error: '暂不支持提取该文件正文，已保留文件元数据。',
      }
    }

    return {
      ...base,
      textPreview,
      parseStatus: 'parsed',
    }
  } catch (error) {
    return {
      ...base,
      parseStatus: 'failed',
      error: error instanceof SafeAttachmentParseError ? error.message : '附件解析失败',
    }
  }
}

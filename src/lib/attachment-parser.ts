import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { promisify } from 'util'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'

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
const SPREADSHEET_EXTENSIONS = /\.(xlsx|xls|csv|tsv)$/i
const execFileAsync = promisify(execFile)

const normalizeText = (value: string) => value
  .replace(/\u0000/g, '')
  .replace(/[\t ]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim()
  .slice(0, MAX_PREVIEW_LENGTH)

const getExtension = (fileName: string) => fileName.toLowerCase().split('.').pop() || ''

const parseTextFile = async (buffer: Buffer) => normalizeText(buffer.toString('utf8'))

const getPdfToTextPath = () => {
  const toolPath = path.resolve(process.cwd(), '..', '_tools', 'poppler-25.12.0', 'Library', 'bin', 'pdftotext.exe')
  return existsSync(toolPath) ? toolPath : ''
}

const parsePdfFile = async (buffer: Buffer) => {
  const pdfToTextPath = getPdfToTextPath()
  if (!pdfToTextPath) {
    throw new Error('PDF 正文解析工具未找到，已保留文件元数据。')
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

const parseSpreadsheetFile = (buffer: Buffer, fileName: string) => {
  if (/\.csv$/i.test(fileName) || /\.tsv$/i.test(fileName)) {
    return normalizeText(buffer.toString('utf8'))
  }

  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheets = workbook.SheetNames.slice(0, 8).map(sheetName => {
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    return `# ${sheetName}\n${csv}`
  })

  return normalizeText(sheets.join('\n\n'))
}

const parseImageFile = async (buffer: Buffer) => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'note-prompt-ocr-'))
  const inputPath = path.join(tempDirectory, `${randomUUID()}.png`)
  const scriptPath = path.resolve(process.cwd(), 'scripts', 'ocr-image.cjs')

  try {
    await writeFile(inputPath, buffer)
    const { stdout } = await execFileAsync(process.execPath, [scriptPath, inputPath], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024,
      timeout: 60000,
    })
    return normalizeText(stdout || '')
  } finally {
    await rm(tempDirectory, { recursive: true, force: true })
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
      'application/vnd.ms-excel',
      'text/csv',
      'text/tab-separated-values',
    ].includes(type)

    let textPreview = ''
    if (isPdf) {
      textPreview = await parsePdfFile(buffer)
    } else if (isWord) {
      textPreview = await parseDocxFile(buffer)
    } else if (isImage) {
      textPreview = await parseImageFile(buffer)
    } else if (isSpreadsheet) {
      textPreview = parseSpreadsheetFile(buffer, name)
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
      error: error instanceof Error ? error.message : '附件解析失败',
    }
  }
}
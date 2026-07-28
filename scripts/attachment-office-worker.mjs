import { parentPort, workerData } from 'node:worker_threads'
import mammoth from 'mammoth'
import { readSheet } from 'read-excel-file/node'

const OUTPUT_MAX_CHARS = 12_000

function normalizeText(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, OUTPUT_MAX_CHARS)
}

function formatSpreadsheetCell(value) {
  if (value instanceof Date) return value.toISOString()
  if (value === null || value === undefined) return ''
  return String(value).replace(/[\r\n]+/g, ' ')
}

async function parseDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer })
  return normalizeText(result.value)
}

async function parseXlsx(buffer) {
  const rows = await readSheet(buffer)
  return normalizeText(
    rows
      .slice(0, 200)
      .map(row => row.slice(0, 50).map(formatSpreadsheetCell).join('\t'))
      .join('\n'),
  )
}

async function main() {
  if (
    !parentPort
    || !workerData
    || (workerData.kind !== 'docx' && workerData.kind !== 'xlsx')
    || !(workerData.payload instanceof ArrayBuffer)
  ) {
    throw new Error('Invalid Office worker request')
  }

  const buffer = Buffer.from(workerData.payload)
  const output = workerData.kind === 'docx'
    ? await parseDocx(buffer)
    : await parseXlsx(buffer)

  parentPort.postMessage({ type: 'result', ok: true, output })
}

main().catch(() => {
  parentPort?.postMessage({ type: 'result', ok: false, error: 'parse_failed' })
})

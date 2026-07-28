import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ATTACHMENT_OFFICE_OUTPUT_MAX_CHARS,
  ATTACHMENT_OFFICE_WORKER_RESOURCE_LIMITS,
  ATTACHMENT_OFFICE_WORKER_TIMEOUT_MS,
  AttachmentOfficeWorkerError,
  parseOfficeAttachmentInWorker,
} from '../src/lib/attachment-office-worker.ts'

const CRC32_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  return crc >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createZip(entries) {
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const [name, value] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name)
    const data = Buffer.from(value)
    const checksum = crc32(data)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(data.length, 18)
    localHeader.writeUInt32LE(data.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localParts.push(localHeader, nameBuffer, data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(data.length, 20)
    centralHeader.writeUInt32LE(data.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt32LE(offset, 42)
    centralParts.push(centralHeader, nameBuffer)

    offset += localHeader.length + nameBuffer.length + data.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(entries).length, 8)
  end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...localParts, centralDirectory, end])
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function createDocx(text) {
  return createZip({
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p></w:body>
      </w:document>`,
  })
}

function createXlsx() {
  return createZip({
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
        <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
      </Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
      </Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8"?>
      <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <numFmts count="0"/>
        <fonts count="1"><font/></fonts>
        <fills count="1"><fill/></fills>
        <borders count="1"><border/></borders>
        <cellStyleXfs count="1"><xf/></cellStyleXfs>
        <cellXfs count="1"><xf xfId="0"/></cellXfs>
      </styleSheet>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>
          <row r="1">
            <c r="A1" t="inlineStr"><is><t>Alpha</t></is></c>
            <c r="B1"><v>42</v></c>
          </row>
          <row r="2">
            <c r="A2" t="inlineStr"><is><t>Beta</t></is></c>
            <c r="B2" t="inlineStr"><is><t>ready</t></is></c>
          </row>
        </sheetData>
      </worksheet>`,
  })
}

function hasWorkerErrorCode(code) {
  return error => error instanceof AttachmentOfficeWorkerError
    && error.code === code
    && !error.cause
}

test('Office parsing exposes fixed resource, time, and output ceilings', () => {
  assert.equal(ATTACHMENT_OFFICE_WORKER_TIMEOUT_MS, 30_000)
  assert.equal(ATTACHMENT_OFFICE_OUTPUT_MAX_CHARS, 12_000)
  assert.deepEqual(ATTACHMENT_OFFICE_WORKER_RESOURCE_LIMITS, {
    maxOldGenerationSizeMb: 128,
    maxYoungGenerationSizeMb: 32,
    stackSizeMb: 4,
  })
  assert.equal(Object.isFrozen(ATTACHMENT_OFFICE_WORKER_RESOURCE_LIMITS), true)
})

test('Office worker failures expose a finite, stable error taxonomy', () => {
  const messages = {
    invalid_request: 'Office worker request is invalid',
    aborted: 'Office worker request was aborted',
    timeout: 'Office worker deadline exceeded',
    parse_failed: 'Office document parsing failed',
    worker_failed: 'Office worker failed',
    protocol_error: 'Office worker returned an invalid response',
  }

  for (const [code, message] of Object.entries(messages)) {
    const error = new AttachmentOfficeWorkerError(code)
    assert.equal(error.name, 'AttachmentOfficeWorkerError')
    assert.equal(error.code, code)
    assert.equal(error.message, message)
    assert.equal(error.cause, undefined)
  }
})

test('DOCX parsing runs in the worker and returns normalized text', async () => {
  const output = await parseOfficeAttachmentInWorker(
    'docx',
    createDocx('  Worker-isolated   document  '),
  )

  assert.equal(output, 'Worker-isolated document')
})

test('XLSX parsing runs in the worker and returns bounded cell text', async () => {
  const output = await parseOfficeAttachmentInWorker('xlsx', createXlsx())

  assert.match(output, /Alpha\s+42/)
  assert.match(output, /Beta\s+ready/)
})

test('worker output is truncated at the fixed character ceiling', async () => {
  const output = await parseOfficeAttachmentInWorker(
    'docx',
    createDocx('x'.repeat(ATTACHMENT_OFFICE_OUTPUT_MAX_CHARS + 500)),
  )

  assert.equal(output.length, ATTACHMENT_OFFICE_OUTPUT_MAX_CHARS)
  assert.equal(output, 'x'.repeat(ATTACHMENT_OFFICE_OUTPUT_MAX_CHARS))
})

test('invalid requests and malformed Office documents use fixed error classes', async () => {
  await assert.rejects(
    parseOfficeAttachmentInWorker('pdf', Buffer.from('data')),
    hasWorkerErrorCode('invalid_request'),
  )
  await assert.rejects(
    parseOfficeAttachmentInWorker('docx', Buffer.from('not a zip')),
    hasWorkerErrorCode('parse_failed'),
  )
})

test('a pre-aborted signal never starts useful worker work', async () => {
  const controller = new AbortController()
  controller.abort()

  await assert.rejects(
    parseOfficeAttachmentInWorker('docx', createDocx('ignored'), {
      signal: controller.signal,
    }),
    hasWorkerErrorCode('aborted'),
  )
})

test('an in-flight abort terminates the worker without detaching caller memory', async () => {
  const controller = new AbortController()
  const input = createDocx('cancel me')
  const firstByte = input[0]
  const parsing = parseOfficeAttachmentInWorker('docx', input, {
    signal: controller.signal,
  })

  controller.abort()

  await assert.rejects(parsing, hasWorkerErrorCode('aborted'))
  assert.equal(input.length > 0, true)
  assert.equal(input[0], firstByte)
})

test('an expired caller deadline rejects deterministically without timing assumptions', async () => {
  await assert.rejects(
    parseOfficeAttachmentInWorker('xlsx', createXlsx(), {
      deadlineAt: 0,
    }),
    hasWorkerErrorCode('timeout'),
  )
})

test('a non-finite deadline maps to the stable invalid-request error', async () => {
  await assert.rejects(
    parseOfficeAttachmentInWorker('docx', createDocx('invalid'), {
      deadlineAt: Number.POSITIVE_INFINITY,
    }),
    hasWorkerErrorCode('invalid_request'),
  )
})

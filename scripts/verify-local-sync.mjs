import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, rmdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import jwt from 'jsonwebtoken'
import sharp from 'sharp'
import * as XLSX from 'xlsx'

// Use Mammoth's existing ZIP dependency to create a real, minimal OOXML file.
const require = createRequire(import.meta.url)
const JSZip = createRequire(require.resolve('mammoth'))('jszip')

// Local production-build checks only. Never use a real account, database or
// model request; signed fixture roles exercise the existing authentication API.
const secret = randomBytes(48).toString('hex')
const port = Number(process.env.SYNC_TEST_PORT || 3316)
const origin = `http://127.0.0.1:${port}`
const token = role => jwt.sign({ userId: 98765, username: 'sync-fixture', userType: role }, secret, { expiresIn: '5m' })
const member = { Authorization: `Bearer ${token('free')}` }
const admin = { Authorization: `Bearer ${token('admin')}` }
let server
let fixtureDirectory
let logs = ''
let checks = 0

async function request(label, path, init, status, timeout = 15000) {
  const response = await fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(timeout) })
  assert.equal(response.status, status, label)
  checks++
  return response
}

async function attachmentFixtures() {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Name', 'Value'], ['Hello spreadsheet', 42],
  ]), 'Fixture')
  const docx = new JSZip()
  docx.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  docx.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  docx.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello DOCX attachment 45</w:t></w:r></w:p></w:body></w:document>')
  const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="180"><rect width="640" height="180" fill="white"/><text x="320" y="125" text-anchor="middle" font-family="Arial,DejaVu Sans,sans-serif" font-size="96" font-weight="700" fill="black">HELLO</text></svg>')).png().toBuffer()
  return [
    { name: 'sample.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }), text: '# Fixture\nName,Value\nHello spreadsheet,42' },
    { name: 'sample.xls', type: 'application/vnd.ms-excel', body: XLSX.write(workbook, { bookType: 'biff8', type: 'buffer' }), text: '# Fixture\nName,Value\nHello spreadsheet,42' },
    { name: 'sample.csv', type: 'text/csv', body: 'Name,Value\nHello CSV,43', text: 'Name,Value\nHello CSV,43' },
    { name: 'sample.tsv', type: 'text/tab-separated-values', body: 'Name\tValue\nHello TSV\t44', text: 'Name Value\nHello TSV 44' },
    { name: 'sample.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: await docx.generateAsync({ type: 'nodebuffer' }), text: 'Hello DOCX attachment 45' },
    { name: 'hello.png', type: 'image/png', body: png, text: /\bHELLO\b/i },
  ]
}

try {
  const fixtures = await attachmentFixtures()
  // The optimizer needs a local source image. Create it before Next inventories
  // public files, and remove this random test directory when the server stops.
  fixtureDirectory = await mkdtemp(path.join(process.cwd(), 'public', 'sync-verify-'))
  await writeFile(path.join(fixtureDirectory, 'hello.png'), fixtures.at(-1).body)
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, JWT_SECRET: secret, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', chunk => { logs = (logs + chunk).slice(-8000) })
  server.stderr.on('data', chunk => { logs = (logs + chunk).slice(-8000) })
  server.on('error', error => { logs += error.message })
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Local production server exited before readiness')
    try { ready = (await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1000) })).ok } catch { /* startup */ }
    if (ready) break
    await delay(200)
  }
  assert.ok(ready, 'local production server readiness')
  await request('optimizer page', '/optimizer', {}, 200)
  await request('anonymous provider read', '/api/v1/provider-config', {}, 401)
  await request('anonymous provider write before parsing', '/api/v1/provider-config', { method: 'POST', body: 'invalid-json' }, 401)
  await request('member provider read', '/api/v1/provider-config', { headers: member }, 403)
  await request('member provider write before parsing', '/api/v1/provider-config', { method: 'POST', headers: member, body: 'invalid-json' }, 403)
  await request('anonymous attachment before multipart parsing', '/api/v1/attachments/parse', { method: 'POST', body: 'invalid-multipart' }, 401)
  await request('anonymous model probe', '/api/v1/ai/diagnostics', { method: 'POST', body: '{"mode":"probe"}' }, 401)
  await request('member cannot spend quota through model probe', '/api/v1/ai/diagnostics', {
    method: 'POST', headers: { ...member, 'Content-Type': 'application/json' }, body: '{"mode":"probe"}',
  }, 403)
  const configured = await (await request('admin provider read', '/api/v1/provider-config', { headers: admin }, 200)).json()
  assert.ok(configured.success && configured.data.providers.length > 0)
  assert.ok(configured.data.providers.every(provider => !Object.hasOwn(provider, 'apiKey')))
  await request('invalid provider rejected without writing config', '/api/v1/provider-config', {
    method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: '{"provider":"__proto__"}',
  }, 400)
  await request('empty multipart rejected', '/api/v1/attachments/parse', { method: 'POST', headers: member, body: new FormData() }, 400)
  const files = new FormData()
  files.append('files', new File(['Hello\n世界'], 'sample.txt', { type: 'text/plain' }))
  files.append('files', new File(['{"value":1}'], 'sample.json', { type: 'application/json' }))
  const parsed = await (await request('authenticated attachment parsing', '/api/v1/attachments/parse', { method: 'POST', headers: member, body: files }, 200)).json()
  assert.equal(parsed.data.attachments.length, 2)
  assert.equal(parsed.data.attachments[0].textPreview, 'Hello\n世界')
  assert.ok(parsed.data.attachments.every(file => file.parseStatus === 'parsed'))
  const excessive = new FormData()
  for (let i = 0; i < 13; i++) excessive.append('files', new File(['x'], `${i}.txt`, { type: 'text/plain' }))
  await request('excess file count rejected', '/api/v1/attachments/parse', { method: 'POST', headers: member, body: excessive }, 400)
  for (const fixture of fixtures) {
    const form = new FormData()
    form.append('files', new File([fixture.body], fixture.name, { type: fixture.type }))
    // OCR may download its free language data on a first run. Keep the parser's
    // own 60-second subprocess limit; allow time for the enclosing HTTP call.
    const result = await (await request(`real ${fixture.name} parsing`, '/api/v1/attachments/parse', { method: 'POST', headers: member, body: form }, 200, 90000)).json()
    assert.equal(result.success, true, `${fixture.name} response`)
    assert.equal(result.data.attachments.length, 1, `${fixture.name} count`)
    const attachment = result.data.attachments[0]
    assert.equal(attachment.parseStatus, 'parsed', `${fixture.name}: ${attachment.error || 'missing parsed status'}`)
    if (fixture.text instanceof RegExp) assert.match(attachment.textPreview, fixture.text, fixture.name)
    else assert.equal(attachment.textPreview, fixture.text, fixture.name)
  }
  const imageSource = `/${path.basename(fixtureDirectory)}/hello.png`
  const image = await request('Next image resize with installed sharp', `/_next/image?url=${encodeURIComponent(imageSource)}&w=64&q=75`, { headers: { Accept: 'image/webp' } }, 200)
  assert.match(image.headers.get('content-type') || '', /^image\//)
  const imageMetadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata()
  assert.equal(imageMetadata.width, 64, 'optimized image width')
  assert.ok(imageMetadata.height > 0, 'optimized image height')
  console.log(JSON.stringify({ pass: true, httpChecks: checks, attachmentFormats: ['txt', 'json', 'xlsx', 'xls-biff8', 'csv', 'tsv', 'docx', 'png-ocr'], imageOptimizerWidth: imageMetadata.width, externalModelCalls: 0, databaseQueries: 0 }))
} catch (error) {
  console.error(error.message)
  console.error(logs)
  process.exitCode = 1
} finally {
  if (server && server.exitCode === null) {
    const closed = once(server, 'exit')
    server.kill()
    await Promise.race([closed, delay(5000)])
    if (server.exitCode === null) server.kill('SIGKILL')
  }
  if (fixtureDirectory) {
    await rm(path.join(fixtureDirectory, 'hello.png'), { force: true })
    await rmdir(fixtureDirectory)
  }
}

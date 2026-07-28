import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const scheduler = await readFile(
  new URL('../src/lib/attachment-parse-scheduler.ts', import.meta.url),
  'utf8',
)
const service = await readFile(
  new URL('../src/lib/attachment-parse-service.ts', import.meta.url),
  'utf8',
)
const route = await readFile(
  new URL('../src/app/api/v1/attachments/parse/route.ts', import.meta.url),
  'utf8',
)

test('attachment admission is bounded globally and per account', () => {
  assert.match(scheduler, /globalConcurrency = options\.globalConcurrency \?\? 2/)
  assert.match(scheduler, /globalMaxQueued = options\.globalMaxQueued \?\? 4/)
  assert.match(scheduler, /this\.accountConcurrency = options\.accountConcurrency \?\? 1/)
  assert.match(scheduler, /this\.accountMaxQueued = options\.accountMaxQueued \?\? 1/)
  assert.match(scheduler, /this\.maxWaitMs = options\.maxWaitMs \?\? 3_000/)
  assert.match(scheduler, /entry\.pool\.run\(\(\) => this\.runGlobal\(work, signal\), signal\)/)
})

test('request cancellation reaches admission, body reading, and every file boundary', () => {
  assert.match(service, /scheduler\.run\(accountId,[\s\S]*readLimitedBody\([\s\S]*\{ signal \}/)
  assert.match(service, /for \(const file of files\)[\s\S]*throwIfClientAborted\(signal\)[\s\S]*parseFile\(file\)[\s\S]*throwIfClientAborted\(signal\)/)
  assert.match(service, /formData\(\)[\s\S]*RequestPolicyError\('multipart\/form-data 请求格式无效', 400\)/)
  assert.match(service, /\}, signal\)/)
  assert.doesNotMatch(service, /80_000|AttachmentParseDeadlineError|Promise\.race/)
})

test('the attachment route is a thin authenticated adapter with stable overload responses', () => {
  const authIndex = route.indexOf("requireAIUser(request, 'attachments')")
  const serviceIndex = route.indexOf('parseAttachmentRequest(request, auth.user.id)')
  assert.ok(authIndex >= 0 && serviceIndex > authIndex)
  assert.doesNotMatch(route, /readLimitedBody\(|formData\(|parseAttachmentFile\(/)
  assert.match(route, /error\.scope === 'account'[\s\S]*status: accountBusy \? 429 : 503/)
  assert.match(route, /headers: \{ 'Retry-After': RETRY_AFTER_SECONDS \}/)
  assert.doesNotMatch(route, /AttachmentParseDeadlineError|status: 504/)
  assert.match(route, /AttachmentParseClientAbortedError[\s\S]*status: 499/)
})

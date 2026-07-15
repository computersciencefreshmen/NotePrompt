import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_AI_ATTACHMENTS,
  MAX_AI_JSON_BODY_BYTES,
  normalizeProviderBaseURL,
  parseAIRequestAttachments,
  parseConversationHistory,
  readLimitedJson,
  RequestPolicyError,
} from '../src/lib/ai-runtime-policy.ts'

test('provider base URLs are restricted to the provider HTTPS host', () => {
  assert.equal(
    normalizeProviderBaseURL('deepseek', 'https://api.deepseek.com/v1/'),
    'https://api.deepseek.com/v1',
  )

  for (const candidate of [
    'http://api.deepseek.com/v1',
    'https://api.deepseek.com.evil.example/v1',
    'https://user:pass@api.deepseek.com/v1',
    'https://api.deepseek.com:8443/v1',
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
  ]) {
    assert.throws(
      () => normalizeProviderBaseURL('deepseek', candidate),
      RequestPolicyError,
    )
  }
})

test('limited JSON reader rejects the actual streamed size', async () => {
  const oversizedChunk = new Uint8Array(MAX_AI_JSON_BODY_BYTES + 1).fill(32)
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(oversizedChunk)
      controller.close()
    },
  })
  const request = new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '1' },
    body,
    duplex: 'half',
  })

  await assert.rejects(() => readLimitedJson(request), error => {
    assert.ok(error instanceof RequestPolicyError)
    assert.equal(error.status, 413)
    return true
  })
})

test('attachment and conversation limits reject oversized context', () => {
  const attachment = { name: 'a.txt', type: 'text/plain', size: 1, textPreview: 'ok' }
  assert.throws(
    () => parseAIRequestAttachments(Array.from({ length: MAX_AI_ATTACHMENTS + 1 }, () => attachment)),
    RequestPolicyError,
  )

  assert.throws(
    () => parseConversationHistory([{ role: 'user', content: 'x'.repeat(10_001) }]),
    RequestPolicyError,
  )
})

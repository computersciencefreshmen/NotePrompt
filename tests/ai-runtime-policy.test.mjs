import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_AI_ATTACHMENTS,
  MAX_AI_JSON_BODY_BYTES,
  normalizeProviderBaseURL,
  parseAIOptimizationPreferences,
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

  assert.equal(
    normalizeProviderBaseURL('xiaomi', 'https://api.xiaomimimo.com/v1/'),
    'https://api.xiaomimimo.com/v1',
  )
  for (const tokenPlanHost of [
    'https://token-plan-cn.xiaomimimo.com/v1',
    'https://token-plan-sgp.xiaomimimo.com/v1',
    'https://token-plan-ams.xiaomimimo.com/v1',
  ]) {
    assert.throws(
      () => normalizeProviderBaseURL('xiaomi', tokenPlanHost),
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

test('optimization preferences are strict bounded enums', () => {
  assert.deepEqual(parseAIOptimizationPreferences({
    mode: 'professional',
    style: 'structured',
    tone: 'professional',
    outputFormat: 'markdown',
    constraints: ['保留所有事实'],
  }), {
    mode: 'professional',
    style: 'structured',
    tone: 'professional',
    outputFormat: 'markdown',
    constraints: ['保留所有事实'],
  })

  assert.throws(() => parseAIOptimizationPreferences({ style: 'x'.repeat(200_000) }), RequestPolicyError)
  assert.throws(() => parseAIOptimizationPreferences({ constraints: Array.from({ length: 13 }, () => 'x') }), RequestPolicyError)
  assert.throws(() => parseAIOptimizationPreferences({ constraints: ['x'.repeat(501)] }), RequestPolicyError)
})

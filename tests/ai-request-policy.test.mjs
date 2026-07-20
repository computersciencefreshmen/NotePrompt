import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  buildAIChatCompletionBody,
  createAIIncompleteResponse,
  createAIProviderFailure,
  isCompleteAIFinishReason,
  isCompleteAIStreamTermination,
  MAX_AI_PROVIDER_RESPONSE_BYTES,
  modelControlsSampling,
  readLimitedAIProviderJSON,
} from '../src/lib/ai-request-policy.ts'

const messages = [
  { role: 'system', content: 'system' },
  { role: 'user', content: 'prompt' },
]
const projectRoot = path.resolve(import.meta.dirname, '..')
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')

test('Kimi K3 and K2 models omit provider-controlled sampling parameters', () => {
  for (const model of ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6', 'kimi-k2.5']) {
    assert.equal(modelControlsSampling('kimi', model), true)
    const body = buildAIChatCompletionBody({
      provider: 'kimi',
      model,
      messages,
      maxTokens: 4096,
      temperature: 0.7,
      topP: 0.9,
    })

    assert.equal('temperature' in body, false)
    assert.equal('top_p' in body, false)
  }
})

test('other providers retain bounded sampling parameters and provider token shape', () => {
  const miniMaxBody = buildAIChatCompletionBody({
    provider: 'minimax',
    model: 'MiniMax-M3',
    messages,
    maxTokens: 999999,
    temperature: 2,
    topP: 4,
  })

  assert.equal(miniMaxBody.max_completion_tokens, 2048)
  assert.equal(miniMaxBody.temperature, 1)
  assert.equal(miniMaxBody.top_p, 1)
  assert.equal(miniMaxBody.reasoning_split, true)

  const qwenBody = buildAIChatCompletionBody({
    provider: 'qwen',
    model: 'qwen3.7-max',
    messages,
    maxTokens: 999999,
    temperature: -1,
    topP: 0,
  })

  assert.equal(qwenBody.max_tokens, 8192)
  assert.equal(qwenBody.temperature, 0.1)
  assert.equal(qwenBody.top_p, 0.1)

  const xiaomiBody = buildAIChatCompletionBody({
    provider: 'xiaomi',
    model: 'mimo-v2.5',
    messages,
    maxTokens: 512,
    temperature: 0.7,
  })
  assert.equal(xiaomiBody.max_completion_tokens, 512)
  assert.deepEqual(xiaomiBody.thinking, { type: 'disabled' })
})

test('Kimi K3 uses its current completion-token field and fixed sampling contract', () => {
  const body = buildAIChatCompletionBody({
    provider: 'kimi',
    model: 'kimi-k3',
    messages,
    maxTokens: 999999,
    temperature: 0.7,
    topP: 0.9,
  })

  assert.equal(body.max_completion_tokens, 8192)
  assert.equal('max_tokens' in body, false)
  assert.equal('temperature' in body, false)
  assert.equal('top_p' in body, false)
})

test('fixed-temperature models omit temperature without discarding top_p', () => {
  const body = buildAIChatCompletionBody({
    provider: 'some-provider',
    model: 'fixed-model',
    messages,
    maxTokens: 100,
    temperature: 0.7,
    topP: 0.8,
    fixedTemperature: true,
  })

  assert.equal('temperature' in body, false)
  assert.equal(body.top_p, 0.8)
})

test('provider failure payload is structured and contains no upstream response body', () => {
  assert.deepEqual(createAIProviderFailure({
    provider: 'kimi',
    model: 'kimi-k3',
    status: 503,
  }), {
    type: 'error',
    code: 'AI_PROVIDER_REQUEST_FAILED',
    message: '所选模型暂时不可用，请稍后重试或手动选择其他模型。',
    provider: 'kimi',
    model: 'kimi-k3',
    status: 503,
    retryable: true,
  })
})

test('incomplete provider responses have a fixed non-success contract', () => {
  assert.equal(isCompleteAIFinishReason('stop'), true)
  assert.equal(isCompleteAIFinishReason(undefined), false)
  assert.equal(isCompleteAIFinishReason(null), false)
  assert.equal(isCompleteAIFinishReason('length'), false)
  assert.equal(isCompleteAIFinishReason('content_filter'), false)
  assert.equal(isCompleteAIStreamTermination(undefined, true), true)
  assert.equal(isCompleteAIStreamTermination(null, true), true)
  assert.equal(isCompleteAIStreamTermination(undefined, false), false)
  assert.equal(isCompleteAIStreamTermination('length', true), false)
  assert.equal(createAIIncompleteResponse({ provider: 'qwen', model: 'qwen3.7-plus' }).code, 'AI_PROVIDER_INCOMPLETE_RESPONSE')
})

test('non-stream provider JSON is bounded before parsing', async () => {
  const valid = new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
  assert.equal((await readLimitedAIProviderJSON(valid)).choices[0].message.content, 'ok')

  const oversized = new Response(new Uint8Array(MAX_AI_PROVIDER_RESPONSE_BYTES + 1))
  await assert.rejects(() => readLimitedAIProviderJSON(oversized), /exceeded the application limit/)
})

test('all remote text routes use the shared request policy', () => {
  for (const route of [
    'src/app/api/v1/ai/generate-prompt/route.ts',
    'src/app/api/v1/ai/optimize-prompt/route.ts',
    'src/app/api/v1/ai/optimize-prompt-stream/route.ts',
    'src/app/api/v1/ai/optimize-prompt-multiturn/route.ts',
    'src/app/api/v1/ai/diagnostics/route.ts',
  ]) {
    assert.match(read(route), /buildAIChatCompletionBody\(/, route)
  }
})

test('stream failures never forward a prompt to a fallback provider', () => {
  const source = read('src/app/api/v1/ai/optimize-prompt-stream/route.ts')

  assert.doesNotMatch(source, /FALLBACK_AI_(?:MODEL|PROVIDER)/)
  assert.doesNotMatch(source, /fallbackCandidates/)
  assert.doesNotMatch(source, /moonshot-v1/)
  assert.doesNotMatch(source, /buildLocalOptimizedPrompt|model: 'rule-based-v2'/)
  assert.doesNotMatch(source, /provider === 'local' \? 'qwen'/)
  assert.match(source, /createAIProviderFailure\(\{ provider: effectiveProvider, model, status: response\.status \}\)/)
  assert.equal((source.match(/await fetch/g) || []).length, 1, 'one optimization must dispatch at most one provider request')
})

test('provider timeouts cover response bodies instead of only response headers', () => {
  const stream = read('src/app/api/v1/ai/optimize-prompt-stream/route.ts')
  const streamTimeout = stream.indexOf('providerTimeoutId = setTimeout')
  const streamReader = stream.indexOf('response.body!.getReader()')
  const streamCleanup = stream.lastIndexOf('clearTimeout(providerTimeoutId)')
  assert.ok(streamTimeout >= 0 && streamTimeout < streamReader)
  assert.ok(streamReader < streamCleanup)

  const multiTurn = read('src/app/api/v1/ai/optimize-prompt-multiturn/route.ts')
  const multiTurnBody = multiTurn.indexOf('await readLimitedAIProviderJSON')
  const multiTurnCleanup = multiTurn.indexOf('clearTimeout(timeoutId)', multiTurnBody)
  assert.ok(multiTurnBody >= 0 && multiTurnBody < multiTurnCleanup)
})

test('remote optimization routes never disguise provider failures as local success', () => {
  for (const route of [
    'src/app/api/v1/ai/optimize-prompt/route.ts',
    'src/app/api/v1/ai/optimize-prompt-stream/route.ts',
    'src/app/api/v1/ai/optimize-prompt-multiturn/route.ts',
  ]) {
    const source = read(route)
    assert.doesNotMatch(source, /rule-based|buildLocal|provider\s*===\s*['"]local['"]|\/api\/tags/, route)
  }
})

test('routes resolve omitted models from the selected provider and status honors user runtime config', () => {
  for (const route of [
    'src/app/api/v1/ai/generate-prompt/route.ts',
    'src/app/api/v1/ai/optimize-prompt/route.ts',
    'src/app/api/v1/ai/optimize-prompt-stream/route.ts',
  ]) {
    assert.match(read(route), /getDefaultAIModel\(provider\)/, route)
  }

  const status = read('src/app/api/v1/ai/status/route.ts')
  assert.match(status, /getUserProviderRuntimeConfig\(auth\.user\.id, provider\)/)
  assert.match(status, /validateAIModel\(provider, model, runtimeConfig \|\| undefined\)/)
})

test('diagnostics selects a current fast model from the canonical catalog', () => {
  const source = read('src/app/api/v1/ai/diagnostics/route.ts')

  assert.match(source, /AI_MODEL_CATALOG/)
  assert.match(source, /model\.tier === 'fast'/)
  assert.match(source, /model\.tier === 'balanced'/)
  assert.doesNotMatch(source, /moonshot-v1|mimo-v2-flash|deepseek-chat|qwen-turbo/)
})

test('optimizer controls are locked while a request is active', () => {
  const optimizer = read('src/components/PromptOptimizerV2.tsx')
  const dialog = read('src/components/AIOptimizeDialog.tsx')

  assert.match(optimizer, /const runInProgress = optimizing \|\| refining/)
  assert.match(optimizer, /<Select value=\{provider\}[^>]+disabled=\{runInProgress\}/)
  assert.match(optimizer, /<Select value=\{model\}[^>]+disabled=\{runInProgress\}/)
  assert.match(optimizer, /label="Max Tokens"[\s\S]{0,500}disabled=\{runInProgress\}/)
  assert.match(dialog, /<Select value=\{selectedProvider\}[^>]+disabled=\{isLoading\}/)
  assert.match(dialog, /<Select value=\{selectedModel\}[^>]+disabled=\{isLoading\}/)
  assert.match(dialog, /if \(requestInFlightRef\.current\) return/)
  assert.match(dialog, /setSelectedModel\(getDefaultAIModel\(provider\)\)/)
  assert.match(optimizer, /getAIModelParameterPolicy\(provider, model\)/)
  assert.match(optimizer, /!selectedParameterPolicy\.samplingEditable/)
  assert.match(optimizer, /max=\{selectedParameterPolicy\.maxOutputTokens\}/)
  assert.match(optimizer, /onError: message => \{[\s\S]{0,120}setOptimizedPrompt\(''\)/)
  assert.match(dialog, /onError: \(message\) => \{[\s\S]{0,160}setOptimizedPrompt\(''\)/)
})

test('stream clients require one terminal event before accepting EOF', () => {
  const client = read('src/lib/api.ts')
  assert.match(client, /let terminalEventReceived = false/)
  assert.match(client, /case 'done':[\s\S]{0,80}terminalEventReceived = true/)
  assert.match(client, /case 'error':[\s\S]{0,80}terminalEventReceived = true/)
  assert.match(client, /if \(!terminalEventReceived\) callbacks\.onError/)
})

test('all optimization routes reject incomplete finish reasons', () => {
  for (const route of [
    'src/app/api/v1/ai/generate-prompt/route.ts',
    'src/app/api/v1/ai/optimize-prompt/route.ts',
    'src/app/api/v1/ai/optimize-prompt-multiturn/route.ts',
  ]) {
    const source = read(route)
    assert.match(source, /isCompleteAIFinishReason\(/, route)
    assert.match(source, /createAIIncompleteResponse\(/, route)
  }

  const stream = read('src/app/api/v1/ai/optimize-prompt-stream/route.ts')
  assert.match(stream, /isCompleteAIStreamTermination\(finishReason, receivedDoneMarker\)/)
  assert.match(stream, /createAIIncompleteResponse\(/)
})

test('diagnostics never returns an upstream response body', () => {
  const source = read('src/app/api/v1/ai/diagnostics/route.ts')
  assert.doesNotMatch(source, /await response\.text\(\)/)
  assert.match(source, /diagnosticFailureMessage\(status, response\.status\)/)
  assert.match(source, /PROBE_CACHE_MAX_ENTRIES/)
})

test('billable non-stream routes commit immediately before provider dispatch', () => {
  for (const route of [
    'src/app/api/v1/ai/generate-prompt/route.ts',
    'src/app/api/v1/ai/optimize-prompt/route.ts',
    'src/app/api/v1/ai/optimize-prompt-multiturn/route.ts',
  ]) {
    const source = read(route)
    const commit = source.indexOf('reservation.markProviderCallStarted()')
    const dispatch = source.indexOf('await fetch', commit)
    assert.ok(commit >= 0, route)
    assert.ok(dispatch > commit, route)
  }
})

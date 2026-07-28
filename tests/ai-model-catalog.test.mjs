import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  AI_MODEL_CATALOG,
  AI_MODEL_CATALOG_VERIFIED_AT,
  AI_PROVIDER_MODEL_OPTIONS,
  DEFAULT_PUBLIC_AI_MODEL,
  DEFAULT_PUBLIC_AI_PROVIDER,
  getAIProviderModels,
  getAIPersonalQuotaPolicy,
  getAvailableAIProviders,
  getAIModelParameterPolicy,
  getDefaultAIModel,
  isActiveTextAIModel,
} from '../src/config/ai-models.ts'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function catalogEntries() {
  return Object.entries(AI_MODEL_CATALOG).flatMap(([provider, definition]) =>
    Object.entries(definition.models).map(([key, model]) => ({ provider, key, model })),
  )
}

test('public model catalog contains only unique active text chat models', () => {
  const entries = catalogEntries()
  const ids = entries.map(({ model }) => model.id)

  assert.equal(new Set(ids).size, ids.length, 'model IDs must be globally unique')
  assert.ok(entries.length > 0)

  for (const { provider, key, model } of entries) {
    assert.equal(key, model.id, `${provider}/${key} must use its exact provider ID`)
    assert.equal(model.lifecycle, 'active')
    assert.equal(model.capabilities.text, true)
    assert.ok(model.contextWindowTokens > 0)
    assert.ok(model.requestPolicy.maxOutputTokens > 0)
    assert.match(model.requestPolicy.temperatureMode, /^(?:configurable|provider-default)$/)
    assert.match(model.requestPolicy.tokenParameter, /^(?:max_tokens|max_completion_tokens)$/)
    assert.equal(model.availability.status, 'catalog-verified')
    assert.equal(model.availability.evidence, 'official')
    assert.equal(model.availability.verifiedAt, AI_MODEL_CATALOG_VERIFIED_AT)
    assert.match(model.usagePolicy.personalQuota, /^(?:metered|unmetered)$/)
    assert.doesNotMatch(model.id, /(?:tts|asr|speech|voice|audio)/i)
  }
})

test('every provider has one resolvable default and compatibility helpers expose only catalog models', () => {
  for (const [provider, definition] of Object.entries(AI_MODEL_CATALOG)) {
    const models = Object.values(definition.models)
    assert.equal(models.filter(model => model.default).length, 1, `${provider} must have one default`)
    assert.equal(getDefaultAIModel(provider), models.find(model => model.default)?.id)
    assert.deepEqual(
      getAIProviderModels(provider).map(model => model.key),
      models.map(model => model.id),
    )
    assert.deepEqual(
      Object.keys(AI_PROVIDER_MODEL_OPTIONS[provider].models),
      models.map(model => model.id),
    )
  }
})

test('global default and recommendations resolve to active text models', () => {
  assert.equal(isActiveTextAIModel(DEFAULT_PUBLIC_AI_PROVIDER, DEFAULT_PUBLIC_AI_MODEL), true)
  assert.equal(DEFAULT_PUBLIC_AI_PROVIDER, 'minimax')
  assert.equal(DEFAULT_PUBLIC_AI_MODEL, 'MiniMax-M3')
  assert.equal(getAvailableAIProviders()[0].key, 'minimax')

  const recommended = catalogEntries().filter(({ model }) => model.recommendation !== null)
  assert.equal(recommended.length, Object.keys(AI_MODEL_CATALOG).length)
  for (const { provider, model } of recommended) {
    assert.equal(isActiveTextAIModel(provider, model.id), true)
    assert.equal(model.default, true)
  }
})

test('only the exact MiniMax M3 catalog entry bypasses NotePrompt personal quota', () => {
  const unmetered = catalogEntries().filter(({ model }) => model.usagePolicy.personalQuota === 'unmetered')
  assert.deepEqual(
    unmetered.map(({ provider, model }) => `${provider}/${model.id}`),
    ['minimax/MiniMax-M3'],
  )
  assert.equal(getAIPersonalQuotaPolicy('minimax', 'MiniMax-M3'), 'unmetered')
  assert.equal(getAIPersonalQuotaPolicy('minimax', 'minimax-m3'), 'metered')
  assert.equal(getAIPersonalQuotaPolicy('unknown', 'MiniMax-M3'), 'metered')
})

test('retired, restricted legacy, and non-chat IDs never reach the public catalog', () => {
  const forbidden = new Set([
    'deepseek-chat',
    'deepseek-reasoner',
    'kimi-k2.5',
    'kimi-k2-thinking',
    'moonshot-v1-32k',
    'moonshot-v1-128k',
    'mimo-v2-pro',
    'mimo-v2-omni',
    'mimo-v2-flash',
    'mimo-v2.5-tts',
    'mimo-v2.5-tts-voiceclone',
    'mimo-v2.5-tts-voicedesign',
    'mimo-v2-tts',
  ])

  for (const { model } of catalogEntries()) {
    assert.equal(forbidden.has(model.id), false, `${model.id} is not selectable`)
  }
})

test('model parameter policies match the product request contract', () => {
  const kimiK3 = getAIModelParameterPolicy('kimi', 'kimi-k3')
  assert.equal(kimiK3.samplingEditable, false)
  assert.equal(kimiK3.maxOutputTokens, 8192)
  assert.equal(AI_MODEL_CATALOG.kimi.models['kimi-k3'].requestPolicy.tokenParameter, 'max_completion_tokens')

  const miniMaxM3 = getAIModelParameterPolicy('minimax', 'MiniMax-M3')
  assert.equal(miniMaxM3.samplingEditable, true)
  assert.equal(miniMaxM3.maxOutputTokens, 8192)

  const xiaomi = getAIModelParameterPolicy('xiaomi', 'mimo-v2.5-pro')
  assert.deepEqual(xiaomi.temperature, { min: 0.1, max: 1, step: 0.1 })
  assert.deepEqual(xiaomi.topP, { min: 0.1, max: 1, step: 0.05 })
})

test('capability metadata distinguishes current native vision models', () => {
  assert.equal(AI_MODEL_CATALOG.qwen.models['qwen3.7-plus'].capabilities.vision, true)
  assert.equal(AI_MODEL_CATALOG.qwen.models['qwen3.7-flash'].capabilities.vision, true)
  assert.equal(AI_MODEL_CATALOG.qwen.models['qwen3.7-max'].capabilities.vision, false)
  assert.equal(AI_MODEL_CATALOG.kimi.models['kimi-k2.7-code'].capabilities.vision, true)
  assert.equal(AI_MODEL_CATALOG.minimax.models['MiniMax-M3'].capabilities.vision, true)
  assert.equal(AI_MODEL_CATALOG.xiaomi.models['mimo-v2.5'].capabilities.vision, true)
  assert.equal(AI_MODEL_CATALOG.deepseek.models['deepseek-v4-pro'].capabilities.vision, false)
})

test('server model configuration derives from the client-safe catalog', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'src/config/ai.ts'), 'utf8')

  assert.match(source, /AI_MODEL_CATALOG/)
  assert.match(source, /buildServerModelCatalog/)
  assert.match(source, /Object\.entries\(AI_MODEL_CATALOG\)/)
  for (const { model } of catalogEntries()) {
    assert.doesNotMatch(source, new RegExp(model.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('model catalog knowledge base records official sources and regional key risk', () => {
  const documentation = fs.readFileSync(path.join(projectRoot, 'docs/engineering/ai-model-catalog.md'), 'utf8')

  assert.match(documentation, /Verified: 2026-07-28/)
  assert.match(documentation, /qwen3\.7-flash/)
  assert.match(documentation, /https:\/\/help\.aliyun\.com\/zh\/model-studio\/text-generation-model/)
  assert.match(documentation, /https:\/\/api-docs\.deepseek\.com\//)
  assert.match(documentation, /https:\/\/platform\.kimi\.(?:ai|com)\/docs\/models/)
  assert.match(documentation, /https:\/\/platform\.kimi\.ai\/docs\/guide\/kimi-k3-quickstart/)
  assert.match(documentation, /https:\/\/docs\.bigmodel\.cn\/cn\/guide\/start\/model-overview/)
  assert.match(documentation, /https:\/\/platform\.minimaxi\.com\/docs\/api-reference\/text-openai-api/)
  assert.match(documentation, /https:\/\/mimo\.mi\.com\/docs\/en-US\/quick-start\/model/)
  assert.match(documentation, /https:\/\/mimo\.mi\.com\/docs\/en-US\/api\/chat\/openai-api/)
  assert.match(documentation, /not interchangeable/i)
})

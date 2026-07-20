import 'server-only'
import {
  AI_MODEL_CATALOG,
  DEFAULT_PUBLIC_AI_PROVIDER,
  PublicAIModelDefinition,
  PublicAIProvider,
  getAvailableAIProviders,
  getAIProviderModels,
  getDefaultAIModel,
  isActiveTextAIModel,
  isPublicAIProvider,
} from './ai-models'
import { getProviderRuntimeConfig } from '@/lib/provider-runtime-config'
import { normalizeProviderBaseURL } from '@/lib/ai-runtime-policy'

type ProviderRuntimeDefinition = {
  apiKey: string | undefined
  baseURL: string
}

const PROVIDER_RUNTIME = {
  qwen: {
    apiKey: process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1',
  },
  kimi: {
    apiKey: process.env.KIMI_API_KEY,
    baseURL: 'https://api.moonshot.cn/v1',
  },
  zhipu: {
    apiKey: process.env.ZHIPU_API_KEY,
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
  },
  minimax: {
    apiKey: process.env.MINIMAX_API_KEY,
    baseURL: 'https://api.minimaxi.com/v1',
  },
  xiaomi: {
    apiKey: process.env.XIAOMI_API_KEY,
    baseURL: process.env.XIAOMI_BASE_URL || 'https://api.xiaomimimo.com/v1',
  },
} as const satisfies Record<PublicAIProvider, ProviderRuntimeDefinition>

type ServerAIModel = {
  name: string
  model: string
  max_tokens: number
  fixedTemperature: boolean
}

type ServerAIProvider = {
  name: string
  apiKey: string | undefined
  baseURL: string
  models: Record<string, ServerAIModel>
}

function buildServerModelCatalog(): Record<PublicAIProvider, ServerAIProvider> {
  return Object.fromEntries(
    Object.entries(AI_MODEL_CATALOG).map(([provider, definition]) => {
      const providerKey = provider as PublicAIProvider
      const runtime = PROVIDER_RUNTIME[providerKey]
      const models = Object.fromEntries(
        Object.entries(definition.models).map(([modelId, model]) => {
          const publicModel = model as PublicAIModelDefinition
          return [modelId, {
            name: publicModel.name,
            model: publicModel.id,
            max_tokens: publicModel.requestPolicy.maxOutputTokens,
            fixedTemperature: publicModel.requestPolicy.temperatureMode === 'provider-default',
          }]
        }),
      )

      return [providerKey, {
        name: definition.name,
        apiKey: runtime.apiKey,
        baseURL: runtime.baseURL,
        models,
      }]
    }),
  ) as Record<PublicAIProvider, ServerAIProvider>
}

// Server-only runtime view. Model metadata is derived from the client-safe
// catalog above; secrets and provider endpoints remain server-only.
export const AI_MODELS = buildServerModelCatalog()

function resolveConfiguredProvider(provider: string | undefined): PublicAIProvider {
  return provider && isPublicAIProvider(provider) ? provider : DEFAULT_PUBLIC_AI_PROVIDER
}

function resolveConfiguredModel(provider: PublicAIProvider, modelId: string | undefined): string {
  return modelId && isActiveTextAIModel(provider, modelId)
    ? modelId
    : getDefaultAIModel(provider)
}

export const DEFAULT_AI_PROVIDER = resolveConfiguredProvider(process.env.DEFAULT_AI_PROVIDER)
export const DEFAULT_AI_MODEL = resolveConfiguredModel(DEFAULT_AI_PROVIDER, process.env.DEFAULT_AI_MODEL)

export const aiConfig = {
  defaultProvider: DEFAULT_AI_PROVIDER,
  defaultModel: DEFAULT_AI_MODEL,
  prompts: {
    multiTurn: '你是一名资深的提示词工程专家，负责和用户进行多轮协作来迭代优化提示词。',
  },
  requestDefaults: {
    temperature: 0.7,
    max_tokens: 4000,
    top_p: 0.9,
  },
}

export type AIRequestConfig = {
  provider: string
  modelId: string
  baseURL: string
  model: string
  temperature: number
  max_tokens: number
  top_p: number
  fixedTemperature: boolean
  headers: Record<string, string>
}

export function getAIRequestConfig(provider?: string, modelId?: string, runtimeOverride?: { apiKey?: string; baseURL?: string }): AIRequestConfig {
  const requestedProvider = provider || aiConfig.defaultProvider
  if (!isPublicAIProvider(requestedProvider)) throw new Error('无可用的AI提供商')
  const resolvedProvider = requestedProvider
  const providerConfig = AI_MODELS[resolvedProvider]
  const resolvedModelId = modelId || getDefaultAIModel(resolvedProvider)
  const modelConfig = providerConfig.models[resolvedModelId]
  if (!modelConfig) throw new Error('不支持的模型')

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const globalRuntimeConfig = getProviderRuntimeConfig(resolvedProvider, {
    apiKey: providerConfig.apiKey,
    baseURL: providerConfig.baseURL,
  })
  const userBaseURL = runtimeOverride?.baseURL
    ? normalizeProviderBaseURL(resolvedProvider, runtimeOverride.baseURL)
    : undefined
  const globalBaseURL = normalizeProviderBaseURL(resolvedProvider, globalRuntimeConfig.baseURL)
  const runtimeConfig = {
    apiKey: runtimeOverride?.apiKey || globalRuntimeConfig.apiKey,
    baseURL: userBaseURL || globalBaseURL || '',
  }
  if (runtimeConfig.apiKey) headers.Authorization = 'Bearer ' + runtimeConfig.apiKey

  return {
    provider: resolvedProvider,
    modelId: resolvedModelId,
    baseURL: runtimeConfig.baseURL,
    model: modelConfig.model,
    temperature: aiConfig.requestDefaults.temperature,
    max_tokens: modelConfig.max_tokens ?? aiConfig.requestDefaults.max_tokens,
    top_p: aiConfig.requestDefaults.top_p,
    fixedTemperature: modelConfig.fixedTemperature,
    headers,
  }
}

export function getAvailableProviders() {
  return getAvailableAIProviders()
}

export function getProviderModels(provider: string) {
  return getAIProviderModels(provider)
}

export function generateConversationId() {
  return 'conv_' + Date.now() + '_' + crypto.randomUUID()
}

export const modelPresets = {
  creative: { temperature: 0.9, top_p: 0.9, description: '更有创意' },
  balanced: { temperature: 0.7, top_p: 0.9, description: '平衡' },
  precise: { temperature: 0.3, top_p: 0.8, description: '更准确' },
}

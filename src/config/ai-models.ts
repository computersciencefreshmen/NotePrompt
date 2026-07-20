export type AIModelLifecycle = 'active'
export type AIModelTier = 'flagship' | 'balanced' | 'fast' | 'specialist'
export type AITemperatureMode = 'configurable' | 'provider-default'
export type AITokenParameter = 'max_tokens' | 'max_completion_tokens'

// NotePrompt deliberately exposes a conservative cross-provider sampling
// envelope. It is narrower than some vendors' theoretical ranges so a value
// selected in the Studio remains portable across every configurable model.
export const AI_PRODUCT_PARAMETER_LIMITS = {
  temperature: { min: 0.1, max: 1, step: 0.1 },
  topP: { min: 0.1, max: 1, step: 0.05 },
  maxOutputTokens: 8_192,
} as const

export type PublicAIModelDefinition = {
  id: string
  name: string
  lifecycle: AIModelLifecycle
  capabilities: {
    text: true
    reasoning: boolean
    coding: boolean
    longContext: boolean
    vision: boolean
  }
  tier: AIModelTier
  default: boolean
  recommendation: string | null
  contextWindowTokens: number
  requestPolicy: {
    maxOutputTokens: number
    temperatureMode: AITemperatureMode
    tokenParameter: AITokenParameter
  }
}

type AIProviderDefinition = {
  name: string
  models: Record<string, PublicAIModelDefinition>
}

/**
 * Client-safe canonical model catalog.
 *
 * Keep provider credentials and base URLs out of this file. Server runtime
 * configuration derives its model map from this catalog in `config/ai.ts`.
 */
export const AI_MODEL_CATALOG = {
  qwen: {
    name: 'Qwen',
    models: {
      'qwen3.7-plus': {
        id: 'qwen3.7-plus',
        name: 'Qwen3.7 Plus',
        lifecycle: 'active',
        capabilities: { text: true, reasoning: true, coding: true, longContext: true, vision: true },
        tier: 'balanced',
        default: true,
        recommendation: '能力、成本与长上下文的均衡选择',
        contextWindowTokens: 1_000_000,
        requestPolicy: { maxOutputTokens: 32_768, temperatureMode: 'configurable', tokenParameter: 'max_tokens' },
      },
      'qwen3.7-max': {
        id: 'qwen3.7-max',
        name: 'Qwen3.7 Max',
        lifecycle: 'active',
        capabilities: { text: true, reasoning: true, coding: true, longContext: true, vision: false },
        tier: 'flagship',
        default: false,
        recommendation: null,
        contextWindowTokens: 1_000_000,
        requestPolicy: { maxOutputTokens: 32_768, temperatureMode: 'configurable', tokenParameter: 'max_tokens' },
      },
      'qwen3.6-flash': {
        id: 'qwen3.6-flash',
        name: 'Qwen3.6 Flash',
        lifecycle: 'active',
        capabilities: { text: true, reasoning: true, coding: true, longContext: true, vision: true },
        tier: 'fast',
        default: false,
        recommendation: null,
        contextWindowTokens: 1_000_000,
        requestPolicy: { maxOutputTokens: 32_768, temperatureMode: 'configurable', tokenParameter: 'max_tokens' },
      },
    },
  },
  deepseek: {
    name: 'DeepSeek',
    models: {
      'deepseek-v4-flash': {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        lifecycle: 'active',
        capabilities: { text: true, reasoning: true, coding: true, longContext: true, vision: false },
        tier: 'fast',
        default: true,
        recommendation: '低延迟、低成本的通用优化模型',
        contextWindowTokens: 1_000_000,
        requestPolicy: { maxOutputTokens: 32_768, temperatureMode: 'configurable', tokenParameter: 'max_tokens' },
      },
      'deepseek-v4-pro': {
        id: 'deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        lifecycle: 'active',
        capabilities: { text: true, reasoning: true, coding: true, longContext: true, vision: false },
        tier: 'flagship',
        default: false,
        recommendation: null,
        contextWindowTokens: 1_000_000,
        requestPolicy: { maxOutputTokens: 32_768, temperatureMode: 'configurable', tokenParameter: 'max_tokens' },
      },
    },
  },
  kimi: {
    name: 'Kimi',
    models: {
      'kimi-k3': {
        id: 'kimi-k3',
        name: 'Kimi K3',
        lifecycle: 'active',
        capabilities: { text: true, reasoning: true, coding: true, longContext: true, vision: true },
        tier: 'flagship',
        default: true,
        recommendation: '前沿知识工作、软件工程与深度推理',
        contextWindowTokens: 1_000_000,
        requestPolicy: { maxOutputTokens: 32_768, temperatureMode: 'provider-default', tokenParameter: 'max_completion_tokens' },
      },
      'kimi-k2.7-code': {
        id: 'kimi-k2.7-code',
        name: 'Kimi K2.7 Code',
        lifecycle: 'active',
        capabilities: { text: true, reasoning: true, coding: true, longContext: true, vision: true },
        tier: 'specialist',
        default: false,
        recommendation: null,
        contextWindowTokens: 262_144,
        requestPolicy: { maxOutputTokens: 32_768, temperatureMode: 'provider-default', tokenParameter: 'max_tokens' },
      },
      'kimi-k2.7-code-highspeed': {
        id: 'kimi-k2.7-code-highspeed',
        name: 'Kimi K2.7 Code Highspeed',
        lifecycle: 'active',
        capabilities: { text: true, reasoning: true, coding: true, longContext: true, vision: true },
        tier: 'fast',
        default: false,
        recommendation: null,
        contextWindowTokens: 262_144,
        requestPolicy: { maxOutputTokens: 32_768, temperatureMode: 'provider-default', tokenParameter: 'max_tokens' },
      },
      'kimi-k2.6': {
        id: 'kimi-k2.6',
        name: 'Kimi K2.6',
        lifecycle: 'active',
        capabilities: { text: true, reasoning: true, coding: true, longContext: true, vision: true },
        tier: 'flagship',
        default: false,
        recommendation: null,
        contextWindowTokens: 262_144,
        requestPolicy: { maxOutputTokens: 32_768, temperatureMode: 'provider-default', tokenParameter: 'max_tokens' },
      },
    },
  },
  zhipu: {
    name: 'Zhipu GLM',
    models: {
      'glm-5.2': {
        id: 'glm-5.2',
        name: 'GLM-5.2',
        lifecycle: 'active',
        capabilities: { text: true, reasoning: true, coding: true, longContext: true, vision: false },
        tier: 'flagship',
        default: true,
        recommendation: '超长上下文与复杂长程任务',
        contextWindowTokens: 1_000_000,
        requestPolicy: { maxOutputTokens: 131_072, temperatureMode: 'configurable', tokenParameter: 'max_tokens' },
      },
      'glm-5.1': {
        id: 'glm-5.1',
        name: 'GLM-5.1',
        lifecycle: 'active',
        capabilities: { text: true, reasoning: true, coding: true, longContext: true, vision: false },
        tier: 'balanced',
        default: false,
        recommendation: null,
        contextWindowTokens: 204_800,
        requestPolicy: { maxOutputTokens: 131_072, temperatureMode: 'configurable', tokenParameter: 'max_tokens' },
      },
      'glm-5-turbo': {
        id: 'glm-5-turbo',
        name: 'GLM-5 Turbo',
        lifecycle: 'active',
        capabilities: { text: true, reasoning: true, coding: true, longContext: true, vision: false },
        tier: 'fast',
        default: false,
        recommendation: null,
        contextWindowTokens: 204_800,
        requestPolicy: { maxOutputTokens: 131_072, temperatureMode: 'configurable', tokenParameter: 'max_tokens' },
      },
    },
  },
  minimax: {
    name: 'MiniMax',
    models: {
      'MiniMax-M3': {
        id: 'MiniMax-M3',
        name: 'MiniMax M3',
        lifecycle: 'active',
        capabilities: { text: true, reasoning: true, coding: true, longContext: true, vision: true },
        tier: 'flagship',
        default: true,
        recommendation: '当前默认：前沿推理、代码与百万上下文',
        contextWindowTokens: 1_000_000,
        requestPolicy: { maxOutputTokens: 2_048, temperatureMode: 'configurable', tokenParameter: 'max_completion_tokens' },
      },
      'MiniMax-M2.7-highspeed': {
        id: 'MiniMax-M2.7-highspeed',
        name: 'MiniMax M2.7 Highspeed',
        lifecycle: 'active',
        capabilities: { text: true, reasoning: true, coding: true, longContext: true, vision: false },
        tier: 'fast',
        default: false,
        recommendation: null,
        contextWindowTokens: 204_800,
        requestPolicy: { maxOutputTokens: 2_048, temperatureMode: 'configurable', tokenParameter: 'max_completion_tokens' },
      },
      'MiniMax-M2.7': {
        id: 'MiniMax-M2.7',
        name: 'MiniMax M2.7',
        lifecycle: 'active',
        capabilities: { text: true, reasoning: true, coding: true, longContext: true, vision: false },
        tier: 'flagship',
        default: false,
        recommendation: null,
        contextWindowTokens: 204_800,
        requestPolicy: { maxOutputTokens: 2_048, temperatureMode: 'configurable', tokenParameter: 'max_completion_tokens' },
      },
    },
  },
  xiaomi: {
    name: 'Xiaomi MiMo',
    models: {
      'mimo-v2.5-pro': {
        id: 'mimo-v2.5-pro',
        name: 'MiMo V2.5 Pro',
        lifecycle: 'active',
        capabilities: { text: true, reasoning: true, coding: true, longContext: true, vision: true },
        tier: 'flagship',
        default: true,
        recommendation: '高难度推理和长上下文任务',
        contextWindowTokens: 1_000_000,
        requestPolicy: { maxOutputTokens: 8_192, temperatureMode: 'configurable', tokenParameter: 'max_completion_tokens' },
      },
      'mimo-v2.5': {
        id: 'mimo-v2.5',
        name: 'MiMo V2.5',
        lifecycle: 'active',
        capabilities: { text: true, reasoning: true, coding: true, longContext: true, vision: true },
        tier: 'balanced',
        default: false,
        recommendation: null,
        contextWindowTokens: 1_000_000,
        requestPolicy: { maxOutputTokens: 8_192, temperatureMode: 'configurable', tokenParameter: 'max_completion_tokens' },
      },
    },
  },
} as const satisfies Record<string, AIProviderDefinition>

export type PublicAIProvider = keyof typeof AI_MODEL_CATALOG

export const DEFAULT_PUBLIC_AI_PROVIDER = 'minimax'
export const DEFAULT_PUBLIC_AI_MODEL = 'MiniMax-M3'

/**
 * One-release compatibility view for code that still expects a name map.
 * New code should use `AI_MODEL_CATALOG` or the helper functions below.
 */
export const AI_PROVIDER_MODEL_OPTIONS = Object.fromEntries(
  Object.entries(AI_MODEL_CATALOG).map(([provider, definition]) => [
    provider,
    {
      name: definition.name,
      models: Object.fromEntries(
        Object.entries(definition.models).map(([modelId, model]) => [modelId, model.name]),
      ),
    },
  ]),
) as Record<PublicAIProvider, { name: string; models: Record<string, string> }>

export function isPublicAIProvider(provider: string): provider is PublicAIProvider {
  return Object.prototype.hasOwnProperty.call(AI_MODEL_CATALOG, provider)
}

export function getAIModelDefinition(provider: string, modelId: string): PublicAIModelDefinition | undefined {
  if (!isPublicAIProvider(provider)) return undefined
  const models = AI_MODEL_CATALOG[provider].models as Record<string, PublicAIModelDefinition>
  return models[modelId]
}

export function isActiveTextAIModel(provider: string, modelId: string): boolean {
  const model = getAIModelDefinition(provider, modelId)
  return model?.lifecycle === 'active' && model.capabilities.text
}

export function getAvailableAIProviders() {
  return Object.entries(AI_MODEL_CATALOG).map(([key, value]) => ({
    key,
    name: value.name,
  }))
}

export function getAIProviderModels(provider: string) {
  if (!isPublicAIProvider(provider)) return []

  return Object.values(AI_MODEL_CATALOG[provider].models).map(model => ({
    key: model.id,
    name: model.name,
  }))
}

export function getDefaultAIModel(provider: string) {
  if (!isPublicAIProvider(provider)) return DEFAULT_PUBLIC_AI_MODEL

  const defaultModel = Object.values(AI_MODEL_CATALOG[provider].models).find(model => model.default)
  return defaultModel?.id || DEFAULT_PUBLIC_AI_MODEL
}

export function getAIModelParameterPolicy(provider: string, modelId: string) {
  const requestPolicy = getAIModelDefinition(provider, modelId)?.requestPolicy

  return {
    samplingEditable: requestPolicy?.temperatureMode !== 'provider-default',
    temperature: AI_PRODUCT_PARAMETER_LIMITS.temperature,
    topP: AI_PRODUCT_PARAMETER_LIMITS.topP,
    maxOutputTokens: Math.min(
      requestPolicy?.maxOutputTokens ?? AI_PRODUCT_PARAMETER_LIMITS.maxOutputTokens,
      AI_PRODUCT_PARAMETER_LIMITS.maxOutputTokens,
    ),
  }
}

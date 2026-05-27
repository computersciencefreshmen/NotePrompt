export const DEFAULT_PUBLIC_AI_PROVIDER = 'minimax'
export const DEFAULT_PUBLIC_AI_MODEL = 'MiniMax-M2.5-highspeed'

export const AI_PROVIDER_MODEL_OPTIONS = {
  qwen: {
    name: 'Qwen',
    models: {
      'qwen3.7-max': 'Qwen3.7 Max',
      'qwen3.6-plus': 'Qwen3.6 Plus',
      'qwen3.6-flash': 'Qwen3.6 Flash',
      'qwen-plus': 'Qwen Plus',
      'qwen-max': 'Qwen Max',
      'qwen-turbo': 'Qwen Turbo',
      'qwen-long': 'Qwen Long',
      'qwen3-coder-plus': 'Qwen3 Coder Plus',
    },
  },
  deepseek: {
    name: 'DeepSeek',
    models: {
      'deepseek-v4-flash': 'DeepSeek V4 Flash',
      'deepseek-v4-pro': 'DeepSeek V4 Pro',
      'deepseek-chat': 'DeepSeek Chat',
      'deepseek-reasoner': 'DeepSeek Reasoner',
    },
  },
  kimi: {
    name: 'Kimi',
    models: {
      'kimi-k2.6': 'Kimi K2.6',
      'kimi-k2.5': 'Kimi K2.5',
      'kimi-k2-thinking': 'Kimi K2 Thinking',
      'moonshot-v1-128k': 'Moonshot V1 128K',
      'moonshot-v1-32k': 'Moonshot V1 32K',
    },
  },
  zhipu: {
    name: 'Zhipu GLM',
    models: {
      'glm-5.1': 'GLM-5.1',
      'glm-5': 'GLM-5',
      'glm-5-turbo': 'GLM-5 Turbo',
      'glm-4.7-flash': 'GLM-4.7 Flash',
      'glm-4.7': 'GLM-4.7',
    },
  },
  minimax: {
    name: 'MiniMax',
    models: {
      'MiniMax-M2.7': 'MiniMax M2.7',
      'MiniMax-M2.7-highspeed': 'MiniMax M2.7 Highspeed',
      'MiniMax-M2.5': 'MiniMax M2.5',
      'MiniMax-M2.5-highspeed': 'MiniMax M2.5 Highspeed',
      'MiniMax-M2.1': 'MiniMax M2.1',
      'M2-her': 'M2 Her',
    },
  },
  xiaomi: {
    name: 'Xiaomi MiMo',
    models: {
      'mimo-v2.5-pro': 'MiMo V2.5 Pro',
      'mimo-v2.5': 'MiMo V2.5',
      'mimo-v2-pro': 'MiMo V2 Pro',
      'mimo-v2-omni': 'MiMo V2 Omni',
      'mimo-v2-flash': 'MiMo V2 Flash',
      'mimo-v2.5-tts': 'MiMo V2.5 TTS',
      'mimo-v2.5-tts-voiceclone': 'MiMo V2.5 TTS VoiceClone',
      'mimo-v2.5-tts-voicedesign': 'MiMo V2.5 TTS VoiceDesign',
      'mimo-v2-tts': 'MiMo V2 TTS',
    },
  },
} as const

export type PublicAIProvider = keyof typeof AI_PROVIDER_MODEL_OPTIONS

export function getAvailableAIProviders() {
  return Object.entries(AI_PROVIDER_MODEL_OPTIONS).map(([key, value]) => ({
    key,
    name: value.name,
  }))
}

export function getAIProviderModels(provider: string) {
  const providerConfig = AI_PROVIDER_MODEL_OPTIONS[provider as PublicAIProvider]
  if (!providerConfig) return []

  return Object.entries(providerConfig.models).map(([key, name]) => ({ key, name }))
}

export function getDefaultAIModel(provider: string) {
  return getAIProviderModels(provider)[0]?.key || DEFAULT_PUBLIC_AI_MODEL
}
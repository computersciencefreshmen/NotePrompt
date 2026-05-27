import { DEFAULT_PUBLIC_AI_MODEL, DEFAULT_PUBLIC_AI_PROVIDER, getAvailableAIProviders, getAIProviderModels } from './ai-models'
import { getProviderRuntimeConfig } from '@/lib/provider-runtime-config'

// AI模型配置 (2026最新)
export const DEFAULT_AI_PROVIDER = process.env.DEFAULT_AI_PROVIDER || DEFAULT_PUBLIC_AI_PROVIDER
export const DEFAULT_AI_MODEL = process.env.DEFAULT_AI_MODEL || DEFAULT_PUBLIC_AI_MODEL
export const FALLBACK_AI_PROVIDER = 'xiaomi'
export const FALLBACK_AI_MODEL = 'mimo-v2-flash'

export const aiConfig = {
  defaultProvider: DEFAULT_AI_PROVIDER,
  defaultModel: DEFAULT_AI_MODEL,
  fallbackProvider: FALLBACK_AI_PROVIDER,
  fallbackModel: FALLBACK_AI_MODEL,
  prompts: {
    multiTurn: '你是一名资深的提示词工程专家，负责和用户进行多轮协作来迭代优化提示词。'
  },
  requestDefaults: {
    temperature: 0.7,
    max_tokens: 4000,
    top_p: 0.9
  }
}

export type AIRequestConfig = {
  provider: string;
  modelId: string;
  baseURL: string;
  model: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
  fixedTemperature: boolean;
  headers: Record<string, string>;
}

type AIProviderKey = keyof typeof AI_MODELS
type AIModelMap = Record<string, { name: string; model: string; max_tokens?: number; fixedTemperature?: boolean }>

// 模型按默认推荐顺序排序；兼容模型保留用于旧请求回放。
export const AI_MODELS = {
  qwen: {
    name: 'Qwen',
    apiKey: process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: {
      'qwen3.7-max': { name: 'Qwen3.7 Max', model: 'qwen3.7-max', max_tokens: 32768 },
      'qwen3.6-plus': { name: 'Qwen3.6 Plus', model: 'qwen3.6-plus', max_tokens: 32768 },
      'qwen3.6-flash': { name: 'Qwen3.6 Flash', model: 'qwen3.6-flash', max_tokens: 32768 },
      'qwen-plus': { name: 'Qwen Plus', model: 'qwen-plus', max_tokens: 32768 },
      'qwen-max': { name: 'Qwen Max', model: 'qwen-max', max_tokens: 32768 },
      'qwen-turbo': { name: 'Qwen Turbo', model: 'qwen-turbo', max_tokens: 32768 },
      'qwen-long': { name: 'Qwen Long', model: 'qwen-long', max_tokens: 32768 },
      'qwen3-coder-plus': { name: 'Qwen3 Coder Plus', model: 'qwen3-coder-plus', max_tokens: 32768 },
    }
  },
  deepseek: {
    name: 'DeepSeek',
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1',
    models: {
      'deepseek-v4-flash': { name: 'DeepSeek V4 Flash', model: 'deepseek-v4-flash', max_tokens: 131072 },
      'deepseek-v4-pro': { name: 'DeepSeek V4 Pro', model: 'deepseek-v4-pro', max_tokens: 131072 },
      'deepseek-chat': { name: 'DeepSeek Chat', model: 'deepseek-chat', max_tokens: 8192 },
      'deepseek-reasoner': { name: 'DeepSeek Reasoner', model: 'deepseek-reasoner', max_tokens: 8192 },
    }
  },
  kimi: {
    name: 'Kimi',
    apiKey: process.env.KIMI_API_KEY,
    baseURL: 'https://api.moonshot.cn/v1',
    models: {
      'kimi-k2.6': { name: 'Kimi K2.6', model: 'kimi-k2.6', max_tokens: 32768, fixedTemperature: true },
      'kimi-k2.5': { name: 'Kimi K2.5', model: 'kimi-k2.5', max_tokens: 32768, fixedTemperature: true },
      'kimi-k2-thinking': { name: 'Kimi K2 Thinking', model: 'kimi-k2-thinking', max_tokens: 16384, fixedTemperature: true },
      'moonshot-v1-128k': { name: 'Moonshot V1 128K', model: 'moonshot-v1-128k', max_tokens: 4096 },
      'moonshot-v1-32k': { name: 'Moonshot V1 32K', model: 'moonshot-v1-32k', max_tokens: 4096 },
    }
  },
  zhipu: {
    name: 'Zhipu GLM',
    apiKey: process.env.ZHIPU_API_KEY,
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    models: {
      'glm-5.1': { name: 'GLM-5.1', model: 'glm-5.1', max_tokens: 131072 },
      'glm-5': { name: 'GLM-5', model: 'glm-5', max_tokens: 131072 },
      'glm-5-turbo': { name: 'GLM-5 Turbo', model: 'glm-5-turbo', max_tokens: 65536 },
      'glm-4.7-flash': { name: 'GLM-4.7 Flash', model: 'glm-4.7-flash', max_tokens: 131072 },
      'glm-4.7': { name: 'GLM-4.7', model: 'glm-4.7', max_tokens: 131072 },
    }
  },
  minimax: {
    name: 'MiniMax',
    apiKey: process.env.MINIMAX_API_KEY,
    baseURL: 'https://api.minimaxi.com/v1',
    models: {
      'MiniMax-M2.7': { name: 'MiniMax M2.7', model: 'MiniMax-M2.7', max_tokens: 2048 },
      'MiniMax-M2.7-highspeed': { name: 'MiniMax M2.7 Highspeed', model: 'MiniMax-M2.7-highspeed', max_tokens: 2048 },
      'MiniMax-M2.5': { name: 'MiniMax M2.5', model: 'MiniMax-M2.5', max_tokens: 2048 },
      'MiniMax-M2.5-highspeed': { name: 'MiniMax M2.5 Highspeed', model: 'MiniMax-M2.5-highspeed', max_tokens: 2048 },
      'MiniMax-M2.1': { name: 'MiniMax M2.1', model: 'MiniMax-M2.1', max_tokens: 2048 },
      'M2-her': { name: 'M2 Her', model: 'M2-her', max_tokens: 2048 },
    }
  },
  xiaomi: {
    name: 'Xiaomi MiMo',
    apiKey: process.env.XIAOMI_API_KEY,
    baseURL: process.env.XIAOMI_BASE_URL || 'https://token-plan-ams.xiaomimimo.com/v1',
    models: {
      'mimo-v2.5-pro': { name: 'MiMo V2.5 Pro', model: 'mimo-v2.5-pro', max_tokens: 8192 },
      'mimo-v2.5': { name: 'MiMo V2.5', model: 'mimo-v2.5', max_tokens: 8192 },
      'mimo-v2-pro': { name: 'MiMo V2 Pro', model: 'mimo-v2-pro', max_tokens: 8192 },
      'mimo-v2-omni': { name: 'MiMo V2 Omni', model: 'mimo-v2-omni', max_tokens: 8192 },
      'mimo-v2-flash': { name: 'MiMo V2 Flash', model: 'mimo-v2-flash', max_tokens: 8192 },
      'mimo-v2.5-tts': { name: 'MiMo V2.5 TTS', model: 'mimo-v2.5-tts', max_tokens: 4096 },
      'mimo-v2.5-tts-voiceclone': { name: 'MiMo V2.5 TTS VoiceClone', model: 'mimo-v2.5-tts-voiceclone', max_tokens: 4096 },
      'mimo-v2.5-tts-voicedesign': { name: 'MiMo V2.5 TTS VoiceDesign', model: 'mimo-v2.5-tts-voicedesign', max_tokens: 4096 },
      'mimo-v2-tts': { name: 'MiMo V2 TTS', model: 'mimo-v2-tts', max_tokens: 4096 },
    }
  }
};

export function getAIRequestConfig(provider?: string, modelId?: string, runtimeOverride?: { apiKey?: string; baseURL?: string }): AIRequestConfig {
  const resolvedProvider = (provider || aiConfig.defaultProvider) as AIProviderKey;
  const providerConfig = AI_MODELS[resolvedProvider];
  if (!providerConfig) throw new Error('无可用的AI提供商');
  
  const resolvedModelId = modelId || (Object.keys(providerConfig.models)[0] ?? aiConfig.defaultModel);
  const modelConfig = (providerConfig.models as AIModelMap)[resolvedModelId];
  if (!modelConfig) throw new Error('不支持的模型');
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const globalRuntimeConfig = getProviderRuntimeConfig(resolvedProvider, {
    apiKey: providerConfig.apiKey,
    baseURL: providerConfig.baseURL,
  });
  const runtimeConfig = {
    apiKey: runtimeOverride?.apiKey || globalRuntimeConfig.apiKey,
    baseURL: runtimeOverride?.baseURL || globalRuntimeConfig.baseURL,
  }
  if (runtimeConfig.apiKey) headers['Authorization'] = 'Bearer ' + runtimeConfig.apiKey;
  
  return {
    provider: resolvedProvider,
    modelId: resolvedModelId,
    baseURL: runtimeConfig.baseURL,
    model: modelConfig.model,
    temperature: aiConfig.requestDefaults.temperature,
    max_tokens: modelConfig.max_tokens ?? aiConfig.requestDefaults.max_tokens,
    top_p: aiConfig.requestDefaults.top_p,
    fixedTemperature: modelConfig.fixedTemperature || false,
    headers
  };
}

export function getAvailableProviders() {
  return getAvailableAIProviders();
}

export function getProviderModels(provider: string) {
  return getAIProviderModels(provider);
}

export function generateConversationId() {
  return 'conv_' + Date.now() + '_' + crypto.randomUUID();
}

export const modelPresets = {
  creative: { temperature: 0.9, top_p: 0.9, description: '更有创意' },
  balanced: { temperature: 0.7, top_p: 0.9, description: '平衡' },
  precise: { temperature: 0.3, top_p: 0.8, description: '更准确' }
};

// AI模型配置 (2026最新)
export const DEFAULT_AI_PROVIDER = process.env.DEFAULT_AI_PROVIDER || 'qwen'
export const DEFAULT_AI_MODEL = process.env.DEFAULT_AI_MODEL || 'qwen3.5-plus'
export const FALLBACK_AI_PROVIDER = 'deepseek'
export const FALLBACK_AI_MODEL = 'deepseek-chat'

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

export const AI_MODELS = {
  deepseek: {
    name: 'DeepSeek',
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1',
    models: {
      'deepseek-chat': { name: 'DeepSeek-V3.2 Chat', model: 'deepseek-chat', max_tokens: 8192 },
      'deepseek-reasoner': { name: 'DeepSeek-R1 推理', model: 'deepseek-reasoner', max_tokens: 8192 },
    }
  },
  kimi: {
    name: 'Kimi',
    apiKey: process.env.KIMI_API_KEY,
    baseURL: 'https://api.moonshot.cn/v1',
    models: {
      'kimi-k2.5': { name: 'Kimi K2.5', model: 'kimi-k2.5', max_tokens: 32768, fixedTemperature: true },
      'kimi-k2-0905-preview': { name: 'Kimi K2 Preview', model: 'kimi-k2-0905-preview', max_tokens: 8192 },
      'kimi-k2-thinking': { name: 'Kimi K2 Thinking', model: 'kimi-k2-thinking', max_tokens: 16384, fixedTemperature: true },
      'moonshot-v1-128k': { name: 'Moonshot V1 128k', model: 'moonshot-v1-128k', max_tokens: 4096 },
      'moonshot-v1-32k': { name: 'Moonshot V1 32k', model: 'moonshot-v1-32k', max_tokens: 4096 },
    }
  },
  qwen: {
    name: 'Qwen',
    apiKey: process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: {
      'qwen3-max': { name: 'Qwen3 Max', model: 'qwen3-max', max_tokens: 32768 },
      'qwen3.5-plus': { name: 'Qwen3.5 Plus', model: 'qwen3.5-plus', max_tokens: 32768 },
      'qwen-long': { name: 'Qwen Long', model: 'qwen-long', max_tokens: 32768 },
      'qwen3-coder-plus': { name: 'Qwen3 Coder Plus', model: 'qwen3-coder-plus', max_tokens: 32768 },
      'qwen3.5-flash': { name: 'Qwen3.5 Flash', model: 'qwen3.5-flash', max_tokens: 32768 },
    }
  },
  zhipu: {
    name: '智谱GLM',
    apiKey: process.env.ZHIPU_API_KEY,
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    models: {
      'glm-5': { name: 'GLM-5', model: 'glm-5', max_tokens: 131072 },
      'glm-4.7': { name: 'GLM-4.7', model: 'glm-4.7', max_tokens: 131072 },
      'glm-4.7-flash': { name: 'GLM-4.7-Flash', model: 'glm-4.7-flash', max_tokens: 131072 },
      'glm-4.6': { name: 'GLM-4.6', model: 'glm-4.6', max_tokens: 131072 },
      'glm-4.5': { name: 'GLM-4.5', model: 'glm-4.5', max_tokens: 131072 },
    }
  }
};

export function getAIRequestConfig(provider, modelId) {
  const resolvedProvider = provider || aiConfig.defaultProvider;
  const providerConfig = AI_MODELS[resolvedProvider];
  if (!providerConfig) throw new Error('无可用的AI提供商');
  
  const resolvedModelId = modelId || aiConfig.defaultModel;
  const modelConfig = providerConfig.models[resolvedModelId];
  if (!modelConfig) throw new Error('不支持的模型');
  
  const headers = { 'Content-Type': 'application/json' };
  if (providerConfig.apiKey) headers['Authorization'] = 'Bearer ' + providerConfig.apiKey;
  
  return {
    provider: resolvedProvider,
    modelId: resolvedModelId,
    baseURL: providerConfig.baseURL,
    model: modelConfig.model,
    temperature: aiConfig.requestDefaults.temperature,
    max_tokens: modelConfig.max_tokens ?? aiConfig.requestDefaults.max_tokens,
    top_p: aiConfig.requestDefaults.top_p,
    fixedTemperature: modelConfig.fixedTemperature || false,
    headers
  };
}

export function getAvailableProviders() {
  return Object.keys(AI_MODELS).map(key => ({ key, name: AI_MODELS[key].name }));
}

export function getProviderModels(provider) {
  const providerConfig = AI_MODELS[provider];
  if (!providerConfig) return [];
  return Object.keys(providerConfig.models).map(key => ({ key, name: providerConfig.models[key].name }));
}

export function generateConversationId() {
  return 'conv_' + Date.now() + '_' + crypto.randomUUID();
}

export const modelPresets = {
  creative: { temperature: 0.9, top_p: 0.9, description: '更有创意' },
  balanced: { temperature: 0.7, top_p: 0.9, description: '平衡' },
  precise: { temperature: 0.3, top_p: 0.8, description: '更准确' }
};

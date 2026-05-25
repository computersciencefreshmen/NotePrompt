import { AI_MODELS } from '@/config/ai'
import { getProviderRuntimeConfig } from '@/lib/provider-runtime-config'

type AIProviderKey = keyof typeof AI_MODELS
type AIModelConfig = {
  name: string
  model: string
  max_tokens: number
  temperature?: number
  fixedTemperature?: boolean
  baseURL?: string
}

function getProviderConfig(provider: string) {
  if (!Object.prototype.hasOwnProperty.call(AI_MODELS, provider)) {
    return null
  }

  return AI_MODELS[provider as AIProviderKey]
}

// 验证AI模型配置
export function validateAIModel(provider: string, modelId: string): {
  isValid: boolean;
  error?: string;
  config?: {
    baseURL: string;
    model: string;
    temperature: number;
    max_tokens: number;
    fixedTemperature: boolean;
    headers: Record<string, string>;
  };
} {
  try {
    const providerConfig = getProviderConfig(provider);
    if (!providerConfig) {
      return {
        isValid: false,
        error: "不支持的AI提供商: " + provider
      };
    }

    const models = providerConfig.models as Record<string, AIModelConfig>;
    const modelConfig = models[modelId];
    if (!modelConfig) {
      return {
        isValid: false,
        error: "不支持的模型: " + modelId
      };
    }

    const runtimeConfig = getProviderRuntimeConfig(provider, {
      apiKey: providerConfig.apiKey,
      baseURL: providerConfig.baseURL,
    });

    if (!runtimeConfig.apiKey) {
      return {
        isValid: false,
        error: "未配置" + provider + "的API密钥，请在环境变量中设置" + provider.toUpperCase() + "_API_KEY"
      };
    }

    const baseURL = runtimeConfig.baseURL || modelConfig.baseURL;
    if (!baseURL) {
      return {
        isValid: false,
        error: "未配置" + provider + "的API地址"
      };
    }

    return {
      isValid: true,
      config: {
        baseURL,
        model: modelConfig.model,
        temperature: modelConfig.temperature ?? 0.7,
        max_tokens: modelConfig.max_tokens,
        fixedTemperature: modelConfig.fixedTemperature || false,
        headers: { 'Authorization': 'Bearer ' + runtimeConfig.apiKey }
      }
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : '模型验证失败'
    };
  }
}

// 获取可用的模型列表
export function getAvailableModels(provider: string): Array<{key: string, name: string}> {
  const providerConfig = getProviderConfig(provider);
  if (!providerConfig) {
    return [];
  }

  const models = providerConfig.models as Record<string, AIModelConfig>;
  return Object.keys(models).map(key => ({
    key,
    name: models[key].name
  }));
}

// 格式化AI错误信息
export function formatAIError(error: unknown, provider: string): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message;

    if (provider === 'deepseek') {
      if (message.includes('Model Not Exist')) {
        return 'DeepSeek模型不存在，请检查模型名称是否正确';
      }
      if (message.includes('invalid_request_error')) {
        return 'DeepSeek API请求参数错误';
      }
      if (message.includes('authentication')) {
        return 'DeepSeek API密钥无效，请检查配置';
      }
    }
    
    return message;
  }

  return '未知错误';
}

// 获取推荐的模型配置
export function getRecommendedModels(): Array<{
  provider: string;
  model: string;
  name: string;
  reason: string;
}> {
  return [
    {
      provider: 'qwen',
      model: 'qwen3.6-plus',
      name: 'Qwen3.6 Plus',
      reason: '阿里百炼最新通用文本模型，适合日常优化'
    },
    {
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      name: 'DeepSeek V4 Flash',
      reason: '最新低成本高并发模型，适合默认优化'
    },
    {
      provider: 'zhipu',
      model: 'glm-5.1',
      name: 'GLM-5.1',
      reason: '长程任务和 Agent 场景能力强'
    },
    {
      provider: 'kimi',
      model: 'kimi-k2.6',
      name: 'Kimi K2.6',
      reason: '长上下文和代码任务能力强'
    },
    {
      provider: 'minimax',
      model: 'MiniMax-M2.7',
      name: 'MiniMax M2.7',
      reason: 'MiniMax 最新文本模型，适合 Agent 和长任务优化'
    }
  ];
}

import { AI_MODELS } from '@/config/ai'

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
    const providerConfig = AI_MODELS[provider];
    if (!providerConfig) {
      return {
        isValid: false,
        error: "不支持的AI提供商: " + provider
      };
    }

    const modelConfig = providerConfig.models[modelId];
    if (!modelConfig) {
      return {
        isValid: false,
        error: "不支持的模型: " + modelId
      };
    }

    if (!providerConfig.apiKey) {
      return {
        isValid: false,
        error: "未配置" + provider + "的API密钥，请在环境变量中设置" + provider.toUpperCase() + "_API_KEY"
      };
    }

    return {
      isValid: true,
      config: {
        baseURL: providerConfig.baseURL || modelConfig.baseURL,
        model: modelConfig.model,
        temperature: modelConfig.temperature ?? 0.7,
        max_tokens: modelConfig.max_tokens,
        fixedTemperature: modelConfig.fixedTemperature || false,
        headers: { 'Authorization': 'Bearer ' + providerConfig.apiKey }
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
  const providerConfig = AI_MODELS[provider];
  if (!providerConfig) {
    return [];
  }

  return Object.keys(providerConfig.models).map(key => ({
    key,
    name: providerConfig.models[key].name
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
      model: 'qwen3.5-plus',
      name: 'Qwen-Plus',
      reason: '阿里云、稳定可靠、性能强'
    },
    {
      provider: 'deepseek',
      model: 'deepseek-chat',
      name: 'DeepSeek-Chat',
      reason: '高质量、支持中文'
    },
    {
      provider: 'zhipu',
      model: 'glm-4-plus',
      name: 'GLM-4-Plus',
      reason: '智谱清言、国内领先'
    }
  ];
}

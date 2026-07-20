import 'server-only'
import { AI_MODELS, aiConfig } from '@/config/ai'
import { AI_MODEL_CATALOG, PublicAIModelDefinition } from '@/config/ai-models'
import { getProviderRuntimeConfig } from '@/lib/provider-runtime-config'
import { normalizeProviderBaseURL } from '@/lib/ai-runtime-policy'
import { formatSafeAIError } from '@/lib/ai-error-sanitizer'

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
export function validateAIModel(provider: string, modelId: string, runtimeOverride?: { apiKey?: string; baseURL?: string }): {
  isValid: boolean;
  error?: string;
  config?: {
    baseURL: string;
    model: string;
    temperature: number;
    max_tokens: number;
    top_p: number;
    fixedTemperature: boolean;
    headers: Record<string, string>;
  };
} {
  try {
    const providerConfig = getProviderConfig(provider);
    if (!providerConfig) {
      return {
        isValid: false,
        error: "不支持的AI提供商"
      };
    }

    const models = providerConfig.models as Record<string, AIModelConfig>;
    const modelConfig = models[modelId];
    if (!modelConfig) {
      return {
        isValid: false,
        error: "不支持的模型"
      };
    }

    const globalRuntimeConfig = getProviderRuntimeConfig(provider, {
      apiKey: providerConfig.apiKey,
      baseURL: providerConfig.baseURL,
    });
    const userBaseURL = runtimeOverride?.baseURL
      ? normalizeProviderBaseURL(provider, runtimeOverride.baseURL)
      : undefined;
    const globalBaseURL = normalizeProviderBaseURL(provider, globalRuntimeConfig.baseURL);
    const runtimeConfig = {
      apiKey: runtimeOverride?.apiKey || globalRuntimeConfig.apiKey,
      baseURL: userBaseURL || globalBaseURL || '',
    }

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
        top_p: aiConfig.requestDefaults.top_p,
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
  void provider
  return formatSafeAIError(error)
}

// 获取推荐的模型配置
export function getRecommendedModels(): Array<{
  provider: string;
  model: string;
  name: string;
  reason: string;
}> {
  return Object.entries(AI_MODEL_CATALOG).flatMap(([provider, definition]) =>
    Object.values(definition.models)
      .map(model => model as PublicAIModelDefinition)
      .filter(model => model.recommendation !== null)
      .map(model => ({
        provider,
        model: model.id,
        name: model.name,
        reason: model.recommendation as string,
      })),
  )
}

import { getAIModelDefinition, getAIModelParameterPolicy } from '../config/ai-models.ts'

export type AIChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AIChatCompletionBody = Record<string, unknown> & {
  model: string
  messages: AIChatMessage[]
  stream: boolean
}

export type AIProviderFailure = {
  type: 'error'
  code: 'AI_PROVIDER_REQUEST_FAILED' | 'AI_PROVIDER_INCOMPLETE_RESPONSE'
  message: string
  provider: string
  model: string
  status?: number
  retryable: boolean
}

export const MAX_AI_PROVIDER_RESPONSE_BYTES = 2 * 1024 * 1024

export async function readLimitedAIProviderJSON<T>(response: Response): Promise<T> {
  if (!response.body) throw new Error('AI provider returned an empty response body')

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      totalBytes += value.byteLength
      if (totalBytes > MAX_AI_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new Error('AI provider response exceeded the application limit')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as T
}

export function isCompleteAIFinishReason(finishReason: unknown) {
  return finishReason === 'stop'
}

export function isCompleteAIStreamTermination(
  finishReason: unknown,
  receivedDoneMarker: boolean,
) {
  return isCompleteAIFinishReason(finishReason)
    || ((finishReason === undefined || finishReason === null) && receivedDoneMarker)
}

export function createAIIncompleteResponse({
  provider,
  model,
}: {
  provider: string
  model: string
}): AIProviderFailure {
  return {
    type: 'error',
    code: 'AI_PROVIDER_INCOMPLETE_RESPONSE',
    message: '模型输出未完整结束，请缩短输入或降低输出长度后重试。',
    provider,
    model,
    retryable: false,
  }
}

type BuildAIChatCompletionBodyOptions = {
  provider: string
  model: string
  messages: AIChatMessage[]
  maxTokens: number
  temperature?: number
  topP?: number
  stream?: boolean
  fixedTemperature?: boolean
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

function normalizeMaxTokens(provider: string, model: string, value: number) {
  const upperBound = getAIModelParameterPolicy(provider, model).maxOutputTokens

  return Math.round(clampNumber(value, 1, upperBound))
}

/**
 * Kimi K3/K2 generation models currently control sampling internally. Sending
 * temperature or top_p can be rejected by the provider, so both are omitted.
 */
export function modelControlsSampling(provider: string, model: string) {
  const policy = getAIModelDefinition(provider, model)?.requestPolicy
  return policy?.temperatureMode === 'provider-default'
    || (provider === 'kimi' && /^kimi-k(?:3|2)(?:[.\-]|$)/i.test(model))
}

/**
 * Builds the OpenAI-compatible request body used by every remote text route.
 * Provider-specific exceptions live here so routes cannot drift apart.
 */
export function buildAIChatCompletionBody({
  provider,
  model,
  messages,
  maxTokens,
  temperature,
  topP,
  stream = false,
  fixedTemperature = false,
}: BuildAIChatCompletionBodyOptions): AIChatCompletionBody {
  const providerControlsSampling = modelControlsSampling(provider, model)
  const parameterPolicy = getAIModelParameterPolicy(provider, model)
  const tokenParameter = getAIModelDefinition(provider, model)?.requestPolicy.tokenParameter ?? 'max_tokens'
  const body: AIChatCompletionBody = {
    model,
    messages,
    stream,
  }

  body[tokenParameter] = normalizeMaxTokens(provider, model, maxTokens)

  if (!fixedTemperature && !providerControlsSampling && temperature !== undefined) {
    body.temperature = clampNumber(
      temperature,
      parameterPolicy.temperature.min,
      parameterPolicy.temperature.max,
    )
  }

  if (!providerControlsSampling && topP !== undefined) {
    body.top_p = clampNumber(topP, parameterPolicy.topP.min, parameterPolicy.topP.max)
  }

  if (provider === 'xiaomi') {
    body.thinking = { type: 'disabled' }
  }

  if (provider === 'minimax') {
    body.reasoning_split = true
  }

  return body
}

export function createAIProviderFailure({
  provider,
  model,
  status,
}: {
  provider: string
  model: string
  status?: number
}): AIProviderFailure {
  return {
    type: 'error',
    code: 'AI_PROVIDER_REQUEST_FAILED',
    message: '所选模型暂时不可用，请稍后重试或手动选择其他模型。',
    provider,
    model,
    ...(status === undefined ? {} : { status }),
    retryable: status === undefined || status === 408 || status === 429 || status >= 500,
  }
}

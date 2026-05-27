import { NextRequest, NextResponse } from 'next/server'
import { AI_MODELS } from '@/config/ai'
import { requireAuth } from '@/lib/auth'
import { sanitizeAIProviderError } from '@/lib/ai-error-sanitizer'
import { validateAIModel } from '@/lib/ai-utils'
import { getUserProviderRuntimeConfig, UserProviderRuntimeConfig } from '@/lib/user-provider-config'

type DiagnosticStatus = 'ready' | 'configured' | 'missing-key' | 'missing-base-url' | 'rate-limited' | 'billing' | 'error'
type DiagnosticMode = 'config' | 'probe'

type CachedDiagnostic = {
  checkedAt: string
  provider: string
  name: string
  model: string
  keyConfigured: boolean
  callable: boolean
  status: DiagnosticStatus
  message: string
  latencyMs: number | null
  cached?: boolean
}

const CHEAP_DIAGNOSTIC_MODELS: Record<string, string[]> = {
  qwen: ['qwen3.6-flash', 'qwen-turbo', 'qwen-plus'],
  deepseek: ['deepseek-v4-flash', 'deepseek-chat'],
  kimi: ['moonshot-v1-32k', 'kimi-k2.5'],
  zhipu: ['glm-4.7-flash', 'glm-5-turbo'],
  minimax: ['MiniMax-M2.5-highspeed', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.1'],
  xiaomi: ['mimo-v2-flash', 'mimo-v2.5'],
}

const PROBE_CACHE_TTL_MS = 10 * 60 * 1000
const globalDiagnosticsCache = globalThis as unknown as { __aiDiagnosticsProbeCache?: Map<string, CachedDiagnostic> }
const probeCache = globalDiagnosticsCache.__aiDiagnosticsProbeCache ?? new Map<string, CachedDiagnostic>()
if (process.env.NODE_ENV !== 'production') globalDiagnosticsCache.__aiDiagnosticsProbeCache = probeCache

function classifyError(errorText: string): DiagnosticStatus {
  const normalized = errorText.toLowerCase()
  if (normalized.includes('quota') || normalized.includes('balance') || normalized.includes('billing') || normalized.includes('insufficient') || normalized.includes('402')) return 'billing'
  if (normalized.includes('rate') || normalized.includes('429') || normalized.includes('limit')) return 'rate-limited'
  return 'error'
}

type DiagnosticRequestConfig = {
  fixedTemperature?: boolean
  temperature: number
}

function getRequestBody(provider: string, model: string, config: DiagnosticRequestConfig) {
  const messages = [
    { role: 'system', content: 'You are a concise health-check assistant.' },
    { role: 'user', content: 'OK' },
  ]

  const temperature = config.fixedTemperature ? 1 : 0.2

  if (provider === 'minimax') {
    return { model, messages, max_completion_tokens: 2, temperature: Math.max(0.01, Math.min(1, temperature)), stream: false }
  }

  if (provider === 'xiaomi') {
    return { model, messages, max_completion_tokens: 2, temperature: 1, top_p: 0.95, thinking: { type: 'disabled' }, stream: false }
  }

  return { model, messages, max_tokens: 2, temperature, stream: false }
}

function getDiagnosticModel(provider: string, models: Record<string, unknown>) {
  const preferred = CHEAP_DIAGNOSTIC_MODELS[provider] || []
  return preferred.find(model => model in models) || Object.keys(models)[0]
}

function getConfigOnlyResult(provider: string, config: typeof AI_MODELS[keyof typeof AI_MODELS], runtimeConfig?: UserProviderRuntimeConfig | null): CachedDiagnostic {
  const model = getDiagnosticModel(provider, config.models)
  const validation = validateAIModel(provider, model, runtimeConfig || undefined)
  const missingBaseUrl = validation.error?.includes('API地址')
  const missingKey = validation.error?.includes('API密钥')

  return {
    checkedAt: new Date().toISOString(),
    provider,
    name: config.name,
    model,
    keyConfigured: !missingKey,
    callable: false,
    status: validation.isValid ? 'configured' : missingBaseUrl ? 'missing-base-url' : 'missing-key',
    message: validation.isValid ? '配置已就绪，未发起真实模型调用' : validation.error || '配置不可用',
    latencyMs: null,
  }
}

async function probeProvider(provider: string, config: typeof AI_MODELS[keyof typeof AI_MODELS], force: boolean, userId?: number | null, runtimeConfig?: UserProviderRuntimeConfig | null): Promise<CachedDiagnostic> {
  const model = getDiagnosticModel(provider, config.models)
  const validation = validateAIModel(provider, model, runtimeConfig || undefined)
  const cacheKey = `${userId ? `user:${userId}` : 'platform'}:${provider}:${model}`
  const cached = probeCache.get(cacheKey)

  if (!force && cached && Date.now() - new Date(cached.checkedAt).getTime() < PROBE_CACHE_TTL_MS) {
    return { ...cached, cached: true }
  }

  if (!validation.isValid || !validation.config) {
    const missingBaseUrl = validation.error?.includes('API地址')
    return {
      checkedAt: new Date().toISOString(),
      provider,
      name: config.name,
      model,
      keyConfigured: !validation.error?.includes('API密钥'),
      callable: false,
      status: missingBaseUrl ? 'missing-base-url' : 'missing-key',
      message: validation.error || '配置不可用',
      latencyMs: null,
    }
  }

  const requestStartedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), provider === 'xiaomi' ? 30000 : 10000)

  try {
    const response = await fetch(`${validation.config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: validation.config.headers.Authorization,
      },
      body: JSON.stringify(getRequestBody(provider, validation.config.model, validation.config)),
      signal: controller.signal,
    })

    const latencyMs = Date.now() - requestStartedAt
    if (!response.ok) {
      const safeError = sanitizeAIProviderError(await response.text())
      const result: CachedDiagnostic = {
        checkedAt: new Date().toISOString(),
        provider,
        name: config.name,
        model,
        keyConfigured: true,
        callable: false,
        status: classifyError(`${response.status} ${safeError}`),
        message: safeError || `HTTP ${response.status}`,
        latencyMs,
      }
      probeCache.set(cacheKey, result)
      return result
    }

    const result: CachedDiagnostic = {
      checkedAt: new Date().toISOString(),
      provider,
      name: config.name,
      model,
      keyConfigured: true,
      callable: true,
      status: 'ready',
      message: '低成本探针调用成功',
      latencyMs,
    }
    probeCache.set(cacheKey, result)
    return result
  } catch (error) {
    const result: CachedDiagnostic = {
      checkedAt: new Date().toISOString(),
      provider,
      name: config.name,
      model,
      keyConfigured: true,
      callable: false,
      status: 'error',
      message: error instanceof Error ? sanitizeAIProviderError(error.message) : '检测失败',
      latencyMs: Date.now() - requestStartedAt,
    }
    probeCache.set(cacheKey, result)
    return result
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const body = await request.json().catch(() => ({})) as { mode?: DiagnosticMode; force?: boolean; confirmed?: boolean }
  const mode: DiagnosticMode = body.mode === 'probe' ? 'probe' : 'config'
  const force = Boolean(body.force)
  if (mode === 'probe' && body.confirmed !== true) {
    return NextResponse.json({ success: false, error: '实际调用探针需要用户确认' }, { status: 400 })
  }
  const auth = await requireAuth(request)
  const userId = 'error' in auth ? null : auth.user.id

  const providers = await Promise.all(Object.entries(AI_MODELS).map(async ([provider, config]) => {
    const runtimeConfig = await getUserProviderRuntimeConfig(userId, provider)
    return mode === 'probe'
      ? probeProvider(provider, config, force, userId, runtimeConfig)
      : getConfigOnlyResult(provider, config, runtimeConfig)
  }))

  return NextResponse.json({
    success: true,
    data: {
      mode,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      cacheTtlMs: PROBE_CACHE_TTL_MS,
      providers,
    }
  })
}
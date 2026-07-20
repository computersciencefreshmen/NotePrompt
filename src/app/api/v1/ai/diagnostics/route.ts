import { NextRequest, NextResponse } from 'next/server'
import { AI_MODELS } from '@/config/ai'
import { AI_MODEL_CATALOG, PublicAIModelDefinition, isPublicAIProvider } from '@/config/ai-models'
import { validateAIModel } from '@/lib/ai-utils'
import { getUserProviderRuntimeConfig, UserProviderRuntimeConfig } from '@/lib/user-provider-config'
import { requireAIUser, reserveAIUsage, requestPolicyResponse, AIUsageReservation } from '@/lib/ai-runtime-security'
import { readLimitedJson } from '@/lib/ai-runtime-policy'
import { buildAIChatCompletionBody } from '@/lib/ai-request-policy'

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

const PROBE_CACHE_TTL_MS = 10 * 60 * 1000
const PROBE_CACHE_MAX_ENTRIES = 500
const globalDiagnosticsCache = globalThis as unknown as { __aiDiagnosticsProbeCache?: Map<string, CachedDiagnostic> }
const probeCache = globalDiagnosticsCache.__aiDiagnosticsProbeCache ?? new Map<string, CachedDiagnostic>()
if (process.env.NODE_ENV !== 'production') globalDiagnosticsCache.__aiDiagnosticsProbeCache = probeCache

function cacheProbeResult(cacheKey: string, result: CachedDiagnostic) {
  const now = Date.now()
  for (const [key, cached] of probeCache) {
    const checkedAt = Date.parse(cached.checkedAt)
    if (!Number.isFinite(checkedAt) || now - checkedAt >= PROBE_CACHE_TTL_MS) probeCache.delete(key)
  }

  probeCache.delete(cacheKey)
  while (probeCache.size >= PROBE_CACHE_MAX_ENTRIES) {
    const oldestKey = probeCache.keys().next().value
    if (typeof oldestKey !== 'string') break
    probeCache.delete(oldestKey)
  }
  probeCache.set(cacheKey, result)
}

function classifyError(errorText: string): DiagnosticStatus {
  const normalized = errorText.toLowerCase()
  if (normalized.includes('unauthorized') || normalized.includes('forbidden') || normalized.includes('authentication') || normalized.includes('401') || normalized.includes('403')) return 'missing-key'
  if (normalized.includes('quota') || normalized.includes('balance') || normalized.includes('billing') || normalized.includes('insufficient') || normalized.includes('402')) return 'billing'
  if (normalized.includes('rate') || normalized.includes('429') || normalized.includes('limit')) return 'rate-limited'
  return 'error'
}

function diagnosticFailureMessage(status: DiagnosticStatus, httpStatus: number) {
  if (status === 'missing-key') return `供应商认证失败（HTTP ${httpStatus}）`
  if (status === 'billing') return `供应商账户额度不足（HTTP ${httpStatus}）`
  if (status === 'rate-limited') return `供应商限流（HTTP ${httpStatus}）`
  return `供应商探针失败（HTTP ${httpStatus}）`
}

function getDiagnosticModel(provider: string, models: Record<string, unknown>) {
  if (isPublicAIProvider(provider)) {
    const catalogModels = Object.values(AI_MODEL_CATALOG[provider].models) as PublicAIModelDefinition[]
    const availableModels = catalogModels.filter(model => model.id in models)
    return availableModels.find(model => model.tier === 'fast')?.id
      || availableModels.find(model => model.tier === 'balanced')?.id
      || availableModels.find(model => model.default)?.id
      || availableModels[0]?.id
  }

  return Object.keys(models)[0]
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

async function probeProvider(
  provider: string,
  config: typeof AI_MODELS[keyof typeof AI_MODELS],
  force: boolean,
  userId?: number | null,
  runtimeConfig?: UserProviderRuntimeConfig | null,
  onProviderCallStart?: () => void,
): Promise<CachedDiagnostic> {
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
    onProviderCallStart?.()
    const response = await fetch(`${validation.config.baseURL}/chat/completions`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Authorization: validation.config.headers.Authorization,
      },
      body: JSON.stringify(buildAIChatCompletionBody({
        provider,
        model: validation.config.model,
        messages: [
          { role: 'system', content: 'You are a concise health-check assistant.' },
          { role: 'user', content: 'OK' },
        ],
        maxTokens: 2,
        temperature: 0.2,
        topP: provider === 'xiaomi' ? 0.95 : undefined,
        fixedTemperature: validation.config.fixedTemperature,
      })),
      signal: controller.signal,
    })

    const latencyMs = Date.now() - requestStartedAt
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      const status = classifyError(String(response.status))
      console.warn(`AI diagnostic failed for ${provider}/${model} (${response.status})`)
      const result: CachedDiagnostic = {
        checkedAt: new Date().toISOString(),
        provider,
        name: config.name,
        model,
        keyConfigured: true,
        callable: false,
        status,
        message: diagnosticFailureMessage(status, response.status),
        latencyMs,
      }
      cacheProbeResult(cacheKey, result)
      return result
    }

    await response.body?.cancel().catch(() => undefined)

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
    cacheProbeResult(cacheKey, result)
    return result
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    const result: CachedDiagnostic = {
      checkedAt: new Date().toISOString(),
      provider,
      name: config.name,
      model,
      keyConfigured: true,
      callable: false,
      status: 'error',
      message: timedOut ? '供应商探针请求超时' : '供应商探针调用失败',
      latencyMs: Date.now() - requestStartedAt,
    }
    cacheProbeResult(cacheKey, result)
    return result
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAIUser(request)
  if (!auth.ok) return auth.response

  const startedAt = Date.now()
  let reservation: AIUsageReservation | undefined

  try {
    const body = await readLimitedJson<{
      mode?: DiagnosticMode
      force?: unknown
      confirmed?: unknown
      provider?: unknown
    }>(request)
    const mode: DiagnosticMode = body.mode === 'probe' ? 'probe' : 'config'
    if (body.force !== undefined && typeof body.force !== 'boolean') {
      return NextResponse.json({ success: false, error: 'force 必须是布尔值' }, { status: 400 })
    }
    const force = body.force === true
    if (mode === 'probe' && body.confirmed !== true) {
      return NextResponse.json({ success: false, error: '实际调用探针需要用户确认' }, { status: 400 })
    }
    if (
      body.provider !== undefined &&
      (typeof body.provider !== 'string' || !Object.prototype.hasOwnProperty.call(AI_MODELS, body.provider))
    ) {
      return NextResponse.json({ success: false, error: '不支持的模型供应商' }, { status: 400 })
    }

    const entries = await Promise.all(Object.entries(AI_MODELS).map(async ([provider, config]) => {
      const runtimeConfig = await getUserProviderRuntimeConfig(auth.user.id, provider)
      return {
        provider,
        config,
        runtimeConfig,
        diagnostic: getConfigOnlyResult(provider, config, runtimeConfig),
      }
    }))

    let providers = entries.map(entry => entry.diagnostic)
    let probedProvider: string | null = null

    if (mode === 'probe') {
      const requestedProvider = typeof body.provider === 'string' ? body.provider : null
      const target = requestedProvider
        ? entries.find(entry => entry.provider === requestedProvider)
        : entries.find(entry => entry.diagnostic.status === 'configured')

      // A probe request is allowed to make at most one external call. Missing
      // provider configuration is reported without consuming user/global quota.
      if (target && target.diagnostic.status === 'configured') {
        const quota = await reserveAIUsage(auth.user, 'ai_optimize')
        if (!quota.ok) return quota.response
        reservation = quota.reservation

        const diagnostic = await probeProvider(
          target.provider,
          target.config,
          force,
          auth.user.id,
          target.runtimeConfig,
          () => reservation?.markProviderCallStarted(),
        )
        probedProvider = target.provider
        providers = entries.map(entry => entry.provider === target.provider ? diagnostic : entry.diagnostic)

        // Cached probes never invoke the callback and therefore remain
        // refundable. A dispatched provider request has already committed.
        await reservation.rollback()
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        mode,
        checkedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        cacheTtlMs: PROBE_CACHE_TTL_MS,
        probedProvider,
        providers,
      }
    })
  } catch (error) {
    await reservation?.rollback()
    return requestPolicyResponse(error)
  }
}

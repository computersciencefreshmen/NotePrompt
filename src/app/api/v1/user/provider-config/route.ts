import { NextRequest, NextResponse } from 'next/server'
import { AI_MODELS } from '@/config/ai'
import { requireAuth } from '@/lib/auth'
import { checkRateLimit, createRateLimitResponse, rateLimitHttpStatus } from '@/lib/rate-limit'
import {
  deleteUserProviderConfig,
  listUserProviderConfigs,
  upsertUserProviderConfig,
} from '@/lib/user-provider-config'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'

const MAX_PROVIDER_CONFIG_BODY_BYTES = 32 * 1024
const MAX_PROVIDER_API_KEY_CHARS = 4096
const MAX_PROVIDER_BASE_URL_CHARS = 500

function isSupportedProvider(provider: unknown): provider is keyof typeof AI_MODELS {
  return typeof provider === 'string' && Object.prototype.hasOwnProperty.call(AI_MODELS, provider)
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const rateCheck = await checkRateLimit(`user-provider-config:${auth.user.id}`, { windowMs: 60000, maxRequests: 10 })
    if (!rateCheck.allowed) {
      return NextResponse.json(createRateLimitResponse(rateCheck), { status: rateLimitHttpStatus(rateCheck) })
    }

    const providers = await listUserProviderConfigs(auth.user.id)
    return NextResponse.json({ success: true, data: { providers } })
  } catch (error) {
    console.error('Failed to load user provider configs:', error)
    return NextResponse.json({ success: false, error: '读取个人模型配置失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const rateCheck = await checkRateLimit(`user-provider-config:${auth.user.id}`, { windowMs: 60000, maxRequests: 10 })
    if (!rateCheck.allowed) {
      return NextResponse.json(createRateLimitResponse(rateCheck), { status: rateLimitHttpStatus(rateCheck) })
    }

    const body = await readLimitedJson<{ provider?: unknown; apiKey?: unknown; baseURL?: unknown }>(
      request,
      MAX_PROVIDER_CONFIG_BODY_BYTES,
    )
    if (Object.keys(body).some(key => !['provider', 'apiKey', 'baseURL'].includes(key))) {
      return NextResponse.json(
        { success: false, error: '请求包含不支持的字段' },
        { status: 400 },
      )
    }
    if (!isSupportedProvider(body.provider)) {
      return NextResponse.json({ success: false, error: '不支持的模型供应商' }, { status: 400 })
    }

    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
    if (!apiKey) {
      return NextResponse.json({ success: false, error: '请输入 API Key' }, { status: 400 })
    }
    if (apiKey.length > MAX_PROVIDER_API_KEY_CHARS) {
      return NextResponse.json({ success: false, error: 'API Key 过长' }, { status: 413 })
    }

    const baseURL = typeof body.baseURL === 'string' ? body.baseURL.trim() : ''
    if (baseURL.length > MAX_PROVIDER_BASE_URL_CHARS) {
      return NextResponse.json({ success: false, error: 'API 地址过长' }, { status: 413 })
    }
    await upsertUserProviderConfig(auth.user.id, body.provider, apiKey, baseURL)
    const providers = await listUserProviderConfigs(auth.user.id)

    return NextResponse.json({ success: true, data: { providers } })
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('Failed to save user provider config')
    return NextResponse.json({ success: false, error: '保存个人模型配置失败' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const rateCheck = await checkRateLimit(`user-provider-config:${auth.user.id}`, { windowMs: 60000, maxRequests: 10 })
    if (!rateCheck.allowed) {
      return NextResponse.json(createRateLimitResponse(rateCheck), { status: rateLimitHttpStatus(rateCheck) })
    }

    const provider = request.nextUrl.searchParams.get('provider')
    if (!isSupportedProvider(provider)) {
      return NextResponse.json({ success: false, error: '不支持的模型供应商' }, { status: 400 })
    }

    await deleteUserProviderConfig(auth.user.id, provider)
    const providers = await listUserProviderConfigs(auth.user.id)

    return NextResponse.json({ success: true, data: { providers } })
  } catch (error) {
    console.error('Failed to delete user provider config:', error)
    return NextResponse.json({ success: false, error: '删除个人模型配置失败' }, { status: 500 })
  }
}

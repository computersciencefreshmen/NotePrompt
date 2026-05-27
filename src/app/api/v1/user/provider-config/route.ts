import { NextRequest, NextResponse } from 'next/server'
import { AI_MODELS } from '@/config/ai'
import { requireAuth } from '@/lib/auth'
import { checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import {
  deleteUserProviderConfig,
  listUserProviderConfigs,
  upsertUserProviderConfig,
} from '@/lib/user-provider-config'

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
    if (!rateCheck.allowed && rateCheck.resetAt) {
      return NextResponse.json(createRateLimitResponse(rateCheck.resetAt), { status: 429 })
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
    if (!rateCheck.allowed && rateCheck.resetAt) {
      return NextResponse.json(createRateLimitResponse(rateCheck.resetAt), { status: 429 })
    }

    const body = await request.json().catch(() => ({})) as { provider?: unknown; apiKey?: unknown; baseURL?: unknown }
    if (!isSupportedProvider(body.provider)) {
      return NextResponse.json({ success: false, error: '不支持的模型供应商' }, { status: 400 })
    }

    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
    if (!apiKey) {
      return NextResponse.json({ success: false, error: '请输入 API Key' }, { status: 400 })
    }

    const baseURL = typeof body.baseURL === 'string' ? body.baseURL.trim() : ''
    await upsertUserProviderConfig(auth.user.id, body.provider, apiKey, baseURL)
    const providers = await listUserProviderConfigs(auth.user.id)

    return NextResponse.json({ success: true, data: { providers } })
  } catch (error) {
    console.error('Failed to save user provider config:', error)
    return NextResponse.json({ success: false, error: '保存个人模型配置失败' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
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

import { NextRequest, NextResponse } from 'next/server'
import { AI_MODELS } from '@/config/ai'
import { requireAdminAuth } from '@/lib/auth'
import { maskSecret, readProviderConfig, writeProviderConfig } from '@/lib/provider-runtime-config'

type ProviderKey = keyof typeof AI_MODELS

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 403 })
  }

  const localConfig = readProviderConfig()
  const providers = Object.entries(AI_MODELS).map(([provider, config]) => {
    const key = provider as ProviderKey
    const configuredApiKey = localConfig[key]?.apiKey || config.apiKey || ''
    const configuredBaseURL = localConfig[key]?.baseURL || config.baseURL || ''

    return {
      provider,
      name: config.name,
      keyConfigured: Boolean(configuredApiKey),
      keyPreview: maskSecret(configuredApiKey),
      baseURL: configuredBaseURL,
      modelCount: Object.keys(config.models).length,
      editable: true,
    }
  })

  return NextResponse.json({ success: true, data: { providers } })
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 403 })
    }

    const body = await request.json()
    const provider = typeof body.provider === 'string' ? body.provider : ''
    if (!Object.prototype.hasOwnProperty.call(AI_MODELS, provider)) {
      return NextResponse.json({ success: false, error: '不支持的模型供应商' }, { status: 400 })
    }

    const currentConfig = readProviderConfig()
    const existing = currentConfig[provider] || {}
    const apiKey = typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : existing.apiKey
    const baseURL = typeof body.baseURL === 'string' ? body.baseURL.trim() : existing.baseURL

    currentConfig[provider] = {
      apiKey: apiKey || undefined,
      baseURL: baseURL || undefined,
    }
    writeProviderConfig(currentConfig)

    return NextResponse.json({
      success: true,
      data: {
        provider,
        keyConfigured: Boolean(currentConfig[provider].apiKey),
        keyPreview: maskSecret(currentConfig[provider].apiKey),
        baseURL: currentConfig[provider].baseURL || '',
      },
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '保存配置失败' }, { status: 500 })
  }
}
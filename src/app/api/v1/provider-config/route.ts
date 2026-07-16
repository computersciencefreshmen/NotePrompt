import { NextRequest, NextResponse } from 'next/server'
import { AI_MODELS } from '@/config/ai'
import { requireAdminAuth } from '@/lib/auth'
import { maskSecret } from '@/lib/provider-runtime-config'

type ProviderKey = keyof typeof AI_MODELS

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 403 })
  }

  const providers = Object.entries(AI_MODELS).map(([provider, config]) => {
    const key = provider as ProviderKey
    const configuredApiKey = AI_MODELS[key].apiKey || ''
    const configuredBaseURL = AI_MODELS[key].baseURL || ''

    return {
      provider,
      name: config.name,
      keyConfigured: Boolean(configuredApiKey),
      keyPreview: maskSecret(configuredApiKey),
      baseURL: configuredBaseURL,
      modelCount: Object.keys(config.models).length,
      editable: false,
      managedBy: 'environment',
    }
  })

  return NextResponse.json({ success: true, data: { providers } })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 403 })
  }

  return NextResponse.json(
    { success: false, error: '平台模型配置由部署环境管理，不能通过 Web API 修改' },
    { status: 405, headers: { Allow: 'GET' } },
  )
}

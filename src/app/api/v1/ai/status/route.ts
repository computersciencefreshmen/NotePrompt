import { NextRequest, NextResponse } from 'next/server'
import {
  AI_MODEL_CATALOG_VERIFIED_AT,
  DEFAULT_PUBLIC_AI_PROVIDER,
  getAIModelDefinition,
  getAIPersonalQuotaPolicy,
  getDefaultAIModel,
  isPublicAIProvider,
} from '@/config/ai-models'
import { validateAIModel, getRecommendedModels } from '@/lib/ai-utils'
import { requireAIUser } from '@/lib/ai-runtime-security'
import { getUserProviderRuntimeConfig } from '@/lib/user-provider-config'

export async function GET(request: NextRequest) {
  const auth = await requireAIUser(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const requestedProvider = searchParams.get('provider')
    if (
      requestedProvider !== null
      && (
        requestedProvider.length === 0
        || requestedProvider.length > 32
        || requestedProvider.trim() !== requestedProvider
        || !isPublicAIProvider(requestedProvider)
      )
    ) {
      return NextResponse.json({ success: false, error: '不支持的模型供应商' }, { status: 400 })
    }
    const provider = requestedProvider ?? DEFAULT_PUBLIC_AI_PROVIDER
    const requestedModel = searchParams.get('model')
    if (
      requestedModel !== null
      && (
        requestedModel.length === 0
        || requestedModel.length > 128
        || requestedModel.trim() !== requestedModel
      )
    ) {
      return NextResponse.json({ success: false, error: '不支持的模型' }, { status: 400 })
    }
    const model = requestedModel ?? getDefaultAIModel(provider)
    const modelDefinition = getAIModelDefinition(provider, model)
    if (!modelDefinition) {
      return NextResponse.json({ success: false, error: '不支持的模型' }, { status: 400 })
    }
    const runtimeConfig = await getUserProviderRuntimeConfig(auth.user.id, provider)

    // 验证指定模型
    const modelValidation = validateAIModel(provider, model, runtimeConfig || undefined)

    // 获取推荐模型
    const recommendedModels = getRecommendedModels()

    return NextResponse.json({
      success: true,
      data: {
        currentModel: {
          provider,
          model,
          isValid: modelValidation.isValid,
          error: modelValidation.error,
          catalogStatus: modelDefinition.availability.status,
          catalogVerifiedAt: AI_MODEL_CATALOG_VERIFIED_AT,
          configurationStatus: modelValidation.isValid
            ? 'configured'
            : modelValidation.error?.includes('API地址')
              ? 'missing-base-url'
              : modelValidation.error?.includes('API密钥')
                ? 'missing-key'
                : 'invalid',
          probeStatus: 'not-checked',
          personalQuota: getAIPersonalQuotaPolicy(provider, model),
        },
        recommended: recommendedModels
      }
    })

  } catch {
    return NextResponse.json(
      {
        success: false,
        error: '状态检查失败'
      },
      { status: 500 }
    )
  }
}

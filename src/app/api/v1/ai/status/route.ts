import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_PUBLIC_AI_PROVIDER, getDefaultAIModel } from '@/config/ai-models'
import { validateAIModel, getRecommendedModels } from '@/lib/ai-utils'
import { requireAIUser } from '@/lib/ai-runtime-security'
import { getUserProviderRuntimeConfig } from '@/lib/user-provider-config'

export async function GET(request: NextRequest) {
  const auth = await requireAIUser(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider') || DEFAULT_PUBLIC_AI_PROVIDER
    const model = searchParams.get('model') || getDefaultAIModel(provider)
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
          error: modelValidation.error
        },
        recommended: recommendedModels
      }
    })

  } catch (error) {
    console.error('AI状态检查失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '状态检查失败'
      },
      { status: 500 }
    )
  }
}

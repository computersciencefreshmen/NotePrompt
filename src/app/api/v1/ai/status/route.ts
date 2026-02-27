import { NextRequest, NextResponse } from 'next/server'
import { validateAIModel, getRecommendedModels } from '@/lib/ai-utils'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider') || 'qwen'
    const model = searchParams.get('model') || 'qwen3.5-plus'

    // 验证指定模型
    const modelValidation = validateAIModel(provider, model)

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
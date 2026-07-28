import { NextRequest, NextResponse } from 'next/server'
import { getAIRequestConfig, aiConfig } from '@/config/ai'
import { DEFAULT_PUBLIC_AI_PROVIDER, getDefaultAIModel } from '@/config/ai-models'
import { getUserProviderRuntimeConfig } from '@/lib/user-provider-config'
import { AIUsageReservation, requireAIUser, reserveAIUsage, requestPolicyResponse } from '@/lib/ai-runtime-security'
import { buildAIChatCompletionBody, createAIIncompleteResponse, createAIProviderFailure, isCompleteAIFinishReason, readLimitedAIProviderJSON } from '@/lib/ai-request-policy'
import {
  MAX_AI_INPUT_CHARS,
  MAX_CONVERSATION_HISTORY_MESSAGES,
  parseConversationHistory,
  readLimitedJson,
  RequestPolicyError,
} from '@/lib/ai-runtime-policy'
import { ConversationMessage } from '@/types'

function buildPromptTitle(content: string) {
  const line = content
    .split('\n')
    .map(item => item.replace(/^#+\s*/, '').replace(/^[-*\d.、\s]+/, '').trim())
    .find(Boolean) || '优化提示词'

  return line.replace(/[：:。,.，；;]+$/g, '').slice(0, 24) || '优化提示词'
}

function buildVisibleThinkingSummary(optimizationMode: 'optimize' | 'rewrite', userFeedback: string) {
  return optimizationMode === 'rewrite'
    ? `已按“${userFeedback.slice(0, 80)}”重新评估原始目标，并生成一版完整重写结果。`
    : `已对照上一版提示词处理“${userFeedback.slice(0, 80)}”，保留有效结构并只调整本轮要求涉及的部分。`
}

/**
* 多轮优化提示词API
* 请求体大小限制: 256KiB（服务端按实际读取字节强制执行）
* 输入验证: 各输入字段长度不能超过10000字符
* 对话历史长度限制: 最多20条
*/
export async function POST(request: NextRequest) {
  const auth = await requireAIUser(request)
  if (!auth.ok) return auth.response

  let reservation: AIUsageReservation | undefined
  let selectedProvider = ''
  let selectedModel = ''

  try {
    const body = await readLimitedJson<Record<string, unknown>>(request)
    const originalPrompt = typeof body.originalPrompt === 'string' ? body.originalPrompt : ''
    const currentPrompt = typeof body.currentPrompt === 'string' ? body.currentPrompt : ''
    const userFeedback = typeof body.userFeedback === 'string' ? body.userFeedback : ''
    const conversationHistory = parseConversationHistory(body.conversationHistory)
    const optimizationMode: 'optimize' | 'rewrite' = body.optimizationMode === 'rewrite' ? 'rewrite' : 'optimize'
    const rawProvider = body.provider ?? body.modelType
    const rawModel = body.model ?? body.modelName
    const provider = typeof rawProvider === 'string' ? rawProvider : DEFAULT_PUBLIC_AI_PROVIDER
    const model = typeof rawModel === 'string' ? rawModel : getDefaultAIModel(provider)
    const temperatureOverride = typeof body.temperature === 'number' ? body.temperature : undefined
    const rawTopP = body.topP ?? body.top_p
    const rawMaxTokens = body.maxTokens ?? body.max_tokens
    const topPOverride = typeof rawTopP === 'number' ? rawTopP : undefined
    const maxTokensOverride = typeof rawMaxTokens === 'number' ? rawMaxTokens : undefined

    // 输入长度限制
    if (
      originalPrompt.length > MAX_AI_INPUT_CHARS ||
      currentPrompt.length > MAX_AI_INPUT_CHARS ||
      userFeedback.length > MAX_AI_INPUT_CHARS
    ) {
      return NextResponse.json({ error: "输入长度不能超过" + MAX_AI_INPUT_CHARS + "字符" }, { status: 400 });
    }
    if (!originalPrompt || !currentPrompt || !userFeedback) {
      // 对话历史长度限制
      return NextResponse.json(
        { error: 'originalPrompt, currentPrompt, and userFeedback are required' },
        { status: 400 }
      )
    }

    const userRuntimeConfig = await getUserProviderRuntimeConfig(auth.user.id, provider)

    // 获取AI配置
    const config = getAIRequestConfig(provider, model, userRuntimeConfig || undefined)
    selectedProvider = config.provider
    selectedModel = config.modelId
    if (!config.headers.Authorization || !config.baseURL) {
      return NextResponse.json(
        { success: false, error: '所选 AI 提供商尚未完成可用配置' },
        { status: 400 },
      )
    }
    const systemPrompt = aiConfig.prompts.multiTurn
    const quota = await reserveAIUsage(auth.user, 'ai_optimize', { provider: config.provider, model: config.modelId })
    if (!quota.ok) return quota.response
    reservation = quota.reservation

    // 构建对话历史（带长度限制）
    const history = conversationHistory.slice(-(MAX_CONVERSATION_HISTORY_MESSAGES - 2))
    const messages = [
      {
        role: 'system' as const,
        content: systemPrompt
      },
      ...history,
      {
        role: 'user' as const,
        content: optimizationMode === 'rewrite' 
          ? `原始提示词：\n${originalPrompt}\n\n用户要求重新生成：\n${userFeedback}\n\n请按要求生成一版完整的新提示词。`
          : `请引用并修改上一版提示词，不要重新开始。\n\n上一版提示词：\n${currentPrompt}\n\n用户本轮修改要求：\n${userFeedback}\n\n请输出修改后的完整提示词。`
      }
    ]

    // 调用用户明确选择的提供商；请求发出后即按一次 AI 调用计费。
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    const requestBody = buildAIChatCompletionBody({
      provider: config.provider,
      model: config.model,
      messages,
      maxTokens: maxTokensOverride ?? config.max_tokens,
      temperature: temperatureOverride ?? config.temperature,
      topP: topPOverride ?? config.top_p,
      fixedTemperature: config.fixedTemperature,
    })

    let response: Response
    let data: { choices?: Array<{ finish_reason?: unknown; message?: { content?: string } }> }
    try {
      reservation.markProviderCallStarted()
      response = await fetch(`${config.baseURL}/chat/completions`, {
        method: 'POST',
        redirect: 'error',
        headers: config.headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        return NextResponse.json(
          { success: false, ...createAIProviderFailure({ provider: config.provider, model: config.modelId, status: response.status }) },
          { status: 502 },
        )
      }

      data = await readLimitedAIProviderJSON<{
        choices?: Array<{ finish_reason?: unknown; message?: { content?: string } }>
      }>(response)
    } finally {
      clearTimeout(timeoutId)
    }

    const choice = data.choices?.[0]
    if (!isCompleteAIFinishReason(choice?.finish_reason)) {
      return NextResponse.json(
        { success: false, ...createAIIncompleteResponse({ provider: config.provider, model: config.modelId }) },
        { status: 502 },
      )
    }
    const optimizedPrompt = choice?.message?.content

    if (!optimizedPrompt) {
      throw new Error('No response from AI model')
    }

    // 处理AI响应，去掉说明文字
    let finalOptimizedPrompt = optimizedPrompt.trim()
    
    // 去掉常见的说明文字 - 增强版过滤
    const removePatterns = [
      // 基础说明文字
      /^\*\*优化后的提示词\*\*:?\s*/i,
      /^\*\*优化结果\*\*:?\s*/i,
      /^\*\*优化版本\*\*:?\s*/i,
      /^\*\*优化的提示词\*\*:?\s*/i,
      /^\*\*改进后的提示词\*\*:?\s*/i,
      /^\*\*重构后的提示词\*\*:?\s*/i,
      
      // 常见介绍语句
      /^以下是优化后的提示词:?\s*/i,
      /^优化后的提示词如下:?\s*/i,
      /^优化结果如下:?\s*/i,
      /^优化版本如下:?\s*/i,
      /^改进后的提示词:?\s*/i,
      /^重构后的提示词:?\s*/i,
      /^基于您的要求，优化后的提示词是:?\s*/i,
      /^根据您的需求，优化后的提示词如下:?\s*/i,
      /^经过优化后的提示词:?\s*/i,
      
      // 分隔符形式
      /^---+\s*优化结果\s*---+\s*/i,
      /^---+\s*优化版本\s*---+\s*/i,
      /^---+\s*优化后的提示词\s*---+\s*/i,
      /^=+\s*优化后的提示词\s*=+\s*/i,
      /^=+\s*优化结果\s*=+\s*/i,
      /^=+\s*优化版本\s*=+\s*/i,
      
      // 其他常见格式
      /^【优化后的提示词】:?\s*/i,
      /^【优化结果】:?\s*/i,
      /^「优化后的提示词」:?\s*/i,
      /^「优化结果」:?\s*/i,
      /^\[优化后的提示词\]:?\s*/i,
      /^\[优化结果\]:?\s*/i,
      
      // 编号形式
      /^\d+\.\s*优化后的提示词:?\s*/i,
      /^\d+\.\s*优化结果:?\s*/i,
      
      // 英文形式
      /^\*\*Optimized Prompt\*\*:?\s*/i,
      /^\*\*Improved Prompt\*\*:?\s*/i,
      /^Optimized Prompt:?\s*/i,
      /^Improved Prompt:?\s*/i,
      
      // 包含冒号的各种形式
      /^.*优化.*提示词.*[:：]\s*/i,
      /^.*改进.*提示词.*[:：]\s*/i,
      /^.*重构.*提示词.*[:：]\s*/i
    ]
    
    for (const pattern of removePatterns) {
      finalOptimizedPrompt = finalOptimizedPrompt.replace(pattern, '')
    }
    
    // 去掉开头的换行符和空白字符
    finalOptimizedPrompt = finalOptimizedPrompt.replace(/^[\s\n\r]+/, '')
    
    // 如果结果为空，使用原始内容
    if (!finalOptimizedPrompt) {
      finalOptimizedPrompt = optimizedPrompt.trim()
    }

    // 更新对话历史
    const updatedHistory: ConversationMessage[] = [
      ...history,
      {
        role: 'user',
        content: optimizationMode === 'rewrite'
          ? `用户要求完全重新生成提示词：\n${userFeedback}`
          : `当前提示词版本：\n${currentPrompt}\n\n用户反馈和改进要求：\n${userFeedback}`
      },
      {
        role: 'assistant',
        content: finalOptimizedPrompt
      }
    ]

    // 计算轮次
    const round = Math.floor(updatedHistory.length / 2)

    reservation.commit()
    return NextResponse.json({
      success: true,
      optimizedPrompt: finalOptimizedPrompt,
      conversationHistory: updatedHistory,
      round,
      title: buildPromptTitle(finalOptimizedPrompt),
      thinking: buildVisibleThinkingSummary(optimizationMode, userFeedback)
    })

  } catch (error) {
    await reservation?.rollback()
    if (error instanceof RequestPolicyError) return requestPolicyResponse(error)
    console.error('Multi-turn optimization failed')
    if (selectedProvider && selectedModel) {
      return NextResponse.json(
        { success: false, ...createAIProviderFailure({ provider: selectedProvider, model: selectedModel }) },
        { status: 502 },
      )
    }

    return NextResponse.json(
      {
        error: 'Failed to optimize prompt'
      },
      { status: 500 }
    )
  }
}

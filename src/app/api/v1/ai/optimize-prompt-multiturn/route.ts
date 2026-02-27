import { NextRequest, NextResponse } from 'next/server'
import { getAIRequestConfig, aiConfig } from '@/config/ai'
import { ConversationMessage } from '@/types'

/**
* 多轮优化提示词API
* 请求体大小限制: 10MB (通过Next.js默认配置)
* 输入验证: 各输入字段长度不能超过10000字符
* 对话历史长度限制: 最多20条
*/
export async function POST(request: NextRequest) {
  try {
    const { originalPrompt, currentPrompt, userFeedback, conversationHistory, optimizationMode = 'optimize', provider, model } = await request.json()

    // 输入长度限制
    const MAX_INPUT_LENGTH = 10000;
    if ((originalPrompt && originalPrompt.length > MAX_INPUT_LENGTH) || (currentPrompt && currentPrompt.length > MAX_INPUT_LENGTH)) {
      return NextResponse.json({ error: "输入长度不能超过" + MAX_INPUT_LENGTH + "字符" }, { status: 400 });
    }
    if (!originalPrompt || !currentPrompt || !userFeedback) {
      // 对话历史长度限制
      return NextResponse.json(
        { error: 'originalPrompt, currentPrompt, and userFeedback are required' },
        { status: 400 }
      )
    }

    // 获取AI配置
    const config = getAIRequestConfig(provider, model)
    const systemPrompt = aiConfig.prompts.multiTurn

    // 构建对话历史（带长度限制）
    const MAX_HISTORY_LENGTH = 20;
    const history = (conversationHistory || []).slice(-MAX_HISTORY_LENGTH);
    const messages = [
      {
        role: 'system' as const,
        content: systemPrompt
      },
      ...history,
      {
        role: 'user' as const,
        content: optimizationMode === 'rewrite' 
          ? `用户要求完全重新生成提示词：\n${userFeedback}\n\n请根据要求生成一个全新的提示词。`
          : `当前提示词版本：\n${currentPrompt}\n\n用户反馈和改进要求：\n${userFeedback}\n\n请根据反馈优化这个提示词。`
      }
    ]

    // 调用通义千问API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature,
        max_tokens: config.max_tokens,
        top_p: config.top_p
      }),
      signal: controller.signal
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`)
    }

    const data = await response.json()
    const optimizedPrompt = data.choices[0]?.message?.content

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

    return NextResponse.json({
      success: true,
      optimizedPrompt: finalOptimizedPrompt,
      conversationHistory: updatedHistory,
      round
    })

  } catch (error) {
    console.error('Multi-turn optimization error:', error)
    return NextResponse.json(
      {
        error: 'Failed to optimize prompt',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : 'Unknown error') : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

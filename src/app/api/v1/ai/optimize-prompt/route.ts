import { NextRequest, NextResponse } from 'next/server'
import { validateAIModel, formatAIError } from '@/lib/ai-utils'
import { DEFAULT_PUBLIC_AI_PROVIDER, getDefaultAIModel } from '@/config/ai-models'
import { getUserProviderRuntimeConfig } from '@/lib/user-provider-config'
import { requireAIUser, reserveAIUsage, requestPolicyResponse } from '@/lib/ai-runtime-security'
import { buildAIChatCompletionBody, createAIIncompleteResponse, isCompleteAIFinishReason, readLimitedAIProviderJSON } from '@/lib/ai-request-policy'
import {
  MAX_AI_INPUT_CHARS,
  parseAIOptimizationPreferences,
  parseAIRequestAttachments,
  readLimitedJson,
} from '@/lib/ai-runtime-policy'

type RequestedAttachment = {
  name: string
  type: string
  size: number
  textPreview: string
}

/**
* 提示词优化API
* 请求体大小限制: 256KiB（服务端按实际读取字节强制执行）
* 输入验证: 提示词长度不能超过10000字符
*/
export async function POST(request: NextRequest) {
  const auth = await requireAIUser(request)
  if (!auth.ok) return auth.response

  try {
    const body = await readLimitedJson<Record<string, unknown>>(request)

    // 兼容两种字段命名：prompt/originalPrompt, provider/modelType, model/modelName
    const rawPrompt = body.prompt ?? body.originalPrompt
    const prompt = typeof rawPrompt === 'string' ? rawPrompt : ''
    const rawProvider = body.provider ?? body.modelType
    const rawModel = body.model ?? body.modelName
    const provider = typeof rawProvider === 'string' ? rawProvider : DEFAULT_PUBLIC_AI_PROVIDER
    const model = typeof rawModel === 'string' ? rawModel : getDefaultAIModel(provider)
    const temperatureOverride = typeof body.temperature === 'number' ? body.temperature : undefined
    const rawTopP = body.topP ?? body.top_p
    const rawMaxTokens = body.maxTokens ?? body.max_tokens
    const topPOverride = typeof rawTopP === 'number' ? rawTopP : undefined
    const maxTokensOverride = typeof rawMaxTokens === 'number' ? rawMaxTokens : undefined
    const {
      mode: requestedMode,
      style: requestedStyle,
      tone: requestedTone,
      outputFormat: requestedOutputFormat,
      constraints: requestedConstraints,
    } = parseAIOptimizationPreferences(body)
    const requestedAttachments: RequestedAttachment[] = parseAIRequestAttachments(body.attachments)

    // 输入长度限制
    if (prompt.length > MAX_AI_INPUT_CHARS) {
      return NextResponse.json({ error: "输入长度不能超过" + MAX_AI_INPUT_CHARS + "字符" }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json(
        { success: false, error: '提示词内容不能为空' },
        { status: 400 }
      )
    }

    // Never reinterpret a provider choice: validation must reject retired aliases.
    const effectiveProvider = provider
    const userRuntimeConfig = await getUserProviderRuntimeConfig(auth.user.id, effectiveProvider)

    // 验证AI模型配置
    const validation = validateAIModel(effectiveProvider, model, userRuntimeConfig || undefined);
    if (!validation.isValid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      )
    }

    // 获取AI配置
    const aiConfig = validation.config!
    const quota = await reserveAIUsage(auth.user, 'ai_optimize', { provider: effectiveProvider, model })
    if (!quota.ok) return quota.response
    const reservation = quota.reservation
    
    // 根据请求的mode确定优化模式指令
    const modeInstruction = requestedMode === 'professional' || requestedMode === 'pro'
      ? '\n\n**⚠️ 用户已显式选择【专业模式】，必须使用专业模式的完整 Role-Profile-Skills-Rules-Workflow-OutputFormat 结构输出。**'
      : requestedMode === 'normal' || requestedMode === 'simple'
        ? '\n\n**⚠️ 用户已选择【简洁模式】，请保留必要结构，但避免过度展开。输出应短、清晰、可直接复制使用。**'
        : ''

    const preferenceInstruction = [
      requestedStyle ? `- 优化风格：${requestedStyle}` : '',
      requestedTone ? `- 语调：${requestedTone}` : '',
      requestedOutputFormat ? `- 输出格式：${requestedOutputFormat}` : '',
      requestedConstraints.length > 0 ? `- 约束条件：${requestedConstraints.join('；')}` : '',
    ].filter(Boolean).join('\n')

    const attachmentInstruction = requestedAttachments.length > 0
      ? requestedAttachments.map((attachment, index) => {
          const preview = attachment.textPreview ? `\n摘录：${attachment.textPreview}` : ''
          return `${index + 1}. ${attachment.name} (${attachment.type}, ${attachment.size} bytes)${preview}`
        }).join('\n\n')
      : ''

    // 构建优化提示词 - 改进版元提示词 v2
    const systemPrompt = `你是世界顶级的提示词工程专家。你的唯一任务是：将用户的原始提示词优化为结构化、高效能的版本。

## 核心规则

1. **直接输出优化后的提示词**，绝对禁止输出任何解释、说明、前缀（如"优化后的提示词："）
2. **100%保留原始需求的所有细节和意图**，只优化结构和表达，不删减内容
3. **使用与原始提示词相同的语言**（中文提示词输出中文，英文输出英文）
4. **使用清晰的分点分段Markdown格式**，绝不能挤在一起

## 场景识别（自动判断）

根据提示词内容自动识别场景并采用对应策略：
- **代码生成**（编程/框架/API）→ 强调技术准确性、代码规范、错误处理
- **内容创作**（写作/文案/故事）→ 注重创意表达、受众适配、结构层次
- **问题解答**（知识/分析/方案）→ 强调逻辑清晰、多角度思考、论据充分
- **数据分析**（统计/报告/趋势）→ 注重方法论、指标定义、结论严谨
- **教育学习**（讲解/教学/辅导）→ 强调循序渐进、举例说明、重点突出
- **办公效率**（邮件/文档/表格）→ 注重模板化、格式规范、效率优先
- **对话交互**（角色扮演/客服/咨询）→ 强调语气适配、情感智能、应变能力

## 模式选择

**简洁模式** — 原始提示词 ≤ 30字 且无复杂需求时使用：
\`\`\`
# Role: [简短角色]
## Goal
[一句话目标]
## Requirements
[要求清单]
## Output
[输出格式]
\`\`\`

**专业模式** — 原始提示词含专业术语、技术名词、复杂业务场景，或用户显式指定时使用：
\`\`\`
# Role: [专业角色定义]
## Profile
- author: 提示词工程专家
- version: 1.0
- language: [与原始提示词相同]
- description: [角色能力与服务范围]
## Skills
[技能清单，每项含执行标准]
## Rules
[操作规范，含禁止事项与必须原则]
## Workflow
[逻辑清晰的步骤序列]
## OutputFormat
[规范化输出格式]
## Initialization
作为[角色名称]，严格按照上述规范为用户提供服务。
\`\`\`

**创意模式** — 涉及创意、头脑风暴、探索性话题时使用：
\`\`\`
# 创意任务：[主题]
## 核心方向
[创意边界]
## 探索空间
[自由发挥领域]
## 质量标准
[基本要求]
## 期望输出
[输出形式]
\`\`\`

用户可通过 [简洁]、[专业]、[创意] 关键词显式指定模式。${modeInstruction}

现在，基于以下原始提示词进行智能优化：`

    const contextInstruction = `${preferenceInstruction ? `**用户偏好：**\n${preferenceInstruction}\n` : ''}${attachmentInstruction ? `**附件上下文：**\n${attachmentInstruction}\n` : ''}`

    const userMessage = `**原始提示词：** ${prompt}

${contextInstruction}

**优化要求：**
1. 完整保留原始提示词中的所有细节、要点和重要信息
2. 不删除任何原始内容，只进行优化和扩展
3. 在保留原有内容的基础上增加专业细节和说明
4. 保持原始提示词的核心意图和目标不变
5. 如有特定格式要求，必须保留并优化
6. 必须使用清晰的分点分段格式`


    let optimizedPrompt: string = ''
    let processingTime = 0
    const startTime = Date.now()

    try {
      // 使用在线AI服务 - 从headers中获取API密钥
      const apiKey = aiConfig.headers['Authorization']?.replace('Bearer ', '')
      if (!apiKey) {
        throw new Error(`未配置${effectiveProvider}的API密钥，请在环境变量中设置${effectiveProvider.toUpperCase()}_API_KEY`)
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      headers.Authorization = `Bearer ${apiKey}`

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 150000)

      try {
        const bodyObj = buildAIChatCompletionBody({
          provider: effectiveProvider,
          model: aiConfig.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          maxTokens: maxTokensOverride ?? aiConfig.max_tokens,
          temperature: temperatureOverride ?? aiConfig.temperature,
          topP: topPOverride ?? 0.9,
          fixedTemperature: aiConfig.fixedTemperature,
        })

        reservation.markProviderCallStarted()
        const response = await fetch(`${aiConfig.baseURL}/chat/completions`, {
          method: 'POST',
          redirect: 'error',
          headers,
          body: JSON.stringify(bodyObj),
          signal: controller.signal
        })

        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined)
          console.error(`${effectiveProvider} API错误 (${response.status})`)
          throw new Error(`${effectiveProvider} API请求失败: ${response.status}`)
        }

        const data = await readLimitedAIProviderJSON<{
          choices?: Array<{ finish_reason?: unknown; message?: { content?: string } }>
        }>(response)
        const choice = data.choices?.[0]
        if (!isCompleteAIFinishReason(choice?.finish_reason)) {
          console.error(`${effectiveProvider} API returned incomplete output`)
          return NextResponse.json(
            { success: false, ...createAIIncompleteResponse({ provider: effectiveProvider, model }) },
            { status: 502 },
          )
        }
        optimizedPrompt = choice?.message?.content || ''
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error(`${effectiveProvider} API请求超时(150秒)，请稍后重试`)
        }
        throw fetchError
      } finally {
        clearTimeout(timeoutId)
      }

      processingTime = (Date.now() - startTime) / 1000

      if (!optimizedPrompt) {
        throw new Error('AI模型未返回有效响应')
      }

      // 处理AI响应，去掉常见的前缀文本
      let finalOptimizedPrompt = optimizedPrompt.trim()
      
      // 移除DeepSeek-R1等模型的<think>思考标签
      finalOptimizedPrompt = finalOptimizedPrompt.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      finalOptimizedPrompt = finalOptimizedPrompt.replace(/<think>[\s\S]*/g, '').trim()

      const prefixesToRemove = [
        '优化后的提示词：',
        '优化结果：',
        '优化后的内容：',
        'AI优化结果：',
        '优化建议：',
        '优化版本：',
        '**优化后的提示词：**',
        '**优化结果：**',
        '**优化后的内容：**',
        '**AI优化结果：**',
        '**优化建议：**',
        '**优化版本：**'
      ]
      
      for (const prefix of prefixesToRemove) {
        if (finalOptimizedPrompt.startsWith(prefix)) {
          finalOptimizedPrompt = finalOptimizedPrompt.substring(prefix.length).trim()
          break
        }
      }

      reservation.commit()
      return NextResponse.json({
        success: true,
        optimized: finalOptimizedPrompt,
        optimizedPrompt: finalOptimizedPrompt,
        processing_time: Math.round(processingTime * 100) / 100,
        provider,
        model
      })

    } catch (error) {
      await reservation.rollback()
      console.error('AI优化失败')
      const formattedError = formatAIError(error, effectiveProvider)
      return NextResponse.json(
        {
          success: false,
          error: formattedError
        },
        { status: 500 }
      )
    }

  } catch (error) {
    return requestPolicyResponse(error)
  }
}

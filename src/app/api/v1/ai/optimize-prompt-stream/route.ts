import { NextRequest, NextResponse } from 'next/server'
import { validateAIModel, formatAIError } from '@/lib/ai-utils'
import { FALLBACK_AI_MODEL, FALLBACK_AI_PROVIDER } from '@/config/ai'
import { sanitizeAIProviderError } from '@/lib/ai-error-sanitizer'

type RequestedAttachment = {
  name: string
  type: string
  size: number
  parseStatus: string
  textPreview: string
}

function buildLocalOptimizedPrompt({
  prompt,
  mode,
  style,
  tone,
  outputFormat,
  constraints,
  attachments,
}: {
  prompt: string
  mode?: string
  style?: string
  tone?: string
  outputFormat?: string
  constraints: string[]
  attachments: RequestedAttachment[]
}) {
  const parsedAttachments = attachments.filter(attachment => attachment.parseStatus === 'parsed' && attachment.textPreview)
  const attachmentSection = parsedAttachments.length > 0
    ? `\n\n## 参考资料\n${parsedAttachments.map((attachment, index) => `${index + 1}. ${attachment.name}\n\n摘录：${attachment.textPreview.slice(0, 1200)}`).join('\n\n')}`
    : ''
  const constraintsSection = constraints.length > 0
    ? `\n\n## 约束条件\n${constraints.map(item => `- ${item}`).join('\n')}`
    : ''
  const preferenceSection = [
    style ? `- 优化风格：${style}` : '',
    tone ? `- 语调：${tone}` : '',
    outputFormat ? `- 输出格式：${outputFormat}` : '',
  ].filter(Boolean).join('\n')

  if (mode === 'pro' || mode === 'professional') {
    return `# Role: 专业任务执行助手

## Profile
- language: 中文
- description: 根据用户目标、约束条件和附件上下文，完成高质量任务执行。

## Goal
${prompt}

## Skills
- 准确理解用户意图，保留原始需求中的关键细节。
- 将任务拆解为可执行步骤，并在必要时主动补充上下文。
- 输出结构清晰、可直接复制使用的结果。

## Rules
- 不编造附件中不存在的事实。
- 如信息不足，先列出需要确认的问题。
- 保持表达简洁、专业、可执行。
${constraintsSection}
${preferenceSection ? `\n\n## Preferences\n${preferenceSection}` : ''}
${attachmentSection}

## Workflow
1. 识别任务目标和最终交付物。
2. 梳理已知条件、约束和参考资料。
3. 按最适合的结构输出答案。
4. 最后给出可检查的质量标准。

## OutputFormat
请使用 Markdown 输出，层级清晰，重点突出。`
  }

  return `# 任务
${prompt}

## 要求
- 保留原始意图，不遗漏关键细节。
- 将表达整理得更清晰、更具体、更容易执行。
- 如任务信息不足，先说明需要补充的内容。
${constraints.length > 0 ? constraints.map(item => `- ${item}`).join('\n') : ''}
${preferenceSection ? `\n\n## 偏好\n${preferenceSection}` : ''}
${attachmentSection}

## 输出
请直接给出可使用的结果，使用 Markdown 分点分段。`
}

function buildLocalPromptTitle(content: string) {
  const firstMeaningfulLine = content
    .split('\n')
    .map(line => line.replace(/^#+\s*/, '').replace(/^[-*\d.、\s]+/, '').trim())
    .find(line => line.length > 0) || '优化提示词'

  return firstMeaningfulLine
    .replace(/[：:。,.，；;]+$/g, '')
    .slice(0, 24) || '优化提示词'
}

async function generatePromptTitle({
  content,
  provider,
  config,
}: {
  content: string
  provider: string
  config: NonNullable<ReturnType<typeof validateAIModel>['config']>
}) {
  const fallbackTitle = buildLocalPromptTitle(content)
  const apiKey = config.headers['Authorization']?.replace('Bearer ', '')
  if (!apiKey) return fallbackTitle

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)
  const isMiniMaxProvider = provider === 'minimax'
  const usesCompletionTokensParam = provider === 'minimax' || provider === 'xiaomi'

  try {
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: '你只负责给提示词生成中文短标题。只输出标题，不要解释。标题不超过18个汉字。' },
          { role: 'user', content: `请为这个提示词生成标题：\n\n${content.slice(0, 2400)}` },
        ],
        [usesCompletionTokensParam ? 'max_completion_tokens' : 'max_tokens']: 48,
        temperature: isMiniMaxProvider ? 0.2 : 0.3,
        ...(provider === 'xiaomi' ? { thinking: { type: 'disabled' }, top_p: 0.95 } : {}),
        stream: false,
      }),
      signal: controller.signal,
    })

    if (!response.ok) return fallbackTitle
    const data = await response.json()
    const aiTitle = String(data.choices?.[0]?.message?.content || '')
      .replace(/^标题[:：]\s*/i, '')
      .replace(/["“”'`]/g, '')
      .trim()
      .slice(0, 24)

    return aiTitle || fallbackTitle
  } catch {
    return fallbackTitle
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 流式提示词优化API (SSE)
 * 支持实时展示AI思考过程和优化内容
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const prompt = body.prompt || body.originalPrompt
    const provider = body.provider || body.modelType || 'deepseek'
    const model = body.model || body.modelName || 'deepseek-v4-flash'
    const temperatureOverride = body.temperature as number | undefined
    const topPOverride = (body.topP ?? body.top_p) as number | undefined
    const maxTokensOverride = (body.maxTokens ?? body.max_tokens) as number | undefined
    const requestedMode = body.mode as string | undefined
    const requestedStyle = typeof body.style === 'string' ? body.style : ''
    const requestedTone = typeof body.tone === 'string' ? body.tone : ''
    const requestedOutputFormat = typeof body.outputFormat === 'string' ? body.outputFormat : ''
    const requestedConstraints = Array.isArray(body.constraints)
      ? body.constraints
          .filter((item: unknown) => typeof item === 'string' && item.trim())
          .slice(0, 12)
          .map((item: string) => item.trim().slice(0, 500))
      : []
    const requestedAttachments: RequestedAttachment[] = Array.isArray(body.attachments)
      ? body.attachments
          .filter((item: unknown) => item && typeof item === 'object')
          .slice(0, 12)
          .map((item: { name?: unknown; type?: unknown; size?: unknown; textPreview?: unknown; parseStatus?: unknown }) => ({
            name: typeof item.name === 'string' ? item.name.slice(0, 120) : 'unnamed',
            type: typeof item.type === 'string' ? item.type.slice(0, 80) : 'application/octet-stream',
            size: typeof item.size === 'number' ? item.size : 0,
            parseStatus: typeof item.parseStatus === 'string' ? item.parseStatus : 'metadata',
            textPreview: typeof item.textPreview === 'string' ? item.textPreview.slice(0, 5000) : '',
          }))
      : []
    const attachmentTextLength = requestedAttachments.reduce((total, attachment) => total + attachment.textPreview.length, 0)
    const attachmentDeclaredSize = requestedAttachments.reduce((total, attachment) => total + Math.max(0, attachment.size), 0)

    if (attachmentTextLength > 30000 || attachmentDeclaredSize > 50 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: '附件上下文过大，请减少文件数量或内容长度' }, { status: 413 })
    }

    const MAX_INPUT_LENGTH = 10000
    if (prompt && prompt.length > MAX_INPUT_LENGTH) {
      return NextResponse.json({ error: '输入长度不能超过' + MAX_INPUT_LENGTH + '字符' }, { status: 400 })
    }
    if (!prompt) {
      return NextResponse.json({ success: false, error: '提示词内容不能为空' }, { status: 400 })
    }

    const effectiveProvider = provider === 'local' ? 'qwen' : provider

    const validation = validateAIModel(effectiveProvider, model)
    if (!validation.isValid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 })
    }

    const aiConfig = validation.config!

    // 构建元提示词（与非流式路由一致）
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
          const status = attachment.parseStatus === 'parsed' ? '已解析正文' : '仅元数据'
          const preview = attachment.textPreview ? `\n摘录：${attachment.textPreview}` : ''
          return `${index + 1}. ${attachment.name} (${attachment.type}, ${attachment.size} bytes, ${status})${preview}`
        }).join('\n\n')
      : ''

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

    const startTime = Date.now()
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        try {
          const apiKey = aiConfig.headers['Authorization']?.replace('Bearer ', '')
          if (!apiKey) {
            send({ type: 'error', message: `未配置${effectiveProvider}的API密钥` })
            controller.close()
            return
          }

          let activeProvider = effectiveProvider
          let activeModel = model
          let activeConfig = aiConfig

          const isReasonerModel = (modelName: string) => modelName === 'deepseek-reasoner'
          const standardMessages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ]

          const requestProvider = async (providerKey: string, modelKey: string, config: typeof aiConfig) => {
            const isMiniMaxProvider = providerKey === 'minimax'
            const isXiaomiProvider = providerKey === 'xiaomi'
            const usesCompletionTokensParam = isMiniMaxProvider || isXiaomiProvider
            const requestTemperature = isMiniMaxProvider
              ? Math.min(Math.max(temperatureOverride ?? config.temperature, 0.01), 1)
              : Math.min(Math.max(temperatureOverride ?? config.temperature, 0), 2)
            const requestMaxTokens = isMiniMaxProvider
              ? Math.min(Math.max(maxTokensOverride ?? 2048, 1), 2048)
              : Math.min(Math.max(maxTokensOverride ?? 2048, 512), 8192)
            const requestMessages = isReasonerModel(config.model)
              ? [{ role: 'user', content: systemPrompt + '\n\n' + userMessage }]
              : standardMessages
            const bodyObj: Record<string, unknown> = {
              model: config.model,
              messages: requestMessages,
              stream: true,
            }
            bodyObj[usesCompletionTokensParam ? 'max_completion_tokens' : 'max_tokens'] = requestMaxTokens
            if (!config.fixedTemperature) {
              bodyObj.temperature = requestTemperature
            }
            if (isXiaomiProvider) {
              bodyObj.thinking = { type: 'disabled' }
            }
            if (topPOverride !== undefined) {
              bodyObj.top_p = Math.min(Math.max(topPOverride, 0.1), 1)
            }

            const requestApiKey = config.headers['Authorization']?.replace('Bearer ', '')
            const abortController = new AbortController()
            const timeoutId = setTimeout(() => abortController.abort(), 150000)

            try {
              const response = await fetch(`${config.baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${requestApiKey}`,
                },
                body: JSON.stringify(bodyObj),
                signal: abortController.signal,
              })
              return { response, providerKey, modelKey }
            } finally {
              clearTimeout(timeoutId)
            }
          }

          let { response } = await requestProvider(activeProvider, activeModel, activeConfig)

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`${activeProvider} stream error:`, sanitizeAIProviderError(errorText))

            const fallbackCandidates = [
              { provider: FALLBACK_AI_PROVIDER, model: FALLBACK_AI_MODEL },
              { provider: 'kimi', model: 'moonshot-v1-32k' },
            ].filter(candidate => candidate.provider !== activeProvider || candidate.model !== activeModel)

            let fallbackError = errorText
            for (const candidate of fallbackCandidates) {
              const fallbackValidation = validateAIModel(candidate.provider, candidate.model)
              if (!fallbackValidation.isValid || !fallbackValidation.config) continue

              activeProvider = candidate.provider
              activeModel = candidate.model
              activeConfig = fallbackValidation.config
              const fallbackAttempt = await requestProvider(activeProvider, activeModel, activeConfig)
              response = fallbackAttempt.response

              if (response.ok) {
                break
              }

              fallbackError = await response.text()
              console.error(`${activeProvider} stream error:`, sanitizeAIProviderError(fallbackError))
            }

            if (!response.ok) {
              console.error(`${activeProvider} final stream error:`, sanitizeAIProviderError(fallbackError))
              const localOptimized = buildLocalOptimizedPrompt({
                prompt,
                mode: requestedMode,
                style: requestedStyle,
                tone: requestedTone,
                outputFormat: requestedOutputFormat,
                constraints: requestedConstraints,
                attachments: requestedAttachments,
              })
              const processingTime = Math.round(((Date.now() - startTime) / 1000) * 100) / 100
              send({ type: 'content', content: localOptimized })
              send({
                type: 'done',
                title: buildLocalPromptTitle(localOptimized),
                optimized: localOptimized,
                processing_time: processingTime,
                provider: 'local',
                model: 'rule-based-v2',
              })
              controller.close()
              return
            }
          }

          // 解析AI提供商的SSE流
          const reader = response.body!.getReader()
          const decoder = new TextDecoder()
          let sseBuffer = ''
          let contentBuffer = ''       // 用于检测 <think> 标签
          let isInThinkTag = false      // 当前是否在 <think> 块内
          let fullContent = ''          // 累积的完整优化内容
          let fullThinking = ''         // 累积的完整思考内容

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            sseBuffer += decoder.decode(value, { stream: true })

            const lines = sseBuffer.split('\n')
            sseBuffer = lines.pop() || ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed.startsWith('data:')) continue
              const data = trimmed.slice(5).trim()
              if (data === '[DONE]') continue

              try {
                const parsed = JSON.parse(data)
                const delta = parsed.choices?.[0]?.delta

                // 处理 reasoning_content（DeepSeek-R1 专用字段）
                if (delta?.reasoning_content) {
                  fullThinking += delta.reasoning_content
                  send({ type: 'thinking', content: delta.reasoning_content })
                }

                // 处理常规内容（可能嵌入 <think> 标签）
                if (delta?.content) {
                  contentBuffer += delta.content

                  // 解析 <think> 标签
                  while (contentBuffer.length > 0) {
                    if (!isInThinkTag) {
                      const thinkStart = contentBuffer.indexOf('<think>')
                      if (thinkStart === -1) {
                        // 没有 <think>，但保留末尾可能的不完整标签
                        if (contentBuffer.length > 7) {
                          const safeContent = contentBuffer.slice(0, -7)
                          contentBuffer = contentBuffer.slice(-7)
                          fullContent += safeContent
                          send({ type: 'content', content: safeContent })
                        }
                        break
                      } else {
                        // 输出 <think> 之前的内容
                        if (thinkStart > 0) {
                          const before = contentBuffer.slice(0, thinkStart)
                          fullContent += before
                          send({ type: 'content', content: before })
                        }
                        contentBuffer = contentBuffer.slice(thinkStart + 7)
                        isInThinkTag = true
                      }
                    } else {
                      const thinkEnd = contentBuffer.indexOf('</think>')
                      if (thinkEnd === -1) {
                        // 仍在思考块中，保留末尾可能的不完整标签
                        if (contentBuffer.length > 8) {
                          const safeThinking = contentBuffer.slice(0, -8)
                          contentBuffer = contentBuffer.slice(-8)
                          fullThinking += safeThinking
                          send({ type: 'thinking', content: safeThinking })
                        }
                        break
                      } else {
                        if (thinkEnd > 0) {
                          const thinkText = contentBuffer.slice(0, thinkEnd)
                          fullThinking += thinkText
                          send({ type: 'thinking', content: thinkText })
                        }
                        contentBuffer = contentBuffer.slice(thinkEnd + 8)
                        isInThinkTag = false
                      }
                    }
                  }
                }
              } catch {
                // 跳过无法解析的JSON
              }
            }
          }

          // 刷新剩余缓冲区
          if (contentBuffer.length > 0) {
            if (isInThinkTag) {
              fullThinking += contentBuffer
              send({ type: 'thinking', content: contentBuffer })
            } else {
              fullContent += contentBuffer
              send({ type: 'content', content: contentBuffer })
            }
          }

          // 后处理：移除常见前缀。如果供应商只返回 reasoning/thinking 而没有正文，使用本地优化兜底，避免前端得到空结果。
          let finalContent = fullContent.trim() || buildLocalOptimizedPrompt({
            prompt,
            mode: requestedMode,
            style: requestedStyle,
            tone: requestedTone,
            outputFormat: requestedOutputFormat,
            constraints: requestedConstraints,
            attachments: requestedAttachments,
          })
          const prefixesToRemove = [
            '优化后的提示词：', '优化结果：', '优化后的内容：',
            'AI优化结果：', '优化建议：', '优化版本：',
            '**优化后的提示词：**', '**优化结果：**', '**优化后的内容：**',
            '**AI优化结果：**', '**优化建议：**', '**优化版本：**',
          ]
          for (const prefix of prefixesToRemove) {
            if (finalContent.startsWith(prefix)) {
              finalContent = finalContent.substring(prefix.length).trim()
              break
            }
          }

          const processingTime = Math.round(((Date.now() - startTime) / 1000) * 100) / 100
          const generatedTitle = await generatePromptTitle({
            content: finalContent,
            provider: activeProvider,
            config: activeConfig,
          })
          send({
            type: 'done',
            title: generatedTitle,
            optimized: finalContent,
            thinking: fullThinking || undefined,
            processing_time: processingTime,
            provider: activeProvider,
            model: activeModel,
          })
          controller.close()
        } catch (error) {
          console.error('流式优化失败:', error)
          send({ type: 'error', message: formatAIError(error, effectiveProvider) })
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('API错误:', error)
    return NextResponse.json({ success: false, error: '请求处理失败' }, { status: 500 })
  }
}

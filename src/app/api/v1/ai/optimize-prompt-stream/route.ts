import { NextRequest, NextResponse } from 'next/server'
import { validateAIModel, formatAIError } from '@/lib/ai-utils'

/**
 * 流式提示词优化API (SSE)
 * 支持实时展示AI思考过程和优化内容
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const prompt = body.prompt || body.originalPrompt
    const provider = body.provider || body.modelType || 'qwen'
    const model = body.model || body.modelName || 'qwen3.5-plus'
    const temperatureOverride = body.temperature as number | undefined
    const requestedMode = body.mode as string | undefined

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
    const modeInstruction = requestedMode === 'professional'
      ? '\n\n**⚠️ 用户已显式选择【专业模式】，必须使用专业模式的完整 Role-Profile-Skills-Rules-Workflow-OutputFormat 结构输出。**'
      : requestedMode === 'normal'
        ? '\n\n**⚠️ 用户已选择【普通模式】，请根据提示词长度和复杂度自动判断使用简洁/专业/创意模式。**'
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

    const userMessage = `**原始提示词：** ${prompt}

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

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          }

          const isReasonerModel = aiConfig.model === 'deepseek-reasoner'
          const messages = isReasonerModel
            ? [{ role: 'user', content: systemPrompt + '\n\n' + userMessage }]
            : [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
              ]

          const requestTemperature = temperatureOverride ?? aiConfig.temperature
          const bodyObj: Record<string, unknown> = {
            model: aiConfig.model,
            messages,
            max_tokens: Math.min(aiConfig.max_tokens, 8192),
            stream: true,
          }
          if (!aiConfig.fixedTemperature) {
            bodyObj.temperature = requestTemperature
          }

          const abortController = new AbortController()
          const timeoutId = setTimeout(() => abortController.abort(), 150000)

          const response = await fetch(`${aiConfig.baseURL}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(bodyObj),
            signal: abortController.signal,
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            const errorText = await response.text()
            send({ type: 'error', message: `${effectiveProvider} API请求失败: ${response.status}` })
            console.error(`${effectiveProvider} stream error:`, errorText)
            controller.close()
            return
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

          // 后处理：移除常见前缀
          let finalContent = fullContent.trim()
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
          send({
            type: 'done',
            optimized: finalContent,
            thinking: fullThinking || undefined,
            processing_time: processingTime,
            provider,
            model,
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

import { NextRequest, NextResponse } from 'next/server'
import { getAIRequestConfig, AI_MODELS } from '@/config/ai'
import { validateAIModel, formatAIError } from '@/lib/ai-utils'

/**
* 提示词优化API
* 请求体大小限制: 10MB (通过Next.js默认配置)
* 输入验证: 提示词长度不能超过10000字符
*/
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 兼容两种字段命名：prompt/originalPrompt, provider/modelType, model/modelName
    const prompt = body.prompt || body.originalPrompt
    const provider = body.provider || body.modelType || 'qwen'
    const model = body.model || body.modelName || 'qwen3.5-plus'
    const temperatureOverride = body.temperature as number | undefined
    const requestedMode = body.mode as string | undefined // professional/normal

    // 输入长度限制
    const MAX_INPUT_LENGTH = 10000;
    if (prompt && prompt.length > MAX_INPUT_LENGTH) {
      return NextResponse.json({ error: "输入长度不能超过" + MAX_INPUT_LENGTH + "字符" }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json(
        { success: false, error: '提示词内容不能为空' },
        { status: 400 }
      )
    }

    // 如果是local则重定向到qwen（本地模型已移除）
    const effectiveProvider = provider === 'local' ? 'qwen' : provider

    // 验证AI模型配置
    const validation = validateAIModel(effectiveProvider, model);
    if (!validation.isValid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      )
    }

    // 获取AI配置
    const aiConfig = validation.config!
    
    // 根据请求的mode确定优化模式指令
    const modeInstruction = requestedMode === 'professional'
      ? '\n\n**⚠️ 用户已显式选择【专业模式】，必须使用专业模式的完整 Role-Profile-Skills-Rules-Workflow-OutputFormat 结构输出。**'
      : requestedMode === 'normal'
        ? '\n\n**⚠️ 用户已选择【普通模式】，请根据提示词长度和复杂度自动判断使用简洁/专业/创意模式。**'
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

    const userMessage = `**原始提示词：** ${prompt}

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
      if (effectiveProvider === 'local') {
        // 使用本地AI服务
        console.log('尝试连接本地AI服务:', aiConfig.baseURL)
        
        // 先测试连接
        try {
          const testResponse = await fetch(`${aiConfig.baseURL}/api/tags`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000) // 5秒测试连接
          })
          
          if (!testResponse.ok) {
            throw new Error(`连接测试失败: ${testResponse.status}`)
          }
          
          const testData = await testResponse.json()
          console.log('可用模型:', testData.models?.map((m: { name: string }) => m.name) || [])
          
          // 检查模型是否可用
          const availableModels = testData.models?.map((m: { name: string }) => m.name) || []
          if (!availableModels.includes(aiConfig.model)) {
            throw new Error(`模型 ${aiConfig.model} 不可用，可用模型: ${availableModels.join(', ')}`)
          }
          
        } catch (testError) {
          console.error('连接测试失败:', testError)
          throw new Error(`无法连接到本地AI服务: ${testError instanceof Error ? testError.message : '未知错误'}`)
        }
        
        // 添加超时控制
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000) // 30秒超时
        
        try {
          console.log('发送请求到本地AI服务:', `${aiConfig.baseURL}/api/generate`)
          console.log('模型:', aiConfig.model)
          console.log('提示词长度:', `${systemPrompt}\n\n${userMessage}`.length)
          
          const response = await fetch(`${aiConfig.baseURL}/api/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: aiConfig.model,
              prompt: `${systemPrompt}\n\n${userMessage}`,
              stream: false,
              options: {
                temperature: aiConfig.temperature,
                num_predict: Math.min(aiConfig.max_tokens, 4000) // 限制最大token数
              }
            }),
            signal: controller.signal
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            if (response.status === 404) {
              throw new Error('本地AI服务未找到，请检查Ollama是否已启动')
            } else if (response.status === 500) {
              throw new Error('本地AI服务内部错误，请检查模型是否正确安装')
            } else {
              throw new Error(`本地AI服务请求失败: ${response.status} ${response.statusText}`)
            }
          }

          const data = await response.json()
          let rawResponse = data.response || ''
          
          // 处理本地模型输出，移除<think></think>标签
          if (effectiveProvider === 'local') {
            // 移除<think>标签及其内容
            rawResponse = rawResponse.replace(/<think>[\s\S]*?<\/think>/g, '')
            // 移除可能的<think>标签（没有闭合标签的情况）
            rawResponse = rawResponse.replace(/<think>[\s\S]*/g, '')
            // 清理多余的空白字符
            rawResponse = rawResponse.trim()
          }
          
          optimizedPrompt = rawResponse
          processingTime = (Date.now() - startTime) / 1000
        } catch (fetchError) {
          clearTimeout(timeoutId)
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error('本地AI服务响应超时，请稍后重试')
          }
          throw fetchError
        }
      } else {
        // 使用在线AI服务 - 从headers中获取API密钥
        const apiKey = aiConfig.headers['Authorization']?.replace('Bearer ', '')
        if (!apiKey) {
          throw new Error(`未配置${effectiveProvider}的API密钥，请在环境变量中设置${effectiveProvider.toUpperCase()}_API_KEY`)
        }

        // 使用在线AI服务
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }

        // 统一设置认证头
        headers['Authorization'] = `Bearer ${apiKey}`

        // 统一超时控制
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 150000)

        // 根据不同提供商处理模型名称和参数
        let requestModel = aiConfig.model
        // temperature 优先使用用户滑块传入的值，否则用默认值 0.7
        let requestTemperature = temperatureOverride ?? aiConfig.temperature

        try {
          // DeepSeek reasoner 不支持 system 角色，需要合并到 user 消息
          const isReasonerModel = requestModel === 'deepseek-reasoner'
          const messages = isReasonerModel
            ? [{ role: 'user', content: systemPrompt + '\n\n' + userMessage }]
            : [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
              ]

          // 部分模型不支持修改 temperature（如 kimi-k2.5, kimi-k2-thinking），不发送该参数
          const isFixedTempModel = aiConfig.fixedTemperature
          const bodyObj: Record<string, unknown> = {
            model: requestModel,
            messages,
            max_tokens: Math.min(aiConfig.max_tokens, 8192),
            stream: false
          }
          if (!isFixedTempModel) {
            bodyObj.temperature = requestTemperature
          }

          const response = await fetch(`${aiConfig.baseURL}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(bodyObj),
            signal: controller.signal
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`${effectiveProvider} API错误 (${response.status}):`, errorText)
            throw new Error(`${effectiveProvider} API请求失败: ${response.status} - ${errorText}`)
          }

          const data = await response.json()
          optimizedPrompt = data.choices?.[0]?.message?.content || ''
        } catch (fetchError) {
          clearTimeout(timeoutId)
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error(`${effectiveProvider} API请求超时(120秒)，请稍后重试`)
          }
          throw fetchError
        }

        processingTime = (Date.now() - startTime) / 1000
      }

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

      return NextResponse.json({
        success: true,
        optimized: finalOptimizedPrompt,
        optimizedPrompt: finalOptimizedPrompt,
        processing_time: Math.round(processingTime * 100) / 100,
        provider,
        model
      })

    } catch (error) {
      console.error('AI优化失败:', error)
      const formattedError = formatAIError(error, effectiveProvider)
      return NextResponse.json(
        {
          success: false,
          error: formattedError,
          details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : 'Unknown error') : 'Internal server error'
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('API错误:', error)
    return NextResponse.json(
      {
        success: false,
        error: '请求处理失败'
      },
      { status: 500 }
    )
  }
}

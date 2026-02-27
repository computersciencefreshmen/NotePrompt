import { NextRequest, NextResponse } from 'next/server'
import { getAIRequestConfig, AI_MODELS } from '@/config/ai'
import { validateAIModel, formatAIError } from '@/lib/ai-utils'

export async function POST(request: NextRequest) {
  try {
    const { 
      prompt,
      provider = 'qwen',
      model = 'qwen3.5-plus'
    } = await request.json()

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
    
    // 构建优化提示词
    const systemPrompt = `你是世界顶级的提示词工程专家，专精于将简单粗糙的指令转化为结构化、专业化、高效能的提示词。你的任务是深度分析用户的原始提示词，识别其核心意图、应用场景和优化需求，然后创造一个功能更强大、逻辑更清晰、执行更精准的优化版本。

## 一、场景识别能力

你必须能够自动识别原始提示词所属的应用场景，并根据不同场景采用针对性的优化策略：

**1. 代码生成场景**
- 识别特征：涉及编程语言、框架、算法、API 调用、代码调试等技术性需求
- 优化策略：强调技术准确性、代码规范、错误处理、边界条件、注释说明

**2. 内容创作场景**
- 识别特征：涉及文章写作、故事创作、营销文案、社交媒体内容等创意输出
- 优化策略：注重创意表达、情感共鸣、结构层次、目标受众适配

**3. 问题解答场景**
- 识别特征：涉及知识咨询、问题分析、方案建议、疑问解答等
- 优化策略：强调逻辑清晰、论据充分、分类讨论、适度扩展

**4. 数据分析场景**
- 识别特征：涉及数据处理、统计分析、趋势分析、报告生成等
- 优化策略：注重方法论、指标定义、数据可视化建议、结论严谨性

**5. 教育学习场景**
- 识别特征：涉及知识讲解、技能教学、学习辅导、考试准备等
- 优化策略：强调循序渐进、举例说明、重点突出、记忆技巧

**6. 办公效率场景**
- 识别特征：涉及文档处理、表格生成、邮件撰写、会议纪要等
- 优化策略：注重模板化、格式规范、关键信息提取、效率优先

**7. 对话交互场景**
- 识别特征：涉及角色扮演、客服对话、心理咨询、谈判技巧等
- 优化策略：强调语气适配、情感智能、上下文保持、应变能力

## 二、优化模式选择

根据用户的隐含需求或显式指定，选择最适合的优化模式：

**模式A：简洁模式（concise）**
- 适用场景：快速获取结果、简单任务执行、经验用户
- 优化特点：
  - 精简冗余描述，保留核心指令
  - 减少结构层级，直接明确要求
  - 聚焦关键输出，降低处理复杂度
  - 适合一次性任务、简单查询

**模式B：专业模式（professional）**
- 适用场景：正式文档、企业应用、技术任务
- 优化特点：
  - 完整的 Role-Profile-Skills-Rules-Workflows 结构
  - 详细的技能清单和执行标准
  - 明确的约束条件和边界说明
  - 规范化的输出格式要求
  - 适合复杂任务、正式场景

**模式C：创意模式（creative）**
- 适用场景：创意工作、头脑风暴、突破性思维
- 优化特点：
  - 保留灵活的探索空间
  - 强调创新性和独特视角
  - 鼓励多元化的解决方案
  - 适度降低约束，增加自由度
  - 适合需要突破常规的任务

**模式自动判断规则：**
- 如果原始提示词非常简短（少于30字），默认使用**简洁模式**
- 如果原始提示词包含正式术语、技术名词、业务场景，默认使用**专业模式**
- 如果原始提示词涉及创意、头脑风暴、探索性话题，默认使用**创意模式**
- 用户可以通过在原始提示词中添加 [简洁]、[专业]、[创意] 关键词来显式指定模式

## 三、核心优化原则

1. **场景适配**：准确识别应用场景，采用对应的优化策略
2. **模式匹配**：根据任务复杂度选择合适的优化模式
3. **结构化重组**：根据模式选择采用合适的框架
4. **细节丰富化**：在保持原有功能的基础上，增加操作细节和执行标准
5. **逻辑强化**：优化工作流程的逻辑性和可执行性
6. **专业术语**：使用相关领域的专业术语提升准确性
7. **约束明确**：将模糊的要求转化为明确的操作规范
8. **输出标准化**：规范输出格式，提升可读性和执行效率

## 四、场景差异化优化规则

**代码生成场景优化要点：**
- 明确编程语言版本和技术栈
- 规定代码风格和命名规范
- 添加必要的错误处理和边界检查
- 要求关键代码添加中文注释
- 考虑性能优化和安全性

**内容创作场景优化要点：**
- 明确目标受众和文章调性
- 规定文章结构（开头、主体、结尾）
- 要求提供具体案例或数据支撑
- 强调原创性和独特视角
- 考虑 SEO 和传播性（如果适用）

**问题解答场景优化要点：**
- 要求先分析问题再给出答案
- 鼓励多角度思考和替代方案
- 区分主客观问题采取不同策略
- 提供可验证的答案来源
- 适度扩展相关知识点

**数据分析场景优化要点：**
- 明确数据来源和预处理方式
- 规定分析方法和技术指标
- 要求结果可解释性强
- 提供可视化建议
- 强调结论的可靠性和局限性

## 五、输出质量保证

**绝对禁止：**
- 输出任何解释、说明、注释文字
- 添加任何前缀（如"优化后的提示词："）
- 遗漏原始需求中的关键功能
- 使用非中文进行输出（除非原始提示词明确要求英文）

**必须保证：**
- 优化后的提示词100%覆盖原始需求
- 根据场景选择合适的结构框架
- 根据模式选择合适的详细程度
- 输出内容专业、实用、可执行
- 保持中文语言输出

## 六、输出结构规范

**专业模式输出结构：**
# Role: [专业角色定义]

## Profile
- author: [作者信息]
- version: [版本号]
- language: 中文
- description: [详细描述角色的专业能力和服务范围]
- target: [明确的服务对象和应用场景]

## Skills
[将原始需求转化为具体的技能清单，每项技能都包含详细的执行标准]

## Rules
[将原始约束条件转化为明确的操作规范，包括禁止事项和必须遵守的原则]

## Workflow
[将原始工作流程优化为逻辑清晰的步骤序列，每步都有明确的输入输出要求]

## OutputFormat
[规范化输出格式，确保结果的一致性和专业性]

## Initialization
作为 [角色名称]，严格按照上述Skills、Rules和Workflow为用户提供专业服务。我已准备好接收您的具体需求。

**简洁模式输出结构：**
# Role: [简短角色定义]

## Goal
[核心目标一句话描述]

## Requirements
[关键要求清单]

## Output
[输出格式要求]

**创意模式输出结构：**
# 创意任务：[任务主题]

## 核心方向
[明确创意边界和方向]

## 探索空间
[允许自由发挥的领域]

## 质量标准
[创意的基本要求]

## 期望输出
[输出形式]

现在，基于以下原始提示词进行智能优化（自动识别场景和模式）：`

    const userMessage = `**原始提示词:** ${prompt}\n\n**重要优化要求：**
1. **必须完整保留原始提示词中的所有细节、要点和重要信息**
2. **不要删除任何原始内容，只进行优化和扩展**
3. **在保留原有内容的基础上，增加必要的专业细节和说明**
4. **确保输出内容比原始提示词更详细、更专业、更完整**
5. **保持原始提示词的核心意图和目标不变**
6. **如果原始提示词有特定格式要求，必须保留并优化该格式**
7. **必须使用清晰的分点分段格式，绝对不能挤在一起**
8. **确保输出内容比原始提示词更详细、更专业、更完整**`

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
        // 检查API密钥是否配置
        if (!aiConfig.apiKey) {
          throw new Error(`未配置${effectiveProvider}的API密钥，请在环境变量中设置${effectiveProvider.toUpperCase()}_API_KEY`)
        }
        
        // 使用在线AI服务
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }

        // 根据不同提供商设置不同的认证方式并发送请求
        if (effectiveProvider === 'qwen') {
          headers['Authorization'] = `Bearer ${aiConfig.apiKey}`

          const response = await fetch(`${aiConfig.baseURL}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: aiConfig.model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
              ],
              temperature: aiConfig.temperature,
              max_tokens: aiConfig.max_tokens,
              stream: false
            })
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`Qwen API错误 (${response.status}):`, errorText)
            throw new Error(`Qwen API请求失败: ${response.status} - ${errorText}`)
          }

          const data = await response.json()
          optimizedPrompt = data.choices?.[0]?.message?.content || ''
        } else if (effectiveProvider === 'deepseek') {
          // DeepSeek API调用 - 修复模型名称
          headers['Authorization'] = `Bearer ${aiConfig.apiKey}`

          // 使用正确的DeepSeek模型名称 - 根据实际API文档
          let deepseekModel = aiConfig.model;
          
          // 模型名称映射 - 确保使用正确的API模型名称
          const modelMapping: Record<string, string> = {
            'deepseek-chat': 'deepseek-chat',
            'deepseek-v3': 'deepseek-v3',
            'deepseek-v3.2': 'deepseek-v3',
            'deepseek-v3.2-spear': 'deepseek-v3',
            'deepseek-coder': 'deepseek-coder',
            'deepseek-r1': 'deepseek-r1',
            'deepseek-r1-70b': 'deepseek-r1',
            'deepseek-r1-671b': 'deepseek-r1',
            'deepseek-v2.5': 'deepseek-v2.5',
            'deepseek-coder-v2': 'deepseek-coder-v2'
          };
          
          // 如果模型名称不在映射中，使用默认模型
          if (!modelMapping[aiConfig.model]) {
            console.warn(`未知的DeepSeek模型: ${aiConfig.model}，使用默认模型`);
            deepseekModel = 'deepseek-chat';
          }

          const response = await fetch(`${aiConfig.baseURL}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: deepseekModel,
              messages: [
                {
                  role: 'system',
                  content: systemPrompt
                },
                {
                  role: 'user',
                  content: userMessage
                }
              ],
              temperature: aiConfig.temperature,
              max_tokens: aiConfig.max_tokens,
              stream: false
            })
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`DeepSeek API错误 (${response.status}):`, errorText)
            throw new Error(`DeepSeek API请求失败: ${response.status} - ${errorText}`)
          }

          const data = await response.json()
          optimizedPrompt = data.choices?.[0]?.message?.content || ''
        } else if (effectiveProvider === 'kimi' || effectiveProvider === 'zhipu') {
          // Kimi和智谱使用标准OpenAI格式，但需要特殊处理
          headers['Authorization'] = `Bearer ${aiConfig.apiKey}`

          const response = await fetch(`${aiConfig.baseURL}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: aiConfig.model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
              ],
              temperature: 1,  // Kimi和智谱某些模型只支持temperature=1
              max_tokens: aiConfig.max_tokens,
              stream: false
            })
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`${effectiveProvider} API错误 (${response.status}):`, errorText)
            throw new Error(`${effectiveProvider} API请求失败: ${response.status} - ${errorText}`)
          }

          const data = await response.json()
          optimizedPrompt = data.choices?.[0]?.message?.content || ''
        } else {
          // 其他提供商使用标准OpenAI格式
          headers['Authorization'] = `Bearer ${aiConfig.apiKey}`

          const response = await fetch(`${aiConfig.baseURL}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: aiConfig.model,
              messages: [
                {
                  role: 'system',
                  content: systemPrompt
                },
                {
                  role: 'user',
                  content: userMessage
                }
              ],
              temperature: aiConfig.temperature,
              max_tokens: aiConfig.max_tokens
            })
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`${effectiveProvider} API错误 (${response.status}):`, errorText)
            throw new Error(`${effectiveProvider} API请求失败: ${response.status} - ${errorText}`)
          }

          const data = await response.json()
          optimizedPrompt = data.choices?.[0]?.message?.content || ''
        }

        processingTime = (Date.now() - startTime) / 1000
      }

      if (!optimizedPrompt) {
        throw new Error('AI模型未返回有效响应')
      }

      // 处理AI响应，去掉常见的前缀文本
      let finalOptimizedPrompt = optimizedPrompt.trim()
      
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
          error: formattedError
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

import { NextRequest, NextResponse } from 'next/server'
import { getAIRequestConfig, AI_MODELS } from '@/config/ai'
import { validateAIModel, formatAIError } from '@/lib/ai-utils'

/**
* 提示词生成API
* 请求体大小限制: 10MB (通过Next.js默认配置)
* 输入验证: 各输入字段长度不能超过10000字符
*/
/**
 * 提示词生成API
 * 请求体大小限制: 10MB
 * 输入验证: 各输入字段长度不能超过10000字符
 */ + '

/**' + '
 * 提示词生成API' + '
 * 请求体大小限制: 10MB (通过Next.js默认配置)' + '
 * 输入验证: 各输入字段长度不能超过10000字符' + '
 */'

/**
* 提示词生成API
* 请求体大小限制: 10MB (通过Next.js默认配置)
* 输入验证: 各输入字段长度不能超过10000字符
*/
export async function POST(request: NextRequest) {
  try {
    const { 
      userInfo,
      targetDescription,
      writingStyle,
      tone,
      outputFormat,
      examples,
      tags,
      provider = 'qwen',
      model = 'qwen3.5-plus'
    } = await request.json()

// 输入长度限制
const MAX_INPUT_LENGTH = 10000;
if ((userInfo && userInfo.length > MAX_INPUT_LENGTH) || (targetDescription && targetDescription.length > MAX_INPUT_LENGTH)) {
return NextResponse.json({ error: "输入长度不能超过" + MAX_INPUT_LENGTH + "字符" }, { status: 400 });
}
    if (!userInfo || !targetDescription) {
      return NextResponse.json(
        { success: false, error: '用户信息和目标描述不能为空' },
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
    
    // 构建生成提示词的系统提示
    const systemPrompt = `你是世界顶级的提示词工程专家，专精于根据用户提供的信息生成专业、高效、结构化的提示词。你的任务是分析用户的需求和背景信息，识别应用场景，然后创建一个完整、专业、可执行的提示词。

## 一、场景识别能力

你必须能够根据用户的需求描述自动识别应用场景：

**1. 代码生成场景** - 编程、算法、调试等技术任务
**2. 内容创作场景** - 文章、故事、营销文案等创意写作
**3. 问题解答场景** - 知识咨询、问题分析、方案建议
**4. 数据分析场景** - 数据处理、统计分析、报告生成
**5. 教育学习场景** - 知识讲解、技能教学、学习辅导
**6. 办公效率场景** - 文档处理、邮件撰写、会议纪要
**7. 对话交互场景** - 角色扮演、客服对话、心理疏导

## 二、生成模式选择

**模式A：简洁模式（concise）**
- 适用：快速任务、简单需求、经验用户
- 特点：精简结构，直接明确

**模式B：专业模式（professional）**
- 适用：正式文档、企业应用、技术任务
- 特点：完整结构，详细规范

**模式C：创意模式（creative）**
- 适用：创意工作、头脑风暴
- 特点：灵活空间，多元解决方案

自动判断规则：
- 用户未指定模式时，根据需求复杂度自动选择
- 用户可通过 [简洁]、[专业]、[创意] 关键词指定模式

## 三、核心生成原则

1. **场景适配**：根据识别出的场景采用对应的生成策略
2. **结构化设计**：采用适合的框架（Role-Profile-Skills-Rules-Workflows或精简框架）
3. **个性化定制**：根据用户的写作风格、语调等要求进行定制
4. **专业术语**：使用相关领域的专业术语提升准确性
5. **约束明确**：将用户要求转化为明确的操作规范
6. **输出标准化**：规范输出格式，提升可读性和执行效率

## 四、场景差异化生成规则

**代码生成场景**：
- 明确编程语言版本和技术栈
- 规定代码风格和命名规范
- 添加错误处理和边界检查要求

**内容创作场景**：
- 明确目标受众和文章调性
- 规定文章结构
- 强调原创性和独特视角

**问题解答场景**：
- 要求先分析问题再给出答案
- 鼓励多角度思考
- 提供可验证的答案来源

## 五、输出质量保证

**绝对禁止：**
- 输出任何解释、说明文字
- 添加任何前缀（如"生成的提示词："）
- 使用非中文（除非用户明确要求）

**必须保证：**
- 生成的提示词完整覆盖用户需求
- 输出内容专业、实用、可执行
- 保持中文语言输出

## 六、输出结构规范

**专业模式输出结构：**
# Role: [专业角色定义]

## Profile
- author: [作者信息]
- version: [版本号]
- language: 中文
- description: [详细描述]
- target: [服务对象和应用场景]

## Skills
[具体技能清单]

## Rules
[操作规范]

## Workflow
[步骤序列]

## OutputFormat
[输出格式]

## Initialization
作为 [角色名称]，严格按照上述Skills、Rules和Workflow为用户提供专业服务。

**简洁模式输出结构：**
# Role: [简短角色定义]
## Goal: [核心目标]
## Requirements: [关键要求]
## Output: [输出格式]

**创意模式输出结构：**
# 创意任务：[任务主题]
## 核心方向：[创意边界]
## 探索空间：[允许发挥的领域]
## 质量标准：[基本要求]
## 期望输出：[输出形式]

现在，基于以下用户信息生成专业提示词：`

    // 构建用户信息
    const userMessage = `**用户信息:** ${userInfo}

**目标描述:** ${targetDescription}

**写作风格:** ${writingStyle || '专业、清晰'}

**语调:** ${tone || '正式、友好'}

**输出格式:** ${outputFormat || '结构化文本'}

**示例:** ${examples || '无'}

**标签:** ${tags || '无'}

**重要生成要求：**
1. **必须根据用户信息进行个性化定制**
2. **确保生成的提示词完整、专业、可执行**
3. **结合用户的写作风格和语调要求**
4. **考虑用户提供的示例和标签信息**
5. **输出格式要符合用户的要求**
6. **确保生成的提示词比用户描述更详细、更专业**
7. **必须使用清晰的分点分段格式，绝对不能挤在一起**`

    let generatedPrompt: string = ''
    let processingTime = 0
    const startTime = Date.now()

    try {
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

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

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
        generatedPrompt = data.choices?.[0]?.message?.content || ''
      } else if (effectiveProvider === 'deepseek') {
          // DeepSeek API调用 - 修复模型名称
          headers['Authorization'] = `Bearer ${aiConfig.apiKey}`

          // 使用正确的DeepSeek模型名称 - 根据实际API文档
          let deepseekModel = aiConfig.model;
          
          // 模型名称映射 - 确保使用正确的API模型名称

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000);
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
          generatedPrompt = data.choices?.[0]?.message?.content || ''
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

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000);
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
          generatedPrompt = data.choices?.[0]?.message?.content || ''
        }

        processingTime = (Date.now() - startTime) / 1000

      if (!generatedPrompt) {
        throw new Error('AI模型未返回有效响应')
      }

      // 处理AI响应，去掉常见的前缀文本
      let finalGeneratedPrompt = generatedPrompt.trim()
      
      const prefixesToRemove = [
        '生成的提示词：',
        '生成结果：',
        '生成的内容：',
        'AI生成结果：',
        '生成建议：',
        '生成版本：',
        '**生成的提示词：**',
        '**生成结果：**',
        '**生成的内容：**',
        '**AI生成结果：**',
        '**生成建议：**',
        '**生成版本：**'
      ]
      
      for (const prefix of prefixesToRemove) {
        if (finalGeneratedPrompt.startsWith(prefix)) {
          finalGeneratedPrompt = finalGeneratedPrompt.substring(prefix.length).trim()
          break
        }
      }

      return NextResponse.json({
        success: true,
        generated: finalGeneratedPrompt,
        processing_time: Math.round(processingTime * 100) / 100,
        provider,
        model
      })

    } catch (error) {
      console.error('AI生成失败:', error)
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
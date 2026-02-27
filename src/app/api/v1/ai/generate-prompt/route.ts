import { NextRequest, NextResponse } from "next/server"
import { getAIRequestConfig, AI_MODELS } from "@/config/ai"
import { validateAIModel, formatAIError } from "@/lib/ai-utils"

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
      provider = "qwen",
      model = "qwen3.5-plus"
    } = await request.json()

    // 输入长度限制
    const MAX_INPUT_LENGTH = 10000;
    if ((userInfo && userInfo.length > MAX_INPUT_LENGTH) || (targetDescription && targetDescription.length > MAX_INPUT_LENGTH)) {
      return NextResponse.json({ error: "输入长度不能超过" + MAX_INPUT_LENGTH + "字符" }, { status: 400 });
    }

    if (!userInfo || !targetDescription) {
      return NextResponse.json(
        { success: false, error: "用户信息和目标描述不能为空" },
        { status: 400 }
      )
    }

    // 如果是local则重定向到qwen
    const effectiveProvider = provider === "local" ? "qwen" : provider

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
    
    // 系统提示：精简但有效
    const systemPrompt = `你是提示词生成专家。根据用户信息和目标描述，生成一个结构化、专业的提示词。

规则：
1. 直接输出生成的提示词，不添加任何前缀、解释或说明
2. 使用清晰的Markdown分段格式（# Role / ## Skills / ## Rules / ## Workflow）
3. 提示词必须覆盖用户描述的所有需求细节
4. 使用与用户输入相同的语言
5. 内容专业、实用、可直接使用`

    const userMessage = "用户信息: " + userInfo + "，目标: " + targetDescription

    let generatedPrompt = ""
    let processingTime = 0
    const startTime = Date.now()

    // 从headers中获取API密钥
    const apiKey = aiConfig.headers['Authorization']?.replace('Bearer ', '')

    try {
      if (!apiKey) {
        throw new Error("未配置API密钥")
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }

      if (effectiveProvider === "qwen") {
        headers["Authorization"] = "Bearer " + apiKey
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const response = await fetch(aiConfig.baseURL + "/chat/completions", {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: aiConfig.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage }
            ],
            temperature: aiConfig.temperature,
            max_tokens: aiConfig.max_tokens,
            stream: false
          }),
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorText = await response.text()
          console.error("Qwen API错误 (" + response.status + "):", errorText)
          throw new Error("Qwen API请求失败: " + response.status)
        }

        const data = await response.json()
        generatedPrompt = data.choices?.[0]?.message?.content || ""
      } else if (effectiveProvider === "deepseek") {
        headers["Authorization"] = "Bearer " + apiKey

        let deepseekModel = aiConfig.model;
        const modelMapping: Record<string, string> = {
          "deepseek-chat": "deepseek-chat",
          "deepseek-v3": "deepseek-v3",
          "deepseek-r1": "deepseek-r1"
        };
        deepseekModel = modelMapping[aiConfig.model] || "deepseek-chat";

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const response = await fetch(aiConfig.baseURL + "/chat/completions", {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: deepseekModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage }
            ],
            temperature: aiConfig.temperature,
            max_tokens: aiConfig.max_tokens,
            stream: false
          }),
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorText = await response.text()
          console.error("DeepSeek API错误 (" + response.status + "):", errorText)
          throw new Error("DeepSeek API请求失败: " + response.status)
        }

        const data = await response.json()
        generatedPrompt = data.choices?.[0]?.message?.content || ""
      } else {
        headers["Authorization"] = "Bearer " + apiKey

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const response = await fetch(aiConfig.baseURL + "/chat/completions", {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: aiConfig.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage }
            ],
            temperature: aiConfig.temperature,
            max_tokens: aiConfig.max_tokens
          }),
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorText = await response.text()
          console.error(effectiveProvider + " API错误 (" + response.status + "):", errorText)
          throw new Error(effectiveProvider + " API请求失败: " + response.status)
        }

        const data = await response.json()
        generatedPrompt = data.choices?.[0]?.message?.content || ""
      }

      processingTime = (Date.now() - startTime) / 1000

      if (!generatedPrompt) {
        throw new Error("AI模型未返回有效响应")
      }

      return NextResponse.json({
        success: true,
        generated: generatedPrompt.trim(),
        processing_time: Math.round(processingTime * 100) / 100,
        provider,
        model
      })

    } catch (error) {
      console.error("AI生成失败:", error)
      const formattedError = formatAIError(error, effectiveProvider)
      return NextResponse.json(
        {
          success: false,
          error: formattedError,
          details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : "Unknown error") : "Internal server error"
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error("API错误:", error)
    return NextResponse.json(
      {
        success: false,
        error: "请求处理失败"
      },
      { status: 500 }
    )
  }
}
const fs = require('fs');
const content = `import { NextRequest, NextResponse } from 'next/server'
import { getAIRequestConfig, AI_MODELS } from '@/config/ai'
import { validateAIModel, formatAIError } from '@/lib/ai-utils'

/**
 * 提示词优化API
 * 请求体大小限制: 10MB (通过Next.js默认配置)
 * 输入验证: 提示词长度不能超过10000字符
 */

export async function POST(request: NextRequest) {
  try {
    const {
      prompt,
      provider = 'qwen',
      model = 'qwen3.5-plus'
    } = await request.json()

    // 输入长度限制
    const MAX_INPUT_LENGTH = 10000;
    if (prompt && prompt.length > MAX_INPUT_LENGTH) {
      return NextResponse.json({ error: "输入长度不能超过" + MAX_INPUT_LENGTH + "字符" }, { status: 400 });
    }

import re

with open("route.ts", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add comment after imports
content = content.replace("import { validateAIModel, formatAIError } from '@/lib/ai-utils'\n\n", "import { validateAIModel, formatAIError } from '@/lib/ai-utils' + "\n\n" + "/**\n * 提示词优化API\n * 请求体大小限制: 10MB (通过Next.js默认配置)\n * 输入验证: 提示词长度不能超过10000字符\n */\n\n")

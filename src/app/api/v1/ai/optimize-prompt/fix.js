const fs = require("fs");
let content = fs.readFileSync("route.ts", "utf8");
content = content.replace("import { validateAIModel, formatAIError } from '@/lib/ai-utils'", "import { validateAIModel, formatAIError } from '@/lib/ai-utils' + String.fromCharCode(10) + String.fromCharCode(10) + "/**" + String.fromCharCode(10) + " * 提示词优化API" + String.fromCharCode(10) + " * 请求体大小限制: 10MB (通过Next.js默认配置)" + String.fromCharCode(10) + " * 输入验证: 提示词长度不能超过10000字符" + String.fromCharCode(10) + " */" + String.fromCharCode(10));
content = content.replace("} = await request.json()" + String.fromCharCode(10) + String.fromCharCode(10) + "    if (!prompt)", "} = await request.json()" + String.fromCharCode(10) + String.fromCharCode(10) + "    // 输入长度限制" + String.fromCharCode(10) + "    const MAX_INPUT_LENGTH = 10000;" + String.fromCharCode(10) + "    if (prompt && prompt.length > MAX_INPUT_LENGTH) {" + String.fromCharCode(10) + "      return NextResponse.json({ error: \\"输入长度不能超过\\" + MAX_INPUT_LENGTH + \\"字符\\" }, { status: 400 });" + String.fromCharCode(10) + "    }" + String.fromCharCode(10) + String.fromCharCode(10) + "    if (!prompt)");
fs.writeFileSync("route.ts", content);
console.log("Done");

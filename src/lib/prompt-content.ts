import { ProfessionalModeData } from '@/types'

function appendSection(parts: string[], title: string, content?: string) {
  const normalizedContent = content?.trim()
  if (!normalizedContent) return
  parts.push(`## ${title}\n${normalizedContent}`)
}

function appendListSection(parts: string[], title: string, items?: string[]) {
  const normalizedItems = (items || [])
    .map(item => item.trim())
    .filter(Boolean)

  if (normalizedItems.length === 0) return
  parts.push(`## ${title}\n${normalizedItems.map((item, index) => `${index + 1}. ${item}`).join('\n')}`)
}

function appendVariableSection(parts: string[], variables?: Record<string, string>) {
  const entries = Object.entries(variables || {})
    .map(([name, description]) => [name.trim(), description.trim()] as const)
    .filter(([name]) => Boolean(name))

  if (entries.length === 0) return
  parts.push(`## 变量定义\n${entries.map(([name, description]) => `- {{${name}}}: ${description || '请在使用时填写'}`).join('\n')}`)
}

export function composeProfessionalPrompt(data: ProfessionalModeData) {
  const parts: string[] = []

  appendSection(parts, '角色设定', data.role)
  appendSection(parts, '背景信息', data.background)
  appendSection(parts, '任务目标', data.task)
  appendSection(parts, '输出格式', data.format)
  appendSection(parts, '输出风格', data.outputStyle)
  appendListSection(parts, '格式化规范', data.formatRules)
  appendListSection(parts, '可量化指标', data.qualityMetrics)
  appendListSection(parts, '验收标准', data.acceptanceCriteria)
  appendListSection(parts, '约束条件', data.constraints)
  appendListSection(parts, '示例参考', data.examples)
  appendVariableSection(parts, data.variables)

  return parts.join('\n\n').trim() || data.content.trim()
}
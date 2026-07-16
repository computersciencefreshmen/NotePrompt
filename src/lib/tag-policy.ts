export const MAX_PROMPT_TAGS = 20
export const MAX_TAG_NAME_CHARS = 50

export class TagValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TagValidationError'
  }
}

export function normalizePromptTagNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new TagValidationError('标签必须是数组')
  }
  if (value.length > MAX_PROMPT_TAGS) {
    throw new TagValidationError(`最多只能添加 ${MAX_PROMPT_TAGS} 个标签`)
  }

  const normalized: string[] = []
  const seen = new Set<string>()
  for (const candidate of value) {
    if (typeof candidate !== 'string') {
      throw new TagValidationError('标签必须是字符串')
    }
    const tag = candidate.trim()
    if (!tag || tag.length > MAX_TAG_NAME_CHARS) {
      throw new TagValidationError(`标签名称必须为 1-${MAX_TAG_NAME_CHARS} 个字符`)
    }
    const identity = tag.toLowerCase()
    if (seen.has(identity)) continue
    seen.add(identity)
    normalized.push(tag)
  }
  return normalized
}

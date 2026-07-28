export const MAX_AI_JSON_BODY_BYTES = 256 * 1024
export const MAX_AI_INPUT_CHARS = 10_000
export const MAX_AI_ATTACHMENTS = 6
export const MAX_AI_ATTACHMENT_PREVIEW_CHARS = 5_000
export const MAX_AI_ATTACHMENT_PREVIEW_TOTAL_CHARS = 30_000
export const MAX_AI_ATTACHMENT_FILE_BYTES = 5 * 1024 * 1024
export const MAX_AI_ATTACHMENT_FILES_TOTAL_BYTES = 15 * 1024 * 1024
export const MAX_ATTACHMENT_UPLOAD_BODY_BYTES = 20 * 1024 * 1024
export const MAX_CONVERSATION_HISTORY_MESSAGES = 20
export const MAX_CONVERSATION_MESSAGE_CHARS = 10_000
export const MAX_CONVERSATION_HISTORY_CHARS = 50_000
export const MAX_AI_OPTIMIZATION_CONSTRAINTS = 12
export const MAX_AI_OPTIMIZATION_CONSTRAINT_CHARS = 500

const AI_OPTIMIZATION_MODES = new Set(['simple', 'normal', 'pro', 'professional'])
const AI_OPTIMIZATION_STYLES = new Set(['concise', 'structured', 'creative', 'business', 'academic'])
const AI_OPTIMIZATION_TONES = new Set(['neutral', 'friendly', 'professional', 'confident'])
const AI_OPTIMIZATION_OUTPUT_FORMATS = new Set(['markdown', 'list', 'steps', 'table', 'json'])

const PROVIDER_HTTPS_HOSTS: Readonly<Record<string, readonly string[]>> = {
  qwen: ['dashscope.aliyuncs.com'],
  deepseek: ['api.deepseek.com'],
  kimi: ['api.moonshot.cn'],
  zhipu: ['open.bigmodel.cn'],
  minimax: ['api.minimaxi.com'],
  xiaomi: ['api.xiaomimimo.com'],
}

export class RequestPolicyError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'RequestPolicyError'
    this.status = status
  }
}

export type SafeAIRequestAttachment = {
  name: string
  type: string
  size: number
  parseStatus: string
  textPreview: string
}

export type SafeConversationMessage = {
  role: 'user' | 'assistant'
  content: string
}

function parseOptionalAIOption(value: unknown, allowed: ReadonlySet<string>, fieldName: string) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new RequestPolicyError(`${fieldName} 不受支持`, 400)
  }
  return value
}

export function parseAIOptimizationPreferences(input: Record<string, unknown>) {
  const rawMode = input.mode
  const mode = rawMode === undefined || rawMode === null || rawMode === ''
    ? undefined
    : parseOptionalAIOption(rawMode, AI_OPTIMIZATION_MODES, '优化模式')
  const rawConstraints = input.constraints
  if (rawConstraints !== undefined && !Array.isArray(rawConstraints)) {
    throw new RequestPolicyError('约束条件必须是数组', 400)
  }
  if (Array.isArray(rawConstraints) && rawConstraints.length > MAX_AI_OPTIMIZATION_CONSTRAINTS) {
    throw new RequestPolicyError(`约束条件不能超过 ${MAX_AI_OPTIMIZATION_CONSTRAINTS} 项`, 400)
  }

  const constraintItems = Array.isArray(rawConstraints) ? rawConstraints : []
  const constraints = constraintItems.map((item: unknown) => {
    if (typeof item !== 'string') throw new RequestPolicyError('约束条件必须是字符串', 400)
    const normalized = item.trim()
    if (!normalized || normalized.length > MAX_AI_OPTIMIZATION_CONSTRAINT_CHARS) {
      throw new RequestPolicyError(`单项约束必须为 1-${MAX_AI_OPTIMIZATION_CONSTRAINT_CHARS} 个字符`, 400)
    }
    return normalized
  })

  return {
    mode,
    style: parseOptionalAIOption(input.style, AI_OPTIMIZATION_STYLES, '优化风格'),
    tone: parseOptionalAIOption(input.tone, AI_OPTIMIZATION_TONES, '语调'),
    outputFormat: parseOptionalAIOption(input.outputFormat, AI_OPTIMIZATION_OUTPUT_FORMATS, '输出格式'),
    constraints,
  }
}

function getContentLength(request: Request) {
  const rawValue = request.headers.get('content-length')
  if (!rawValue) return null

  const parsed = Number(rawValue)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new RequestPolicyError('无效的 Content-Length', 400)
  }
  return parsed
}

export type ReadLimitedBodyOptions = { signal?: AbortSignal }

function requestAbortReason(signal: AbortSignal) {
  return signal.reason instanceof Error ? signal.reason : new DOMException('Request aborted', 'AbortError')
}

function throwIfRequestAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw requestAbortReason(signal)
}

export async function readLimitedBody(
  request: Request,
  maxBytes: number,
  options: ReadLimitedBodyOptions = {},
): Promise<Uint8Array> {
  const signal = options.signal
  throwIfRequestAborted(signal)
  const contentLength = getContentLength(request)
  if (contentLength !== null && contentLength > maxBytes) {
    throw new RequestPolicyError('请求体过大', 413)
  }

  if (!request.body) return new Uint8Array()

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  const cancelOnAbort = () => { void reader.cancel().catch(() => undefined) }
  signal?.addEventListener('abort', cancelOnAbort, { once: true })

  try {
    while (true) {
      throwIfRequestAborted(signal)
      const { done, value } = await reader.read()
      throwIfRequestAborted(signal)
      if (done) break
      if (!value) continue

      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new RequestPolicyError('请求体过大', 413)
      }
      chunks.push(value)
    }
    throwIfRequestAborted(signal)
  } finally {
    signal?.removeEventListener('abort', cancelOnAbort)
    reader.releaseLock()
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export async function readLimitedJson<T = Record<string, unknown>>(
  request: Request,
  maxBytes = MAX_AI_JSON_BODY_BYTES,
): Promise<T> {
  const contentType = request.headers.get('content-type')?.toLowerCase() || ''
  if (contentType && !contentType.includes('application/json')) {
    throw new RequestPolicyError('请求必须使用 application/json', 415)
  }

  const body = await readLimitedBody(request, maxBytes)
  if (body.byteLength === 0) {
    throw new RequestPolicyError('请求体不能为空', 400)
  }

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(body)
    const parsed = JSON.parse(decoded) as T
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new RequestPolicyError('请求体必须是 JSON 对象', 400)
    }
    return parsed
  } catch (error) {
    if (error instanceof RequestPolicyError) throw error
    throw new RequestPolicyError('请求体不是有效的 JSON', 400)
  }
}

export function normalizeProviderBaseURL(provider: string, candidate?: string | null): string | undefined {
  const trimmed = candidate?.trim()
  if (!trimmed) return undefined

  const allowedHosts = PROVIDER_HTTPS_HOSTS[provider]
  if (!allowedHosts) {
    throw new RequestPolicyError('不支持的模型供应商', 400)
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new RequestPolicyError('API 地址格式无效', 400)
  }

  const hostname = parsed.hostname.toLowerCase()
  const isAllowedHost = allowedHosts.some(host => hostname === host)
  if (
    parsed.protocol !== 'https:' ||
    !isAllowedHost ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== '443') ||
    parsed.search ||
    parsed.hash
  ) {
    throw new RequestPolicyError('API 地址必须使用该供应商受支持的 HTTPS 主机', 400)
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '')
  return `${parsed.origin}${normalizedPath}`
}

export function parseAIRequestAttachments(value: unknown): SafeAIRequestAttachment[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw new RequestPolicyError('附件上下文格式无效', 400)
  }
  if (value.length > MAX_AI_ATTACHMENTS) {
    throw new RequestPolicyError(`一次最多使用 ${MAX_AI_ATTACHMENTS} 个附件`, 413)
  }

  let totalPreviewChars = 0
  let totalDeclaredBytes = 0
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new RequestPolicyError(`第 ${index + 1} 个附件格式无效`, 400)
    }

    const attachment = item as Record<string, unknown>
    const rawSize = attachment.size === undefined ? 0 : attachment.size
    if (typeof rawSize !== 'number' || !Number.isFinite(rawSize) || rawSize < 0) {
      throw new RequestPolicyError(`第 ${index + 1} 个附件大小无效`, 400)
    }
    if (rawSize > MAX_AI_ATTACHMENT_FILE_BYTES) {
      throw new RequestPolicyError(`第 ${index + 1} 个附件超过 5MB`, 413)
    }

    const textPreview = typeof attachment.textPreview === 'string' ? attachment.textPreview : ''
    if (textPreview.length > MAX_AI_ATTACHMENT_PREVIEW_CHARS) {
      throw new RequestPolicyError(`第 ${index + 1} 个附件摘录过长`, 413)
    }

    totalPreviewChars += textPreview.length
    totalDeclaredBytes += rawSize
    if (totalPreviewChars > MAX_AI_ATTACHMENT_PREVIEW_TOTAL_CHARS) {
      throw new RequestPolicyError('附件摘录总长度过大', 413)
    }
    if (totalDeclaredBytes > MAX_AI_ATTACHMENT_FILES_TOTAL_BYTES) {
      throw new RequestPolicyError('附件总大小不能超过 15MB', 413)
    }

    return {
      name: typeof attachment.name === 'string' ? attachment.name.slice(0, 120) : 'unnamed',
      type: typeof attachment.type === 'string' ? attachment.type.slice(0, 80) : 'application/octet-stream',
      size: rawSize,
      parseStatus: typeof attachment.parseStatus === 'string' ? attachment.parseStatus.slice(0, 20) : 'metadata',
      textPreview,
    }
  })
}

export function parseConversationHistory(value: unknown): SafeConversationMessage[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw new RequestPolicyError('对话历史格式无效', 400)
  }
  if (value.length > MAX_CONVERSATION_HISTORY_MESSAGES) {
    throw new RequestPolicyError(`对话历史最多 ${MAX_CONVERSATION_HISTORY_MESSAGES} 条`, 413)
  }

  let totalChars = 0
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new RequestPolicyError(`第 ${index + 1} 条对话格式无效`, 400)
    }
    const message = item as Record<string, unknown>
    if (message.role !== 'user' && message.role !== 'assistant') {
      throw new RequestPolicyError(`第 ${index + 1} 条对话角色无效`, 400)
    }
    if (typeof message.content !== 'string' || message.content.length > MAX_CONVERSATION_MESSAGE_CHARS) {
      throw new RequestPolicyError(`第 ${index + 1} 条对话内容无效或过长`, 413)
    }

    totalChars += message.content.length
    if (totalChars > MAX_CONVERSATION_HISTORY_CHARS) {
      throw new RequestPolicyError('对话历史总长度过大', 413)
    }
    return { role: message.role, content: message.content }
  })
}

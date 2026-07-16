import type {
  EditMode,
  NormalModeData,
  ProfessionalModeData,
  PromptEditorState,
} from '@/types'

export const PROMPT_EDITOR_SCHEMA_VERSION = 1 as const
export const PROMPT_EDITOR_PAYLOAD_MAX_BYTES = 64 * 1024
export const PROMPT_EDITOR_TEXT_MAX_LENGTH = 16 * 1024
export const PROMPT_EDITOR_CORE_TEXT_MAX_LENGTH = 60 * 1024
export const PROMPT_EDITOR_LIST_MAX_ITEMS = 32
export const PROMPT_EDITOR_LIST_ITEM_MAX_LENGTH = 2 * 1024
export const PROMPT_EDITOR_VARIABLE_MAX_ITEMS = 50
export const PROMPT_EDITOR_VARIABLE_NAME_MAX_LENGTH = 64
export const PROMPT_EDITOR_VARIABLE_VALUE_MAX_LENGTH = 4 * 1024

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const NORMAL_KEYS = new Set(['title', 'objective', 'context', 'style', 'tone', 'format', 'examples'])
const PROFESSIONAL_KEYS = new Set([
  'title',
  'content',
  'role',
  'background',
  'task',
  'format',
  'outputStyle',
  'formatRules',
  'qualityMetrics',
  'acceptanceCriteria',
  'constraints',
  'examples',
  'variables',
])

type PlainRecord = Record<string, unknown>

export type PromptEditorStateInput = {
  editor_mode?: unknown
  payload?: unknown
  schema_version?: unknown
}

export type PromptEditorFallback = {
  title: unknown
  content: unknown
  mode?: unknown
}

export class PromptEditorStateValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PromptEditorStateValidationError'
  }
}

function fail(message: string): never {
  throw new PromptEditorStateValidationError(message)
}

function isPlainRecord(value: unknown): value is PlainRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertPlainRecord(value: unknown, field: string): PlainRecord {
  if (!isPlainRecord(value)) fail(`${field} 必须是普通 JSON 对象`)
  return value
}

function assertAllowedKeys(record: PlainRecord, allowed: Set<string>, field: string) {
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_KEYS.has(key)) fail(`${field} 包含不安全字段`)
    if (!allowed.has(key)) fail(`${field} 包含未知字段: ${key}`)
  }
}

function normalizeString(
  record: PlainRecord,
  key: string,
  options: { required?: boolean; maxLength?: number; trim?: boolean } = {},
) {
  const value = record[key]
  if (value === undefined || value === null) {
    if (options.required) fail(`${key} 为必填字段`)
    return ''
  }
  if (typeof value !== 'string') fail(`${key} 必须是字符串`)
  const normalized = options.trim ? value.trim() : value
  if (options.required && normalized.trim().length === 0) fail(`${key} 不能为空`)
  const maxLength = options.maxLength ?? PROMPT_EDITOR_TEXT_MAX_LENGTH
  if (normalized.length > maxLength) fail(`${key} 超过长度限制`)
  return normalized
}

function normalizeStringList(record: PlainRecord, key: string) {
  const value = record[key]
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) fail(`${key} 必须是字符串数组`)
  if (value.length > PROMPT_EDITOR_LIST_MAX_ITEMS) fail(`${key} 超过项目数量限制`)
  return value.map((item, index) => {
    if (typeof item !== 'string') fail(`${key}[${index}] 必须是字符串`)
    const normalized = item.trim()
    if (normalized.length > PROMPT_EDITOR_LIST_ITEM_MAX_LENGTH) fail(`${key}[${index}] 超过长度限制`)
    return normalized
  }).filter(Boolean)
}

function normalizeVariables(record: PlainRecord) {
  const value = record.variables
  if (value === undefined || value === null) return {}
  const variables = assertPlainRecord(value, 'variables')
  const entries = Object.entries(variables)
  if (entries.length > PROMPT_EDITOR_VARIABLE_MAX_ITEMS) fail('variables 超过项目数量限制')

  const normalized: Record<string, string> = {}
  for (const [rawName, rawValue] of entries) {
    const name = rawName.trim()
    if (FORBIDDEN_KEYS.has(rawName) || FORBIDDEN_KEYS.has(name)) fail('variables 包含不安全字段')
    if (!name) fail('variables 名称不能为空')
    if (name.length > PROMPT_EDITOR_VARIABLE_NAME_MAX_LENGTH) fail(`变量名 ${name} 超过长度限制`)
    if (typeof rawValue !== 'string') fail(`变量 ${name} 的说明必须是字符串`)
    if (rawValue.length > PROMPT_EDITOR_VARIABLE_VALUE_MAX_LENGTH) fail(`变量 ${name} 的说明超过长度限制`)
    if (Object.hasOwn(normalized, name)) fail(`变量名 ${name} 重复`)
    normalized[name] = rawValue
  }
  return normalized
}

function normalizeNormalPayload(value: unknown): NormalModeData {
  const record = assertPlainRecord(value, 'payload')
  assertAllowedKeys(record, NORMAL_KEYS, 'payload')
  return {
    title: normalizeString(record, 'title', { required: true, maxLength: 200, trim: true }),
    objective: normalizeString(record, 'objective', {
      required: true,
      maxLength: PROMPT_EDITOR_CORE_TEXT_MAX_LENGTH,
    }),
    context: normalizeString(record, 'context'),
    style: normalizeString(record, 'style', { maxLength: 200 }),
    tone: normalizeString(record, 'tone', { maxLength: 200 }),
    format: normalizeString(record, 'format'),
    examples: normalizeString(record, 'examples'),
  }
}

function normalizeProfessionalPayload(value: unknown): ProfessionalModeData {
  const record = assertPlainRecord(value, 'payload')
  assertAllowedKeys(record, PROFESSIONAL_KEYS, 'payload')
  const content = normalizeString(record, 'content', { maxLength: PROMPT_EDITOR_CORE_TEXT_MAX_LENGTH })
  const task = normalizeString(record, 'task', { maxLength: PROMPT_EDITOR_CORE_TEXT_MAX_LENGTH })
  if (!content.trim() && !task.trim()) fail('professional payload 至少需要 content 或 task')

  return {
    title: normalizeString(record, 'title', { required: true, maxLength: 200, trim: true }),
    content,
    role: normalizeString(record, 'role'),
    background: normalizeString(record, 'background'),
    task,
    format: normalizeString(record, 'format'),
    outputStyle: normalizeString(record, 'outputStyle'),
    formatRules: normalizeStringList(record, 'formatRules'),
    qualityMetrics: normalizeStringList(record, 'qualityMetrics'),
    acceptanceCriteria: normalizeStringList(record, 'acceptanceCriteria'),
    constraints: normalizeStringList(record, 'constraints'),
    examples: normalizeStringList(record, 'examples'),
    variables: normalizeVariables(record),
  }
}

function encodedLength(value: unknown) {
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    fail('payload 必须是可序列化 JSON')
  }
  return new TextEncoder().encode(serialized).length
}

function assertPayloadSize(payload: NormalModeData | ProfessionalModeData) {
  if (encodedLength(payload) > PROMPT_EDITOR_PAYLOAD_MAX_BYTES) {
    fail('payload 超过 64 KiB 限制')
  }
}

function parsePayload(value: unknown) {
  if (typeof value !== 'string') return value
  if (new TextEncoder().encode(value).length > PROMPT_EDITOR_PAYLOAD_MAX_BYTES) {
    fail('payload 超过 64 KiB 限制')
  }
  try {
    return JSON.parse(value) as unknown
  } catch {
    fail('payload 不是有效 JSON')
  }
}

export function normalizePromptEditorMode(value: unknown, fallback: EditMode = 'normal'): EditMode {
  if (value === undefined || value === null || value === '') return fallback
  if (value === 'normal' || value === 'simple' || value === 'basic') return 'normal'
  if (value === 'professional' || value === 'pro') return 'professional'
  fail('editor_mode 必须是 normal 或 professional')
}

export function createFallbackPromptEditorState(fallback: PromptEditorFallback): PromptEditorState {
  const mode = normalizePromptEditorMode(fallback.mode)
  const title = typeof fallback.title === 'string' ? fallback.title : ''
  const content = typeof fallback.content === 'string' ? fallback.content : ''
  if (mode === 'professional') {
    return normalizePromptEditorState({
      editor_mode: mode,
      schema_version: PROMPT_EDITOR_SCHEMA_VERSION,
      payload: {
        title,
        content,
        task: content,
        role: '',
        background: '',
        format: '',
        outputStyle: '',
        formatRules: [],
        qualityMetrics: [],
        acceptanceCriteria: [],
        constraints: [],
        examples: [],
        variables: {},
      },
    }, fallback)
  }
  return normalizePromptEditorState({
    editor_mode: mode,
    schema_version: PROMPT_EDITOR_SCHEMA_VERSION,
    payload: {
      title,
      objective: content,
      context: '',
      style: '',
      tone: '',
      format: '',
      examples: '',
    },
  }, fallback)
}

export function normalizePromptEditorState(
  input: PromptEditorStateInput,
  fallback: PromptEditorFallback,
): PromptEditorState {
  if (input.payload === undefined || input.payload === null) {
    return createFallbackPromptEditorState({
      ...fallback,
      mode: input.editor_mode ?? fallback.mode,
    })
  }

  const schemaVersion = input.schema_version === undefined || input.schema_version === null
    ? PROMPT_EDITOR_SCHEMA_VERSION
    : Number(input.schema_version)
  if (!Number.isInteger(schemaVersion) || schemaVersion !== PROMPT_EDITOR_SCHEMA_VERSION) {
    fail(`不支持的 schema_version: ${String(input.schema_version)}`)
  }

  const mode = normalizePromptEditorMode(input.editor_mode, normalizePromptEditorMode(fallback.mode))
  const parsedPayload = parsePayload(input.payload)
  if (mode === 'professional') {
    const payload = normalizeProfessionalPayload(parsedPayload)
    assertPayloadSize(payload)
    return { editor_mode: mode, payload, schema_version: PROMPT_EDITOR_SCHEMA_VERSION }
  }
  const payload = normalizeNormalPayload(parsedPayload)
  assertPayloadSize(payload)
  return { editor_mode: mode, payload, schema_version: PROMPT_EDITOR_SCHEMA_VERSION }
}

export function resolveStoredPromptEditorState(record: PlainRecord): PromptEditorState {
  const fallback = {
    title: record.title,
    content: record.content,
    mode: record.editor_mode ?? record.mode,
  }
  try {
    return normalizePromptEditorState({
      editor_mode: record.editor_mode ?? record.mode,
      payload: record.payload,
      schema_version: record.schema_version,
    }, fallback)
  } catch (error) {
    if (!(error instanceof PromptEditorStateValidationError)) throw error
    return createFallbackPromptEditorState(fallback)
  }
}

function appendSection(parts: string[], title: string, content?: string) {
  const normalizedContent = content?.trim()
  if (normalizedContent) parts.push(`## ${title}\n${normalizedContent}`)
}

function appendListSection(parts: string[], title: string, items?: string[]) {
  const normalizedItems = (items || []).map(item => item.trim()).filter(Boolean)
  if (normalizedItems.length > 0) {
    parts.push(`## ${title}\n${normalizedItems.map((item, index) => `${index + 1}. ${item}`).join('\n')}`)
  }
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

  const variables = Object.entries(data.variables || {})
    .map(([name, description]) => [name.trim(), description.trim()] as const)
    .filter(([name]) => Boolean(name))
  if (variables.length > 0) {
    parts.push(`## 变量定义\n${variables.map(([name, description]) => `- {{${name}}}: ${description || '请在使用时填写'}`).join('\n')}`)
  }
  return parts.join('\n\n').trim() || data.content.trim()
}

export function composePromptEditorContent(state: PromptEditorState) {
  return state.editor_mode === 'professional'
    ? composeProfessionalPrompt(state.payload)
    : state.payload.objective.trim()
}

export function promptEditorTitle(state: PromptEditorState) {
  return state.payload.title.trim()
}

export function withPromptEditorTitle(state: PromptEditorState, title: string): PromptEditorState {
  return normalizePromptEditorState({
    editor_mode: state.editor_mode,
    schema_version: state.schema_version,
    payload: { ...state.payload, title },
  }, {
    title,
    content: composePromptEditorContent(state),
    mode: state.editor_mode,
  })
}

export function serializePromptEditorPayload(state: PromptEditorState) {
  return JSON.stringify(state.payload)
}

export function withResolvedPromptEditorState<T extends PlainRecord>(record: T) {
  const state = resolveStoredPromptEditorState(record)
  return {
    ...record,
    mode: state.editor_mode,
    ...state,
  }
}

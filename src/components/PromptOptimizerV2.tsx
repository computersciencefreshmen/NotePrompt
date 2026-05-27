'use client'

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FilePlus,
  History,
  Loader2,
  MessageSquare,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import { ModelDiagnosticsPanel } from '@/components/ModelDiagnosticsPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  DEFAULT_PUBLIC_AI_MODEL,
  DEFAULT_PUBLIC_AI_PROVIDER,
  getAIProviderModels,
  getAvailableAIProviders,
  getDefaultAIModel,
} from '@/config/ai-models'
import { visualStyleClasses } from '@/config/visual-styles'
import { useAuth } from '@/contexts/AuthContext'
import { useUISettings } from '@/contexts/UISettingsContext'
import { api, optimizePromptStream } from '@/lib/api'
import { detectLocaleFromSearch, Locale } from '@/lib/i18n'
import { ConversationMessage, PromptAttachmentDraft, PromptOptimizerMode } from '@/types'

type Choice = {
  value: string
  label: string
  note?: string
}

type VersionSnapshot = {
  id: string
  label: string
  title: string
  content: string
  thinkingContent: string
  conversationHistory: ConversationMessage[]
  createdAt: string
}

type ParameterPresetId = 'precise' | 'balanced' | 'creative' | 'longform'

type OptimizerSource = 'direct' | 'create' | 'edit' | 'upload'

type OptimizerDraft = {
  title?: string
  prompt?: string
  mode?: PromptOptimizerMode
  source?: OptimizerSource | 'create-prompt'
  promptId?: number
  tags?: string[]
}

const styleOptions: Choice[] = [
  { value: 'concise', label: '简洁直接', note: '减少冗余，保留关键约束' },
  { value: 'structured', label: '结构清晰', note: '强化层级、步骤和输出标准' },
  { value: 'creative', label: '创意表达', note: '适合文案、灵感、概念生成' },
  { value: 'business', label: '商业正式', note: '适合方案、汇报、邮件和运营' },
  { value: 'academic', label: '学术严谨', note: '强调定义、论证和引用意识' },
]

const styleOptionsEn: Choice[] = [
  { value: 'concise', label: 'Concise', note: 'Reduce redundancy and keep the key constraints' },
  { value: 'structured', label: 'Structured', note: 'Strengthen hierarchy, steps, and output standards' },
  { value: 'creative', label: 'Creative', note: 'Useful for copywriting, ideation, and concept work' },
  { value: 'business', label: 'Business', note: 'Best for plans, reports, emails, and operations' },
  { value: 'academic', label: 'Academic', note: 'Emphasize definitions, reasoning, and citation awareness' },
]

const toneOptions: Choice[] = [
  { value: 'neutral', label: '中性客观', note: '减少情绪色彩' },
  { value: 'friendly', label: '友好亲切', note: '更适合用户沟通场景' },
  { value: 'professional', label: '专业稳重', note: '适合默认工作流' },
  { value: 'confident', label: '明确自信', note: '指令更果断，边界更清楚' },
]

const toneOptionsEn: Choice[] = [
  { value: 'neutral', label: 'Neutral', note: 'Reduce emotional tone' },
  { value: 'friendly', label: 'Friendly', note: 'Better for user-facing communication' },
  { value: 'professional', label: 'Professional', note: 'A stable default for work prompts' },
  { value: 'confident', label: 'Confident', note: 'Make instructions firmer and boundaries clearer' },
]

const formatOptions: Choice[] = [
  { value: 'markdown', label: 'Markdown', note: '通用、清晰、便于复制' },
  { value: 'list', label: '列表', note: '适合要求和检查项' },
  { value: 'steps', label: '步骤', note: '适合流程和执行任务' },
  { value: 'table', label: '表格', note: '适合对比和结构化输出' },
  { value: 'json', label: 'JSON', note: '适合程序化消费' },
]

const formatOptionsEn: Choice[] = [
  { value: 'markdown', label: 'Markdown', note: 'General, clear, and easy to copy' },
  { value: 'list', label: 'List', note: 'Good for requirements and checklists' },
  { value: 'steps', label: 'Steps', note: 'Good for workflows and execution tasks' },
  { value: 'table', label: 'Table', note: 'Good for comparison and structured output' },
  { value: 'json', label: 'JSON', note: 'Good for programmatic consumption' },
]

const parameterPresets: Array<Choice & { value: ParameterPresetId; temperature: number; topP: number; maxTokens: number }> = [
  { value: 'precise', label: '精准改写', note: '适合保真、改错、压缩表达', temperature: 0.25, topP: 0.75, maxTokens: 2048 },
  { value: 'balanced', label: '均衡优化', note: '适合大多数提示词优化任务', temperature: 0.7, topP: 0.9, maxTokens: 4096 },
  { value: 'creative', label: '创意扩展', note: '适合文案、创意和开放任务', temperature: 1, topP: 0.95, maxTokens: 4096 },
  { value: 'longform', label: '长文专业', note: '适合复杂约束、长附件和专业模式', temperature: 0.55, topP: 0.85, maxTokens: 6144 },
]

const parameterPresetsEn: Array<Choice & { value: ParameterPresetId; temperature: number; topP: number; maxTokens: number }> = [
  { value: 'precise', label: 'Precise rewrite', note: 'Best for faithful cleanup, correction, and compression', temperature: 0.25, topP: 0.75, maxTokens: 2048 },
  { value: 'balanced', label: 'Balanced optimization', note: 'Best for most prompt optimization tasks', temperature: 0.7, topP: 0.9, maxTokens: 4096 },
  { value: 'creative', label: 'Creative expansion', note: 'Best for copy, creative, and open-ended tasks', temperature: 1, topP: 0.95, maxTokens: 4096 },
  { value: 'longform', label: 'Long-form pro', note: 'Best for complex constraints, long files, and pro mode', temperature: 0.55, topP: 0.85, maxTokens: 6144 },
]

const refinementSuggestions = ['更简洁一点', '强化角色、步骤和验收标准', '改成表格输出', '保留内容但语气更专业']
const refinementSuggestionsEn = ['Make it shorter', 'Strengthen role, steps, and acceptance criteria', 'Convert the output to a table', 'Keep the content but make the tone more professional']

const optimizerCopy = {
  zh: {
    defaultSaveTitle: '优化后的提示词',
    defaultTag: 'AI优化',
    phaseThinking: 'AI 正在分析提示词',
    phaseGenerating: 'AI 正在生成优化结果',
    phaseDone: '优化完成',
    phaseStart: '开始优化',
    draftLoadedEdit: '已载入编辑提示词草稿',
    draftLoadedCreate: '已载入新建提示词草稿',
    draftLoadFailed: '草稿载入失败',
    fileParsingImage: (total: number, images: number) => `正在解析 ${total} 个文件，其中 ${images} 张图片会进入 OCR，可能需要 30-60 秒。`,
    fileParsing: (total: number) => `正在解析 ${total} 个文件。`,
    parsingOcr: '正在进行附件解析和图片 OCR',
    parsingAttachments: '正在解析附件',
    attachmentParseFailed: '附件解析失败',
    parsedWithFailures: (parsed: number, failed: number) => `已解析 ${parsed} 个附件，${failed} 个附件读取失败，仍会保留文件元数据。`,
    parsedStatus: (parsed: number) => `已解析 ${parsed} 个附件`,
    attachmentAdded: '附件已加入上下文',
    attachmentRetry: '附件解析失败，可稍后重试；未解析成功的文件不会阻塞手动输入优化。',
    attachmentPromptFallback: '请根据附件内容生成并优化一个可直接使用的提示词。',
    emptyResult: '优化结果为空，请重试或更换模型',
    optimizedVersion: '优化结果',
    optimizeDone: (seconds: number) => `优化完成，用时 ${seconds}s`,
    optimizeFailed: '优化失败',
    continueFailed: '继续优化失败',
    refinementRoundRewrite: (round?: number) => `第 ${round} 轮重写`,
    refinementRoundOptimize: (round?: number) => `第 ${round} 轮调整`,
    refinementDone: (round?: number) => `已完成第 ${round} 轮调整`,
    copied: '已复制',
    loginToSave: '请先登录后保存提示词',
    saveFailed: '保存失败',
    saved: '已保存',
    updatedOriginal: '已更新原提示词',
    savedToMyPrompts: '已保存到我的提示词',
    rollbackTo: (label: string) => `回滚到 ${label}`,
    rolledBack: (label: string) => `已回滚到 ${label}`,
    title: '提示词优化器',
    subtitle: '一个面向正式优化流程的提示词工作台，支持模型参数控制、附件上下文、多轮追问和本地版本快照。',
    simpleMode: '简洁模式',
    proMode: '专业模式',
    inputPlaceholder: '在这里粘贴你的提示词',
    inputHint: (length: number) => `输入或粘贴提示词后，在下方选择模型并开始优化。当前长度：${length} 字符。`,
    constraintsPlaceholder: '约束条件、输出规范、验收标准',
    proHint: '专业模式会合并提示词、约束条件和附件上下文进行优化。模型与执行入口在下方统一控制。',
    modelExecution: '模型与执行',
    modelExecutionDesc: '选择供应商和模型后，直接对上方输入内容发起优化。',
    modelStatus: '模型状态',
    hideModelStatus: '隐藏模型状态',
    providerAria: '模型提供商',
    modelAria: '模型',
    optimize: '优化',
    optimizeRequirement: '输入至少 2 个字符，或上传可解析文件后即可优化。',
    style: '优化风格',
    outputFormat: '输出格式',
    tone: '语调',
    parsing: '解析中',
    addFiles: '添加并解析文件',
    fileSupport: '支持 txt、md、csv、json、pdf、docx、xlsx 等正文解析；图片会尝试 OCR 提取文字，压缩包先保留元数据。',
    parsed: '已解析',
    parseFailed: '解析失败',
    metadataOnly: '仅元数据',
    remove: (name: string) => `移除 ${name}`,
    advancedParams: '高级模型参数',
    advancedDesc: '默认参数已适合大多数优化任务，需要精调时再展开。',
    collapse: '收起',
    expand: '展开',
    tempDesc: '控制随机性和创造性；越高越发散，越低越稳定。',
    topPDesc: '控制候选词采样范围；越低越保守，越高越开放。',
    maxTokensDesc: '控制最长输出长度；长提示词和专业模式可适当提高。',
    conversation: '对话与结果',
    conversationDesc: '左侧保持原始提示词可见，右侧负责优化、追问和保存。',
    copy: '复制',
    thinking: 'AI 思考过程',
    resultPlaceholder: '优化结果',
    scoring: '评分与对比',
    scoringDesc: '本地规则评分，用于快速判断结构、清晰度和可执行性。',
    original: '原始',
    optimized: '优化后',
    metrics: ['清晰度', '具体度', '结构化', '可执行'],
    originalInput: '原始输入',
    noOriginal: '暂无原始输入',
    optimizedResult: '优化结果',
    showAfterOptimize: '优化完成后显示',
    continueEdit: '继续修改',
    optimizeMode: '引用修改',
    rewriteMode: '重新生成',
    referenced: '已引用上一版提示词',
    referencedEmpty: '优化完成后，这里会引用上一版结果',
    userLabel: '你',
    optimizerLabel: '优化器',
    feedbackPlaceholder: '像聊天一样输入：把上一版改得更短、加上输出示例、改成 JSON、语气更正式...',
    regenerate: '根据要求重新生成',
    sendFeedback: '发送修改要求',
    saveAndVersions: '保存与版本',
    promptTitle: '提示词标题',
    savePrompt: '保存提示词',
    manualSnapshot: '手动快照',
    saveVersion: '保存版本',
    noVersions: '暂无版本',
    untitled: '未命名提示词',
    rollback: '回滚',
  },
  en: {
    defaultSaveTitle: 'Optimized Prompt',
    defaultTag: 'AI Optimization',
    phaseThinking: 'AI is analyzing the prompt',
    phaseGenerating: 'AI is generating the optimized result',
    phaseDone: 'Optimization complete',
    phaseStart: 'Start optimization',
    draftLoadedEdit: 'Loaded the prompt draft for editing',
    draftLoadedCreate: 'Loaded the new prompt draft',
    draftLoadFailed: 'Could not load draft',
    fileParsingImage: (total: number, images: number) => `Parsing ${total} files. ${images} image(s) will run OCR and may take 30-60 seconds.`,
    fileParsing: (total: number) => `Parsing ${total} files.`,
    parsingOcr: 'Parsing attachments and running image OCR',
    parsingAttachments: 'Parsing attachments',
    attachmentParseFailed: 'Attachment parsing failed',
    parsedWithFailures: (parsed: number, failed: number) => `Parsed ${parsed} attachment(s). ${failed} failed to read, but metadata is still kept.`,
    parsedStatus: (parsed: number) => `Parsed ${parsed} attachment(s)`,
    attachmentAdded: 'Attachment added to context',
    attachmentRetry: 'Attachment parsing failed. Try again later; failed files will not block manual optimization.',
    attachmentPromptFallback: 'Generate and optimize a ready-to-use prompt based on the attachment content.',
    emptyResult: 'The optimization result was empty. Try again or switch models.',
    optimizedVersion: 'Optimized result',
    optimizeDone: (seconds: number) => `Optimization completed in ${seconds}s`,
    optimizeFailed: 'Optimization failed',
    continueFailed: 'Follow-up optimization failed',
    refinementRoundRewrite: (round?: number) => `Round ${round} rewrite`,
    refinementRoundOptimize: (round?: number) => `Round ${round} revision`,
    refinementDone: (round?: number) => `Completed round ${round} revision`,
    copied: 'Copied',
    loginToSave: 'Log in before saving prompts.',
    saveFailed: 'Save failed',
    saved: 'Saved',
    updatedOriginal: 'Original prompt updated',
    savedToMyPrompts: 'Saved to My Prompts',
    rollbackTo: (label: string) => `Rolled back to ${label}`,
    rolledBack: (label: string) => `Restored ${label}`,
    title: 'Prompt Optimizer',
    subtitle: 'A professional prompt workbench with model parameters, attachment context, multi-turn refinement, and local version snapshots.',
    simpleMode: 'Simple mode',
    proMode: 'Pro mode',
    inputPlaceholder: 'Paste your prompt here',
    inputHint: (length: number) => `Paste a prompt, choose a model below, and start optimizing. Current length: ${length} characters.`,
    constraintsPlaceholder: 'Constraints, output rules, acceptance criteria',
    proHint: 'Pro mode combines the prompt, constraints, and attachment context. Model selection and execution are controlled below.',
    modelExecution: 'Model & execution',
    modelExecutionDesc: 'Choose a provider and model, then optimize the input above.',
    modelStatus: 'Model status',
    hideModelStatus: 'Hide model status',
    providerAria: 'Model provider',
    modelAria: 'Model',
    optimize: 'Optimize',
    optimizeRequirement: 'Enter at least 2 characters or upload a parseable file to start.',
    style: 'Optimization style',
    outputFormat: 'Output format',
    tone: 'Tone',
    parsing: 'Parsing',
    addFiles: 'Add and parse files',
    fileSupport: 'Supports text extraction from txt, md, csv, json, pdf, docx, and xlsx. Images use OCR when possible; archives keep metadata only.',
    parsed: 'Parsed',
    parseFailed: 'Failed',
    metadataOnly: 'Metadata only',
    remove: (name: string) => `Remove ${name}`,
    advancedParams: 'Advanced model parameters',
    advancedDesc: 'Defaults work for most optimization tasks. Expand only when you need fine tuning.',
    collapse: 'Collapse',
    expand: 'Expand',
    tempDesc: 'Controls randomness and creativity. Higher is more divergent; lower is more stable.',
    topPDesc: 'Controls the sampling pool. Lower is more conservative; higher is more open.',
    maxTokensDesc: 'Controls maximum output length. Raise it for long prompts and pro mode.',
    conversation: 'Conversation & result',
    conversationDesc: 'Keep the original prompt visible on the left while refining, comparing, and saving on the right.',
    copy: 'Copy',
    thinking: 'AI reasoning',
    resultPlaceholder: 'Optimized result',
    scoring: 'Score & comparison',
    scoringDesc: 'Local rule-based scoring for a quick read on structure, clarity, and actionability.',
    original: 'Original',
    optimized: 'Optimized',
    metrics: ['Clarity', 'Specificity', 'Structure', 'Actionability'],
    originalInput: 'Original input',
    noOriginal: 'No original input yet',
    optimizedResult: 'Optimized result',
    showAfterOptimize: 'Shown after optimization',
    continueEdit: 'Continue refining',
    optimizeMode: 'Revise previous',
    rewriteMode: 'Regenerate',
    referenced: 'Previous version referenced',
    referencedEmpty: 'After optimization, the previous result will appear here.',
    userLabel: 'You',
    optimizerLabel: 'Optimizer',
    feedbackPlaceholder: 'Chat naturally: make it shorter, add output examples, convert it to JSON, make the tone more formal...',
    regenerate: 'Regenerate with request',
    sendFeedback: 'Send refinement request',
    saveAndVersions: 'Save & versions',
    promptTitle: 'Prompt title',
    savePrompt: 'Save prompt',
    manualSnapshot: 'Manual snapshot',
    saveVersion: 'Save version',
    noVersions: 'No versions yet',
    untitled: 'Untitled prompt',
    rollback: 'Restore',
  },
}

const findLabel = (choices: Choice[], value: string) => choices.find(choice => choice.value === value)?.label || value

const readableFileSize = (size: number) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

const scorePrompt = (content: string) => {
  const text = content.trim()
  if (!text) return { total: 0, clarity: 0, specificity: 0, structure: 0, actionability: 0 }

  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  const bulletCount = lines.filter(line => /^[-*\d.、]/.test(line)).length
  const sectionCount = lines.filter(line => /^#{1,4}\s|[:：]$/.test(line)).length
  const constraintHits = ['角色', '目标', '背景', '步骤', '输出', '格式', '约束', '验收', '示例', '不要'].filter(keyword => text.includes(keyword)).length
  const lengthScore = Math.min(text.length / 12, 55)

  return {
    clarity: clampScore(35 + Math.min(lines.length * 5, 30) + Math.min(sectionCount * 10, 25)),
    specificity: clampScore(25 + lengthScore + constraintHits * 5),
    structure: clampScore(30 + Math.min(bulletCount * 8, 35) + Math.min(sectionCount * 12, 35)),
    actionability: clampScore(35 + constraintHits * 8 + (text.includes('输出') ? 12 : 0) + (text.includes('示例') ? 10 : 0)),
    total: 0,
  }
}

const getPromptScore = (content: string) => {
  const score = scorePrompt(content)
  return {
    ...score,
    total: clampScore((score.clarity + score.specificity + score.structure + score.actionability) / 4),
  }
}

function OptionDropdown({ label, value, options, onChange }: {
  label: string
  value: string
  options: Choice[]
  onChange: (value: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-12 justify-between rounded-[8px] border-gray-300 bg-white px-4 text-left shadow-sm hover:border-gray-950 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-200"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-gray-950 dark:text-gray-50">{label}</span>
            <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{findLabel(options, value)}</span>
          </span>
          <ChevronDown className="ml-3 h-4 w-4 text-gray-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 rounded-[8px] p-2">
        {options.map(option => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
            className="items-start rounded-[6px] px-3 py-2"
          >
            <span className="mt-0.5 flex h-4 w-4 items-center justify-center">
              {value === option.value && <Check className="h-4 w-4 text-teal-600" />}
            </span>
            <span>
              <span className="block text-sm font-medium">{option.label}</span>
              {option.note && <span className="block text-xs text-gray-500 dark:text-gray-400">{option.note}</span>}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ParameterControl({ label, value, min, max, step, description, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  description: string
  onChange: (value: number) => void
}) {
  return (
    <div className="rounded-[8px] border border-gray-200 bg-white p-4 dark:border-teal-900/60 dark:bg-[#0f1b18]">
      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_104px] sm:items-start">
        <div className="min-w-0">
          <Label className="text-sm font-semibold text-gray-950 dark:text-gray-50">{label}</Label>
          <p className="mt-1 max-w-[32ch] text-xs leading-5 text-gray-500 dark:text-teal-100/70">{description}</p>
        </div>
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={event => onChange(Number(event.target.value))}
          className="h-9 w-full min-w-[96px] rounded-[6px] text-right font-medium tabular-nums dark:border-teal-800 dark:bg-[#07110f] dark:text-teal-50"
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        className="w-full accent-teal-600 dark:accent-teal-400"
      />
    </div>
  )
}

export default function PromptOptimizerV2() {
  const { user } = useAuth()
  const { visualStyle } = useUISettings()
  const [locale, setLocale] = useState<Locale>('zh')
  const copy = optimizerCopy[locale]
  const localizedStyleOptions = locale === 'en' ? styleOptionsEn : styleOptions
  const localizedToneOptions = locale === 'en' ? toneOptionsEn : toneOptions
  const localizedFormatOptions = locale === 'en' ? formatOptionsEn : formatOptions
  const localizedParameterPresets = locale === 'en' ? parameterPresetsEn : parameterPresets
  const localizedRefinementSuggestions = locale === 'en' ? refinementSuggestionsEn : refinementSuggestions
  const [mode, setMode] = useState<PromptOptimizerMode>('simple')
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState('structured')
  const [tone, setTone] = useState('professional')
  const [outputFormat, setOutputFormat] = useState('markdown')
  const [constraints, setConstraints] = useState('')
  const [provider, setProvider] = useState(DEFAULT_PUBLIC_AI_PROVIDER)
  const [model, setModel] = useState(DEFAULT_PUBLIC_AI_MODEL)
  const [temperature, setTemperature] = useState(0.7)
  const [topP, setTopP] = useState(0.9)
  const [maxTokens, setMaxTokens] = useState(4096)
  const [attachments, setAttachments] = useState<PromptAttachmentDraft[]>([])
  const [optimizedPrompt, setOptimizedPrompt] = useState('')
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([])
  const [feedback, setFeedback] = useState('')
  const [refinementMode, setRefinementMode] = useState<'optimize' | 'rewrite'>('optimize')
  const [parameterPreset, setParameterPreset] = useState<ParameterPresetId>('balanced')
  const [saveTitle, setSaveTitle] = useState(copy.defaultSaveTitle)
  const [draftSource, setDraftSource] = useState<OptimizerSource>('direct')
  const [draftPromptId, setDraftPromptId] = useState<number | null>(null)
  const [draftTags, setDraftTags] = useState<string[]>([copy.defaultTag])
  const [versions, setVersions] = useState<VersionSnapshot[]>([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [thinkingContent, setThinkingContent] = useState('')
  const [showThinking, setShowThinking] = useState(true)
  const [streamingPhase, setStreamingPhase] = useState<'idle' | 'thinking' | 'generating' | 'done'>('idle')
  const [optimizing, setOptimizing] = useState(false)
  const [refining, setRefining] = useState(false)
  const [saving, setSaving] = useState(false)
  const [parsingFiles, setParsingFiles] = useState(false)
  const [parseProgress, setParseProgress] = useState('')
  const [showAdvancedParams, setShowAdvancedParams] = useState(false)
  const [showModelDiagnostics, setShowModelDiagnostics] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLocale(detectLocaleFromSearch())
  }, [])

  useEffect(() => {
    setSaveTitle(currentTitle => {
      if (currentTitle === optimizerCopy.zh.defaultSaveTitle || currentTitle === optimizerCopy.en.defaultSaveTitle) {
        return copy.defaultSaveTitle
      }
      return currentTitle
    })
    setDraftTags(currentTags => {
      const defaultTags = [optimizerCopy.zh.defaultTag, optimizerCopy.en.defaultTag]
      if (currentTags.length === 1 && defaultTags.includes(currentTags[0])) {
        return [copy.defaultTag]
      }
      return currentTags
    })
  }, [copy.defaultSaveTitle, copy.defaultTag])

  const visualClasses = visualStyleClasses[visualStyle]
  const providerOptions = useMemo(
    () => getAvailableAIProviders().map(option => ({ value: option.key, label: option.name })),
    []
  )
  const selectedModels = useMemo(
    () => getAIProviderModels(provider).map(option => ({ value: option.key, label: option.name })),
    [provider]
  )
  const hasParsedAttachment = attachments.some(attachment => attachment.parseStatus === 'parsed' && attachment.textPreview?.trim())
  const canOptimize = (prompt.trim().length >= 2 || hasParsedAttachment) && !optimizing && !parsingFiles
  const canRefine = optimizedPrompt.trim().length > 0 && feedback.trim().length >= 2 && !refining
  const optimizeButtonClass = 'bg-[#1f1a14] text-[#fffaf0] shadow-[0_10px_28px_rgba(31,26,20,0.28)] hover:bg-[#3b3329] dark:bg-[#f4efe7] dark:text-[#171410] dark:hover:bg-white disabled:opacity-100 disabled:bg-[#8b8173] disabled:text-white disabled:shadow-none dark:disabled:bg-[#5a5147] dark:disabled:text-[#d9d0c2]'
  const phaseLabel = streamingPhase === 'thinking'
    ? copy.phaseThinking
    : streamingPhase === 'generating'
      ? copy.phaseGenerating
      : streamingPhase === 'done'
        ? copy.phaseDone
        : copy.phaseStart
  const originalComparisonText = useMemo(() => {
    const attachmentText = attachments
      .filter(attachment => attachment.parseStatus === 'parsed' && attachment.textPreview)
      .map(attachment => `${attachment.name}\n${attachment.textPreview}`)
      .join('\n\n')

    return [prompt.trim(), attachmentText].filter(Boolean).join('\n\n')
  }, [attachments, prompt])
  const scoreComparison = useMemo(() => {
    const originalScore = getPromptScore(originalComparisonText)
    const optimizedScore = getPromptScore(optimizedPrompt)
    return {
      original: originalScore,
      optimized: optimizedScore,
      delta: optimizedScore.total - originalScore.total,
    }
  }, [optimizedPrompt, originalComparisonText])

  const applyParameterPreset = (presetId: ParameterPresetId) => {
    const preset = localizedParameterPresets.find(item => item.value === presetId)
    if (!preset) return
    setParameterPreset(presetId)
    setTemperature(preset.temperature)
    setTopP(preset.topP)
    setMaxTokens(preset.maxTokens)
  }

  useEffect(() => {
    const rawDraft = window.sessionStorage.getItem('note-prompt-optimizer-draft')
    if (!rawDraft) return

    try {
      const draft = JSON.parse(rawDraft) as OptimizerDraft
      if (draft.prompt) setPrompt(draft.prompt)
      if (draft.title) setSaveTitle(draft.title)
      if (draft.mode === 'simple' || draft.mode === 'pro') setMode(draft.mode)
      if (draft.source === 'edit') setDraftSource('edit')
      else if (draft.source === 'create' || draft.source === 'create-prompt') setDraftSource('create')
      else if (draft.source === 'upload') setDraftSource('upload')
      if (typeof draft.promptId === 'number') setDraftPromptId(draft.promptId)
      if (Array.isArray(draft.tags) && draft.tags.length > 0) setDraftTags(draft.tags)
      showStatus(draft.source === 'edit' ? copy.draftLoadedEdit : copy.draftLoadedCreate)
    } catch {
      setError(copy.draftLoadFailed)
    } finally {
      window.sessionStorage.removeItem('note-prompt-optimizer-draft')
    }
  }, [])

  const showStatus = (message: string) => {
    setStatus(message)
    window.setTimeout(() => setStatus(''), 2500)
  }

  const addVersion = (
    content: string,
    label: string,
    snapshot?: Partial<Pick<VersionSnapshot, 'title' | 'thinkingContent' | 'conversationHistory'>>
  ) => {
    if (!content.trim()) return
    setVersions(current => [
      {
        id: crypto.randomUUID(),
        label,
        title: snapshot?.title || saveTitle,
        content,
        thinkingContent: snapshot?.thinkingContent ?? thinkingContent,
        conversationHistory: snapshot?.conversationHistory ?? conversationHistory,
        createdAt: new Date().toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false }),
      },
      ...current,
    ].slice(0, 12))
  }

  const recordVersionSnapshot = (version: Omit<VersionSnapshot, 'id' | 'createdAt'>) => {
    if (!version.content.trim()) return
    setVersions(current => [
      {
        ...version,
        id: crypto.randomUUID(),
        createdAt: new Date().toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false }),
      },
      ...current,
    ].slice(0, 12))
  }

  const restoreVersion = (version: VersionSnapshot) => {
    setSaveTitle(version.title || copy.defaultSaveTitle)
    setOptimizedPrompt(version.content)
    setThinkingContent(version.thinkingContent || '')
    setConversationHistory(version.conversationHistory || [])
    setFeedback('')
    setStreamingPhase('done')
    recordVersionSnapshot({
      label: copy.rollbackTo(version.label),
      title: version.title || copy.defaultSaveTitle,
      content: version.content,
      thinkingContent: version.thinkingContent || '',
      conversationHistory: version.conversationHistory || [],
    })
    showStatus(copy.rolledBack(version.label))
  }

  const recordAIOptimizeUsage = () => {
    if (!user) return
    void api.user.incrementAIUsage('ai_optimize').catch(() => undefined)
  }

  const handleProviderChange = (value: string) => {
    setProvider(value)
    setModel(getDefaultAIModel(value))
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    setError('')
    setParsingFiles(true)
    const imageCount = files.filter(file => file.type.startsWith('image/')).length
    setParseProgress(imageCount > 0 ? copy.fileParsingImage(files.length, imageCount) : copy.fileParsing(files.length))
    setStatus(imageCount > 0 ? copy.parsingOcr : copy.parsingAttachments)
    try {
      const response = await api.attachments.parse(files)
      if (!response.success || !response.data) {
        setError(response.error || copy.attachmentParseFailed)
        return
      }

      const parsedAttachments = response.data.attachments
      setAttachments(current => [...current, ...parsedAttachments].slice(0, 12))
      const parsedCount = parsedAttachments.filter(attachment => attachment.parseStatus === 'parsed').length
      const failedCount = parsedAttachments.filter(attachment => attachment.parseStatus === 'failed').length
      setParseProgress(failedCount > 0 ? copy.parsedWithFailures(parsedCount, failedCount) : '')
      showStatus(parsedCount > 0 ? copy.parsedStatus(parsedCount) : copy.attachmentAdded)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : copy.attachmentParseFailed)
      setParseProgress(copy.attachmentRetry)
    } finally {
      setParsingFiles(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments(current => current.filter(attachment => attachment.id !== id))
  }

  const handleOptimize = async () => {
    if (!canOptimize) return

    setOptimizing(true)
    setError('')
    setStatus('')
    setThinkingContent('')
    setOptimizedPrompt('')
    setStreamingPhase('idle')

    try {
      await optimizePromptStream(
        {
          prompt: prompt.trim() || copy.attachmentPromptFallback,
          provider,
          model,
          mode,
          style,
          tone,
          outputFormat,
          temperature,
          topP,
          maxTokens,
          constraints: constraints
            .split('\n')
            .map(item => item.trim())
            .filter(Boolean),
          attachments,
        },
        {
          onThinking: chunk => {
            setStreamingPhase('thinking')
            setThinkingContent(current => current + chunk)
          },
          onContent: chunk => {
            setStreamingPhase('generating')
            setOptimizedPrompt(current => current + chunk)
          },
          onDone: result => {
            if (!result?.optimized) {
              setStreamingPhase('idle')
              setError(copy.emptyResult)
              return
            }

            setStreamingPhase('done')
            setOptimizedPrompt(result.optimized)
            if (result.title) setSaveTitle(result.title)
            if (result.thinking && !thinkingContent) setThinkingContent(result.thinking)
            const nextTitle = result.title || saveTitle
            const nextThinking = result.thinking || thinkingContent
            const nextHistory: ConversationMessage[] = [{ role: 'assistant', content: result.optimized }]
            setConversationHistory(nextHistory)
            addVersion(result.optimized, copy.optimizedVersion, {
              title: nextTitle,
              thinkingContent: nextThinking,
              conversationHistory: nextHistory,
            })
            recordAIOptimizeUsage()
            showStatus(copy.optimizeDone(result.processing_time))
          },
          onError: message => {
            setStreamingPhase('idle')
            setError(message || copy.optimizeFailed)
          },
        }
      )
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : copy.optimizeFailed)
    } finally {
      setOptimizing(false)
    }
  }

  const handleRefine = async () => {
    if (!canRefine) return

    setRefining(true)
    setError('')
    setStatus('')

    try {
      const response = await api.ai.optimizePromptMultiTurn({
        originalPrompt: prompt,
        currentPrompt: optimizedPrompt,
        userFeedback: feedback.trim(),
        conversationHistory,
        optimizationMode: refinementMode,
        provider,
        model,
        temperature,
        topP,
        maxTokens,
      })

      if (!response.success || !response.optimizedPrompt) {
        setError(response.error || copy.continueFailed)
        return
      }

      setOptimizedPrompt(response.optimizedPrompt)
      const nextTitle = response.title || saveTitle
      if (response.title) setSaveTitle(response.title)
      let nextThinkingContent = thinkingContent
      if (response.thinking) {
        const refinementThinking = response.thinking
        const roundLabel = locale === 'en' ? `Round ${response.round}` : `第 ${response.round} 轮`
        nextThinkingContent = thinkingContent ? `${thinkingContent}\n\n${roundLabel}: ${refinementThinking}` : refinementThinking
        setThinkingContent(nextThinkingContent)
      }
      setConversationHistory(response.conversationHistory)
      setFeedback('')
      addVersion(response.optimizedPrompt, refinementMode === 'rewrite' ? copy.refinementRoundRewrite(response.round) : copy.refinementRoundOptimize(response.round), {
        title: nextTitle,
        thinkingContent: nextThinkingContent,
        conversationHistory: response.conversationHistory,
      })
      recordAIOptimizeUsage()
      showStatus(copy.refinementDone(response.round))
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : copy.continueFailed)
    } finally {
      setRefining(false)
    }
  }

  const handleCopy = async () => {
    if (!optimizedPrompt) return
    await navigator.clipboard.writeText(optimizedPrompt)
    showStatus(copy.copied)
  }

  const handleSavePrompt = async () => {
    if (!optimizedPrompt.trim()) return
    if (!user) {
      setError(copy.loginToSave)
      return
    }

    setSaving(true)
    setError('')
    try {
      const payload = {
        title: saveTitle.trim() || copy.defaultSaveTitle,
        content: optimizedPrompt,
        tags: draftTags.length > 0 ? draftTags : [copy.defaultTag],
        mode: mode === 'simple' ? 'normal' : 'professional',
        is_public: false,
      }
      const response = draftSource === 'edit' && draftPromptId
        ? await api.prompts.update(draftPromptId, payload)
        : await api.prompts.create(payload)

      if (!response.success) {
        setError(response.error || copy.saveFailed)
        return
      }

      addVersion(optimizedPrompt, copy.saved)
      showStatus(draftSource === 'edit' ? copy.updatedOriginal : copy.savedToMyPrompts)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : copy.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main suppressHydrationWarning className={`relative overflow-hidden ${visualClasses.page}`}>
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-gray-950 dark:text-gray-50 md:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
            {copy.subtitle}
          </p>
        </div>

        <div className="mb-5">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowModelDiagnostics(current => !current)}
            className="rounded-[8px] border-[#ded6c8] bg-[#fbfaf7] dark:border-[#3a342c] dark:bg-[#1d1a16]"
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            {showModelDiagnostics ? copy.hideModelStatus : copy.modelStatus}
          </Button>
          {showModelDiagnostics && (
            <div className="mt-3">
              <ModelDiagnosticsPanel locale={locale} />
            </div>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch">
          <div className="flex min-h-full flex-col gap-5 lg:sticky lg:top-4 lg:self-start">
            <Card className={`rounded-[8px] ${visualClasses.card}`}>
              <CardContent className="space-y-5 p-5">
                <Tabs value={mode} onValueChange={value => setMode(value as PromptOptimizerMode)}>
                  <TabsList className="grid h-11 w-full grid-cols-2 rounded-[8px] bg-gray-100 p-1 dark:bg-gray-800">
                    <TabsTrigger value="simple" className="rounded-[6px]">{copy.simpleMode}</TabsTrigger>
                    <TabsTrigger value="pro" className="rounded-[6px]">{copy.proMode}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="simple" className="space-y-4 pt-4">
                    <Textarea
                      value={prompt}
                      onChange={event => setPrompt(event.target.value)}
                      placeholder={copy.inputPlaceholder}
                      className={`min-h-[320px] resize-y rounded-[8px] text-base leading-7 shadow-inner ${visualClasses.editor}`}
                    />
                    <div className="rounded-[8px] border border-[#ded6c8] bg-[#f6f1e9] p-3 dark:border-[#3a342c] dark:bg-[#171410]">
                      <p className="text-sm text-[#6b5f51] dark:text-[#c9bda9]">
                        {copy.inputHint(prompt.trim().length)}
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="pro" className="space-y-4 pt-4">
                    <Textarea
                      value={prompt}
                      onChange={event => setPrompt(event.target.value)}
                      placeholder={copy.inputPlaceholder}
                      className={`min-h-[240px] resize-y rounded-[8px] text-base leading-7 shadow-inner ${visualClasses.editor}`}
                    />
                    <Textarea
                      value={constraints}
                      onChange={event => setConstraints(event.target.value)}
                      placeholder={copy.constraintsPlaceholder}
                      className="min-h-[120px] resize-y rounded-[8px] border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-950"
                    />
                    <div className="rounded-[8px] border border-[#ded6c8] bg-[#f6f1e9] p-3 dark:border-[#3a342c] dark:bg-[#171410]">
                      <p className="text-sm text-[#6b5f51] dark:text-[#c9bda9]">
                        {copy.proHint}
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="rounded-[8px] border border-teal-200 bg-teal-50/60 p-4 shadow-sm dark:border-teal-900/70 dark:bg-teal-950/20">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-teal-600 text-white dark:bg-teal-400 dark:text-[#171410]">
                        <Sparkles className="h-4 w-4" />
                      </span>
                      <div>
                        <h2 className="text-sm font-semibold text-gray-950 dark:text-gray-50">{copy.modelExecution}</h2>
                        <p className="text-xs text-gray-600 dark:text-gray-300">{copy.modelExecutionDesc}</p>
                      </div>
                    </div>
                    {optimizing && <span className="h-2 w-2 shrink-0 rounded-full bg-teal-500 animate-pulse" />}
                  </div>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_144px] md:items-center">
                    <Select value={provider} onValueChange={handleProviderChange}>
                      <SelectTrigger aria-label={copy.providerAria} className="h-11 rounded-[8px] bg-[#fffdf8] dark:bg-[#171410]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {providerOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger aria-label={copy.modelAria} className="h-11 rounded-[8px] bg-[#fffdf8] dark:bg-[#171410]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedModels.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" onClick={handleOptimize} disabled={!canOptimize} className={`h-11 rounded-[8px] text-base font-semibold ${optimizeButtonClass}`}>
                      {optimizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      {optimizing ? phaseLabel : copy.optimize}
                    </Button>
                  </div>
                  {!canOptimize && !optimizing && !parsingFiles && (
                    <p className="mt-2 text-xs font-medium text-[#6b5f51] dark:text-[#c9bda9]">{copy.optimizeRequirement}</p>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <OptionDropdown label={copy.style} value={style} options={localizedStyleOptions} onChange={setStyle} />
                  <OptionDropdown label={copy.outputFormat} value={outputFormat} options={localizedFormatOptions} onChange={setOutputFormat} />
                  <OptionDropdown label={copy.tone} value={tone} options={localizedToneOptions} onChange={setTone} />
                </div>

                <div className={`rounded-[8px] border border-dashed p-4 ${visualClasses.softPanel}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="rounded-[8px]">
                      {parsingFiles ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus className="mr-2 h-4 w-4" />}
                      {parsingFiles ? copy.parsing : copy.addFiles}
                    </Button>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{copy.fileSupport}</span>
                  </div>
                  {(parsingFiles || parseProgress) && (
                    <div className="mt-3 rounded-[8px] border border-teal-200 bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-800 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-200">
                      {parsingFiles && <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />}
                      {parseProgress}
                    </div>
                  )}

                  {attachments.length > 0 && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {attachments.map(attachment => (
                        <div key={attachment.id} className="flex min-w-0 items-center justify-between gap-3 rounded-[8px] border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-950 dark:text-gray-50">{attachment.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {attachment.type} · {readableFileSize(attachment.size)} · {attachment.parseStatus === 'parsed' ? copy.parsed : attachment.parseStatus === 'failed' ? copy.parseFailed : copy.metadataOnly}
                            </p>
                            {attachment.parseStatus === 'failed' && attachment.error && (
                              <p className="mt-1 line-clamp-2 text-xs text-amber-700 dark:text-amber-300">{attachment.error}</p>
                            )}
                          </div>
                          <button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={copy.remove(attachment.name)} className="rounded-[6px] p-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                {status && <p className="text-sm text-teal-700 dark:text-teal-300">{status}</p>}
              </CardContent>
            </Card>

            <Card className={`rounded-[8px] ${visualClasses.card}`}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                    <div>
                      <h2 className="text-base font-semibold text-gray-950 dark:text-gray-50">{copy.advancedParams}</h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{copy.advancedDesc}</p>
                    </div>
                  </div>
                  <Button type="button" variant="outline" onClick={() => setShowAdvancedParams(current => !current)} className="rounded-[8px]">
                    {showAdvancedParams ? copy.collapse : copy.expand}
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {localizedParameterPresets.map(preset => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => applyParameterPreset(preset.value)}
                      className={`rounded-[8px] border px-3 py-2 text-left transition ${parameterPreset === preset.value ? 'border-teal-700 bg-teal-700 text-white shadow-sm shadow-teal-900/10 dark:border-teal-400 dark:bg-teal-400 dark:text-[#06110f]' : 'border-gray-200 bg-white text-gray-800 hover:border-teal-700 dark:border-teal-900/60 dark:bg-[#0f1b18] dark:text-teal-50 dark:hover:border-teal-400'}`}
                    >
                      <span className="block text-sm font-semibold">{preset.label}</span>
                      <span className="mt-1 block text-xs opacity-75">{preset.note}</span>
                    </button>
                  ))}
                </div>
                {showAdvancedParams && (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <ParameterControl
                      label="Temperature"
                      value={temperature}
                      min={0}
                      max={2}
                      step={0.1}
                      description={copy.tempDesc}
                      onChange={setTemperature}
                    />
                    <ParameterControl
                      label="Top P"
                      value={topP}
                      min={0.1}
                      max={1}
                      step={0.05}
                      description={copy.topPDesc}
                      onChange={setTopP}
                    />
                    <ParameterControl
                      label="Max Tokens"
                      value={maxTokens}
                      min={512}
                      max={8192}
                      step={256}
                      description={copy.maxTokensDesc}
                      onChange={setMaxTokens}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex min-h-full flex-col gap-5 lg:sticky lg:top-4 lg:self-start">
            <Card className={`rounded-[8px] ${visualClasses.card}`}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                    <div>
                      <h2 className="text-base font-semibold text-gray-950 dark:text-gray-50">{copy.conversation}</h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{copy.conversationDesc}</p>
                    </div>
                    {optimizing && <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />}
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={handleCopy} disabled={!optimizedPrompt} className="rounded-[8px]">
                    <Copy className="mr-2 h-4 w-4" />
                    {copy.copy}
                  </Button>
                </div>
                {thinkingContent && (
                  <div className="rounded-[8px] border border-teal-200 bg-teal-50/60 dark:border-teal-900 dark:bg-teal-950/20">
                    <button
                      type="button"
                      onClick={() => setShowThinking(current => !current)}
                      className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-teal-800 dark:text-teal-200"
                    >
                      <span className="flex items-center gap-2">
                        <Brain className="h-4 w-4" />
                        {copy.thinking}
                      </span>
                      {showThinking ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {showThinking && (
                      <div className="max-h-[180px] overflow-y-auto px-3 pb-3 text-sm leading-6 whitespace-pre-wrap text-teal-700 dark:text-teal-300">
                        {thinkingContent}
                      </div>
                    )}
                  </div>
                )}
                <Textarea
                  value={optimizedPrompt}
                  onChange={event => setOptimizedPrompt(event.target.value)}
                  placeholder={optimizing ? phaseLabel : copy.resultPlaceholder}
                  className={`min-h-[320px] resize-y rounded-[8px] font-mono text-sm leading-6 ${visualClasses.editor}`}
                />
                {(originalComparisonText || optimizedPrompt) && (
                  <div className="space-y-3 rounded-[8px] border border-[#ded6c8] bg-[#fbfaf7] p-3 dark:border-[#3a342c] dark:bg-[#171410]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-50">{copy.scoring}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{copy.scoringDesc}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <span className="rounded-[6px] bg-white px-2 py-1 text-gray-700 dark:bg-gray-900 dark:text-gray-300">{copy.original} {scoreComparison.original.total}</span>
                        <span className="rounded-[6px] bg-[#1f1a14] px-2 py-1 text-[#fffaf0] dark:bg-[#f4efe7] dark:text-[#171410]">{copy.optimized} {scoreComparison.optimized.total}</span>
                        {optimizedPrompt && <span className="rounded-[6px] bg-teal-50 px-2 py-1 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300">{scoreComparison.delta >= 0 ? '+' : ''}{scoreComparison.delta}</span>}
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4">
                      {([
                        [copy.metrics[0], scoreComparison.optimized.clarity],
                        [copy.metrics[1], scoreComparison.optimized.specificity],
                        [copy.metrics[2], scoreComparison.optimized.structure],
                        [copy.metrics[3], scoreComparison.optimized.actionability],
                      ] as const).map(([label, value]) => (
                        <div key={label} className="rounded-[8px] border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
                          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                          <p className="mt-1 text-lg font-semibold text-gray-950 dark:text-gray-50">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-[8px] border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                        <p className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">{copy.originalInput}</p>
                        <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-gray-700 dark:text-gray-300">{originalComparisonText || copy.noOriginal}</p>
                      </div>
                      <div className="rounded-[8px] border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                        <p className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">{copy.optimizedResult}</p>
                        <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-gray-700 dark:text-gray-300">{optimizedPrompt || copy.showAfterOptimize}</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-3 rounded-[8px] border border-[#ded6c8] bg-[#fbfaf7] p-3 dark:border-[#3a342c] dark:bg-[#171410]">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="optimizer-feedback" className="text-sm font-semibold">{copy.continueEdit}</Label>
                    <div className="grid grid-cols-2 rounded-[8px] bg-[#eee6d8] p-1 dark:bg-[#2a241d]">
                      {(['optimize', 'rewrite'] as const).map(item => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setRefinementMode(item)}
                          className={`rounded-[6px] px-3 py-1 text-xs font-medium ${refinementMode === item ? 'bg-white text-[#1f1a14] shadow-sm dark:bg-[#f4efe7]' : 'text-[#6b5f51] dark:text-[#c9bda9]'}`}
                        >
                          {item === 'optimize' ? copy.optimizeMode : copy.rewriteMode}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[8px] border-l-4 border-[#1f1a14] bg-white px-3 py-2 dark:border-[#f4efe7] dark:bg-gray-900">
                    <p className="text-xs font-semibold text-[#6b5f51] dark:text-[#c9bda9]">{copy.referenced}</p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-gray-600 dark:text-gray-400">
                      {optimizedPrompt || copy.referencedEmpty}
                    </p>
                  </div>
                  {conversationHistory.length > 1 && (
                    <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                      {conversationHistory.slice(-6).map((message, index) => (
                        <div key={`${message.role}-${index}`} className={`rounded-[8px] px-3 py-2 text-xs leading-5 ${message.role === 'user' ? 'ml-8 bg-[#1f1a14] text-[#fffaf0] dark:bg-[#f4efe7] dark:text-[#171410]' : 'mr-8 bg-white text-gray-700 dark:bg-gray-900 dark:text-gray-300'}`}>
                          <span className="mb-1 block font-semibold">{message.role === 'user' ? copy.userLabel : copy.optimizerLabel}</span>
                          <span className="line-clamp-4 whitespace-pre-wrap">{message.content}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {localizedRefinementSuggestions.map(suggestion => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setFeedback(suggestion)}
                        disabled={!optimizedPrompt}
                        className="rounded-[6px] border border-[#ded6c8] bg-white px-2.5 py-1 text-xs text-[#5f5548] hover:border-[#1f1a14] disabled:opacity-50 dark:border-[#3a342c] dark:bg-gray-900 dark:text-[#c9bda9]"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                  <Textarea
                    id="optimizer-feedback"
                    value={feedback}
                    onChange={event => setFeedback(event.target.value)}
                    placeholder={copy.feedbackPlaceholder}
                    className="min-h-[96px] resize-y rounded-[8px] border-[#ded6c8] bg-white dark:border-[#3a342c] dark:bg-gray-900"
                    disabled={!optimizedPrompt}
                  />
                  <Button type="button" onClick={handleRefine} disabled={!canRefine} className={`w-full rounded-[8px] ${optimizeButtonClass}`}>
                    {refining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-2 h-4 w-4" />}
                    {refinementMode === 'rewrite' ? copy.regenerate : copy.sendFeedback}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className={`rounded-[8px] ${visualClasses.card}`}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-2">
                  <Save className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                  <h2 className="text-base font-semibold text-gray-950 dark:text-gray-50">{copy.saveAndVersions}</h2>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="save-title">{copy.promptTitle}</Label>
                  <Input id="save-title" value={saveTitle} onChange={event => setSaveTitle(event.target.value)} className="rounded-[8px]" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" onClick={handleSavePrompt} disabled={!optimizedPrompt || saving} className={`rounded-[8px] ${optimizeButtonClass}`}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {copy.savePrompt}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => addVersion(optimizedPrompt, copy.manualSnapshot)} disabled={!optimizedPrompt} className="rounded-[8px]">
                    <History className="mr-2 h-4 w-4" />
                    {copy.saveVersion}
                  </Button>
                </div>
                <div className="space-y-2">
                  {versions.length === 0 ? (
                    <div className="rounded-[8px] border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">{copy.noVersions}</div>
                  ) : (
                    versions.map((version, index) => (
                      <div key={version.id} className={`rounded-[8px] border p-3 ${visualClasses.softPanel}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-950 dark:text-gray-50">v{versions.length - index} · {version.label}</p>
                            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{version.createdAt} · {version.title || copy.untitled}</p>
                          </div>
                          <Button type="button" variant="ghost" size="sm" onClick={() => restoreVersion(version)} className="rounded-[8px]">
                            <RotateCcw className="mr-2 h-4 w-4" />
                            {copy.rollback}
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  )
}

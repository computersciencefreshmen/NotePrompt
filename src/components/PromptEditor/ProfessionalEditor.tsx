'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Settings,
  Plus,
  Minus,
  FileText,
  Layers,
  Variable,
  CheckSquare,
  Lightbulb,
  Save,
  Tag,
  X,
  Sparkles,
  Eye
} from 'lucide-react'
import { ProfessionalModeData } from '@/types'
import MarkdownPreview from '@/components/ui/markdown-preview'
import { composeProfessionalPrompt } from '@/lib/prompt-content'

interface ProfessionalEditorProps {
  data: ProfessionalModeData
  onChange: (data: ProfessionalModeData) => void
  onPreview?: () => void
  onSave?: () => void
  loading?: boolean
  onOpenOptimizer?: () => void
  tags?: string[]
  onTagsChange?: (tags: string[]) => void
  availableTags?: string[]
}

type ProfessionalListField = 'constraints' | 'examples' | 'formatRules' | 'qualityMetrics' | 'acceptanceCriteria'

const specificationPreset = {
  formatRules: [
    '使用 Markdown 二级标题组织内容，每个部分不超过 5 条要点',
    '关键信息优先输出结论，再补充理由、步骤和注意事项',
    '涉及对比、方案或指标时优先使用表格呈现',
  ],
  qualityMetrics: [
    '输出至少包含 3 条可执行建议，每条建议说明预期收益',
    '如果信息不足，先列出不超过 5 个澄清问题，不直接编造',
    '最终答案控制在 800-1200 字，除非用户明确要求更长',
  ],
  acceptanceCriteria: [
    '答案必须覆盖用户输入中的全部关键约束',
    '每个结论必须能对应到输入信息、推理依据或明确假设',
    '最后给出下一步行动清单，包含优先级和验收方式',
  ],
  constraints: [
    '不得编造事实、数据、来源或用户未提供的背景',
    '遇到高风险建议时必须提示风险和替代方案',
    '避免空泛表达，所有建议必须具体到动作或判断标准',
  ],
}

export default function ProfessionalEditor({
  data,
  onChange,
  onPreview,
  onSave,
  loading = false,
  onOpenOptimizer,
  tags = [],
  onTagsChange,
  availableTags = [],
}: ProfessionalEditorProps) {
  const [showGuide, setShowGuide] = useState(true)
  const [newTag, setNewTag] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showMarkdown, setShowMarkdown] = useState(false)
  const previewTextareaRef = useRef<HTMLTextAreaElement>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFieldChange = (field: keyof ProfessionalModeData, value: any) => {
    onChange({
      ...data,
      [field]: value
    })
  }

  // 标签管理函数
  const addTag = (tag: string) => {
    if (tag && !tags.includes(tag) && onTagsChange) {
      onTagsChange([...tags, tag])
    }
    setNewTag('')
  }

  const removeTag = (tagToRemove: string) => {
    if (onTagsChange) {
      onTagsChange(tags.filter(tag => tag !== tagToRemove))
    }
  }

  // 约束条件管理
  const addConstraint = () => {
    const newConstraints = [...(data.constraints || []), '']
    handleFieldChange('constraints', newConstraints)
  }

  const updateConstraint = (index: number, value: string) => {
    const newConstraints = [...(data.constraints || [])]
    newConstraints[index] = value
    handleFieldChange('constraints', newConstraints)
  }

  const removeConstraint = (index: number) => {
    const newConstraints = data.constraints?.filter((_, i) => i !== index) || []
    handleFieldChange('constraints', newConstraints)
  }

  // 示例管理
  const addExample = () => {
    const newExamples = [...(data.examples || []), '']
    handleFieldChange('examples', newExamples)
  }

  const updateExample = (index: number, value: string) => {
    const newExamples = [...(data.examples || [])]
    newExamples[index] = value
    handleFieldChange('examples', newExamples)
  }

  const removeExample = (index: number) => {
    const newExamples = data.examples?.filter((_, i) => i !== index) || []
    handleFieldChange('examples', newExamples)
  }

  const addListItem = (field: ProfessionalListField, initialValue = '') => {
    const currentItems = (data[field] || []) as string[]
    handleFieldChange(field, [...currentItems, initialValue])
  }

  const updateListItem = (field: ProfessionalListField, index: number, value: string) => {
    const currentItems = [...((data[field] || []) as string[])]
    currentItems[index] = value
    handleFieldChange(field, currentItems)
  }

  const removeListItem = (field: ProfessionalListField, index: number) => {
    const currentItems = ((data[field] || []) as string[]).filter((_, itemIndex) => itemIndex !== index)
    handleFieldChange(field, currentItems)
  }

  const applySpecificationPreset = () => {
    onChange({
      ...data,
      formatRules: specificationPreset.formatRules,
      qualityMetrics: specificationPreset.qualityMetrics,
      acceptanceCriteria: specificationPreset.acceptanceCriteria,
      constraints: data.constraints && data.constraints.length > 0 ? data.constraints : specificationPreset.constraints,
    })
  }

  const syncStructuredContent = () => {
    onChange({ ...data, content: composeProfessionalPrompt(data) })
  }

  // 变量管理
  const addVariable = (key: string = '') => {
    const newVariables = { ...(data.variables || {}), [key || `变量${Object.keys(data.variables || {}).length + 1}`]: '' }
    handleFieldChange('variables', newVariables)
  }

  const updateVariable = (oldKey: string, newKey: string, value: string) => {
    const currentVariables = data.variables || {}
    const newVariables = Object.fromEntries(
      Object.entries(currentVariables)
        .filter(([k]) => k !== oldKey)
        .concat([[newKey, value]])
    )
    handleFieldChange('variables', newVariables)
  }

  const removeVariable = (key: string) => {
    const { [key]: _, ...newVariables } = data.variables || {}
    handleFieldChange('variables', newVariables)
  }

  const handleSave = () => {
    if (onSave) {
      onSave()
    }
  }

  // 自动调整textarea高度
  const adjustTextareaHeight = (textarea: HTMLTextAreaElement, minHeight: number, maxHeight?: number) => {
    textarea.style.height = 'auto'
    const h = Math.max(textarea.scrollHeight, minHeight)
    textarea.style.height = (maxHeight ? Math.min(h, maxHeight) : h) + 'px'
  }

  // 预览区域自适应高度（AI优化后自动调整）
  useEffect(() => {
    if (previewTextareaRef.current) {
      adjustTextareaHeight(previewTextareaRef.current, 120)
    }
  }, [data.content, data.role, data.background, data.task, data.format, data.outputStyle, data.formatRules, data.qualityMetrics, data.acceptanceCriteria, data.constraints, data.examples, data.variables])

  const composedContent = composeProfessionalPrompt(data)

  return (
    <div className="space-y-6">
      {/* 专业模式提示 */}
      {showGuide && (
        <Card className="border-teal-200 bg-teal-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Settings className="h-4 w-4 text-teal-700" />
                <span className="text-teal-900">专业模式：用角色、任务、格式、指标、约束和验收标准构建可复用提示词。</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowGuide(false)}
                className="text-teal-700 hover:text-teal-800"
              >
                知道了
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 基本信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <FileText className="h-5 w-5 mr-2" />
              基本信息
            </span>
            <Button type="button" size="sm" variant="outline" onClick={syncStructuredContent} disabled={loading} className="border-teal-300 text-teal-700 hover:bg-teal-50">
              同步结构化内容
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              提示词标题 *
            </label>
            <Input
              value={data.title}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              placeholder="输入提示词标题"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              完整提示词内容 *
            </label>
            <Textarea
              value={data.content}
              onChange={(e) => handleFieldChange('content', e.target.value)}
              placeholder="输入完整的提示词内容，支持Markdown格式"
              rows={8}
              disabled={loading}
              className="font-mono"
            />
            <p className="text-xs text-gray-500 mt-1">
              支持Markdown格式。您可以直接编辑或使用下方结构化编辑功能。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 标签管理 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Tag className="h-5 w-5 mr-2" />
            标签管理
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              添加标签
            </label>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="输入新标签"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTag(newTag)
                  }
                }}
                disabled={loading}
              />
              <Button
                onClick={() => addTag(newTag)}
                disabled={!newTag || loading}
                className="bg-teal-700 hover:bg-teal-800"
              >
                添加
              </Button>
            </div>
          </div>

          {/* 预设标签快速选择 */}
          {availableTags.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                常用标签
              </label>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => (
                  <Button
                    key={tag}
                    variant="outline"
                    size="sm"
                    onClick={() => addTag(tag)}
                    disabled={tags.includes(tag) || loading}
                    className="text-xs"
                  >
                    + {tag}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* 当前标签 */}
          {tags.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                当前标签
              </label>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    {tag}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-teal-700"
                      onClick={() => removeTag(tag)}
                    />
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 结构化编辑 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Layers className="h-5 w-5 mr-2" />
            结构化编辑
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                角色设定
              </label>
              <Textarea
                value={data.role || ''}
                onChange={(e) => handleFieldChange('role', e.target.value)}
                placeholder="定义AI扮演的角色，如：专业的文案策划师"
                rows={3}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                背景信息
              </label>
              <Textarea
                value={data.background || ''}
                onChange={(e) => handleFieldChange('background', e.target.value)}
                placeholder="提供相关背景和上下文信息"
                rows={3}
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              任务描述 *
            </label>
            <Textarea
              value={data.task}
              onChange={(e) => handleFieldChange('task', e.target.value)}
              placeholder="详细描述需要完成的任务"
              rows={4}
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                输出格式
              </label>
              <Textarea
                value={data.format || ''}
                onChange={(e) => handleFieldChange('format', e.target.value)}
                placeholder="指定输出的格式要求，如：JSON、表格、列表等"
                rows={3}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                输出风格
              </label>
              <Textarea
                value={data.outputStyle || ''}
                onChange={(e) => handleFieldChange('outputStyle', e.target.value)}
                placeholder="描述期望的输出风格和语调"
                rows={3}
                disabled={loading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 格式与验收规范 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <CheckSquare className="h-5 w-5 mr-2" />
              格式与验收规范
            </div>
            <Button size="sm" variant="outline" onClick={applySpecificationPreset} disabled={loading} className="border-teal-300 text-teal-700 hover:bg-teal-50">
              套用专业规范
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          {([
            ['formatRules', '格式化规范', '例如：使用 Markdown 二级标题；方案对比使用表格'] as const,
            ['qualityMetrics', '可量化指标', '例如：至少 3 条建议；800-1200 字；最多 5 个澄清问题'] as const,
            ['acceptanceCriteria', '验收标准', '例如：覆盖全部约束；结论有依据；最后给行动清单'] as const,
          ]).map(([field, title, placeholder]) => (
            <div key={field} className="rounded-[8px] border border-teal-100 bg-teal-50/40 p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                <Button type="button" size="sm" variant="outline" onClick={() => addListItem(field)} disabled={loading} className="h-8 border-teal-200 text-teal-700 hover:bg-white">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="space-y-2">
                {((data[field] || []) as string[]).map((item, index) => (
                  <div key={`${field}-${index}`} className="flex gap-2">
                    <Textarea
                      value={item}
                      onChange={(event) => updateListItem(field, index, event.target.value)}
                      placeholder={placeholder}
                      rows={2}
                      disabled={loading}
                      className="text-sm"
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => removeListItem(field, index)} disabled={loading} className="h-10 border-teal-200 text-teal-700 hover:bg-white">
                      <Minus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {((data[field] || []) as string[]).length === 0 && (
                  <p className="rounded-[8px] border border-dashed border-teal-200 bg-white/70 p-3 text-xs leading-5 text-gray-500">点击 + 添加，或套用专业规范。</p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 约束条件 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <CheckSquare className="h-5 w-5 mr-2" />
              约束条件
            </div>
            <Button size="sm" onClick={addConstraint} disabled={loading} className="bg-teal-700 hover:bg-teal-800">
              <Plus className="h-4 w-4 mr-1" />
              添加
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.constraints?.map((constraint, index) => (
            <div key={`constraint-${index}`} className="flex items-center space-x-2">
              <Input
                value={constraint}
                onChange={(e) => updateConstraint(index, e.target.value)}
                placeholder={`约束条件 ${index + 1}`}
                disabled={loading}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => removeConstraint(index)}
                disabled={loading}
                className="border-teal-300 text-teal-700 hover:bg-teal-50"
              >
                <Minus className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {(!data.constraints || data.constraints.length === 0) && (
            <p className="text-sm text-gray-500 text-center py-4">
              暂无约束条件，点击"添加"按钮添加
            </p>
          )}
        </CardContent>
      </Card>

      {/* 示例参考 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Lightbulb className="h-5 w-5 mr-2" />
              示例参考
            </div>
            <Button size="sm" onClick={addExample} disabled={loading} className="bg-teal-700 hover:bg-teal-800">
              <Plus className="h-4 w-4 mr-1" />
              添加
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.examples?.map((example, index) => (
            <div key={`example-${index}`} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  示例 {index + 1}
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeExample(index)}
                  disabled={loading}
                  className="border-teal-300 text-teal-700 hover:bg-teal-50"
                >
                  <Minus className="h-4 w-4" />
                </Button>
              </div>
              <Textarea
                value={example}
                onChange={(e) => updateExample(index, e.target.value)}
                placeholder="输入示例内容"
                rows={3}
                disabled={loading}
              />
            </div>
          ))}
          {(!data.examples || data.examples.length === 0) && (
            <p className="text-sm text-gray-500 text-center py-4">
              暂无示例，点击"添加"按钮添加示例
            </p>
          )}
        </CardContent>
      </Card>

      {/* 变量定义 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Variable className="h-5 w-5 mr-2" />
              变量定义
            </div>
            <Button size="sm" onClick={() => addVariable()} disabled={loading} className="bg-teal-700 hover:bg-teal-800">
              <Plus className="h-4 w-4 mr-1" />
              添加
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(data.variables || {}).map(([key, value]) => (
            <div key={key} className="flex items-center space-x-2">
              <Input
                value={key}
                onChange={(e) => updateVariable(key, e.target.value, value)}
                placeholder="变量名"
                className="w-1/3"
                disabled={loading}
              />
              <Input
                value={value}
                onChange={(e) => updateVariable(key, key, e.target.value)}
                placeholder="变量说明"
                className="flex-1"
                disabled={loading}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => removeVariable(key)}
                disabled={loading}
                className="border-teal-300 text-teal-700 hover:bg-teal-50"
              >
                <Minus className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {(!data.variables || Object.keys(data.variables).length === 0) && (
            <p className="text-sm text-gray-500 text-center py-4">
              暂无变量定义，点击"添加"按钮添加变量
            </p>
          )}
        </CardContent>
      </Card>

      {/* 预览区域 */}
      {composedContent && (
        <Card className="bg-gray-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">内容预览</CardTitle>
              <Button
                onClick={onOpenOptimizer}
                disabled={loading || !onOpenOptimizer}
                size="sm"
                className="bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-zinc-950 dark:hover:bg-teal-400"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                在优化台打开
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                {success}
              </div>
            )}
            <div className="bg-white rounded-lg p-4 border">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-700">提示词内容:</span>
                  <button
                    onClick={() => setShowMarkdown(!showMarkdown)}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                      showMarkdown
                        ? 'bg-teal-100 border-teal-300 text-teal-700'
                        : 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {showMarkdown ? 'Markdown' : '编辑'}
                  </button>
                </div>
                <span className="text-xs text-gray-500">{composedContent.length} 字符</span>
              </div>
              {showMarkdown ? (
                <div className="min-h-[120px] overflow-auto p-3 border border-gray-200 rounded-lg bg-white">
                  <MarkdownPreview content={composedContent} />
                </div>
              ) : (
                <textarea
                  ref={previewTextareaRef}
                  value={composedContent}
                  onChange={(e) => {
                    onChange({ ...data, content: e.target.value })
                    adjustTextareaHeight(e.target, 120)
                  }}
                  placeholder="在这里编辑或查看生成的提示词..."
                  className="w-full min-h-[120px] p-3 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  style={{ resize: 'none', minHeight: '120px', overflow: 'hidden' }}
                  disabled={loading}
                  onInput={(e) => adjustTextareaHeight(e.target as HTMLTextAreaElement, 120)}
                />
              )}
              <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                <span>提示：AI 优化统一在优化台中完成，可回滚、追问和保存。</span>
                <Button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(composedContent)
                      setSuccess('已复制到剪贴板')
                      setTimeout(() => setSuccess(''), 2000)
                    } catch {
                      setError('复制失败，请手动复制')
                      setTimeout(() => setError(''), 3000)
                    }
                  }}
                  size="sm"
                  variant="outline"
                  className="border-teal-300 text-teal-700 hover:bg-teal-50"
                >
                  复制
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}


    </div>
  )
}

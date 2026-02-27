'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { AILoading, AIOptimizingLoading } from '@/components/ui/ai-loading'
import MarkdownPreview from '@/components/ui/markdown-preview'
import { optimizePrompt as callOptimizeAPI } from '@/lib/api'
import { getProviderModels } from '@/config/ai'

interface ProfessionalEditorProps {
  data: ProfessionalModeData
  onChange: (data: ProfessionalModeData) => void
  onPreview?: () => void
  onSave?: () => void
  loading?: boolean
  aiOptimizing?: boolean
  tags?: string[]
  onTagsChange?: (tags: string[]) => void
  availableTags?: string[]
}

export default function ProfessionalEditor({
  data,
  onChange,
  onPreview,
  onSave,
  loading = false,
  aiOptimizing = false,
  tags = [],
  onTagsChange,
  availableTags = [],
}: ProfessionalEditorProps) {
  const [showGuide, setShowGuide] = useState(true)
  const [newTag, setNewTag] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [modelType, setModelType] = useState<'deepseek' | 'kimi' | 'qwen' | 'zhipu'>('qwen')
  const [modelName, setModelName] = useState<string>('qwen3.5-plus')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizedPreview, setOptimizedPreview] = useState('')
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

  const handleOptimize = async () => {
    // 构建用户输入的提示词内容
    let userPrompt = ''
    
    if (data.role) {
      userPrompt += `角色设定：${data.role}\n`
    }
    if (data.background) {
      userPrompt += `背景信息：${data.background}\n`
    }
    if (data.task) {
      userPrompt += `任务描述：${data.task}\n`
    }
    if (data.format) {
      userPrompt += `输出格式：${data.format}\n`
    }
    if (data.outputStyle) {
      userPrompt += `输出风格：${data.outputStyle}\n`
    }
    if (data.constraints && data.constraints.length > 0) {
      userPrompt += `约束条件：${data.constraints.filter(c => c.trim()).join('，')}\n`
    }
    if (data.examples && data.examples.length > 0) {
      userPrompt += `示例参考：${data.examples.filter(e => e.trim()).join('\n')}\n`
    }
    if (data.variables && Object.keys(data.variables).length > 0) {
      userPrompt += `变量定义：${Object.entries(data.variables).map(([k, v]) => `${k}: ${v}`).join('，')}\n`
    }
    
    if (!userPrompt.trim()) {
      setError('请至少填写一个字段后再进行AI优化')
      setTimeout(() => setError(''), 3000)
      return
    }

    if (userPrompt.trim().length < 10) {
      setError('内容太短，请输入至少10个字符')
      setTimeout(() => setError(''), 3000)
      return
    }

    setIsOptimizing(true)
    setError('')
    setSuccess('')

    try {
      const result = await callOptimizeAPI({ 
        prompt: userPrompt.trim(),
        provider: modelType,
        model: modelName || 'qwen3.5-plus',
        temperature: temperature
      })
      
      if (result.success && result.optimized) {
        setOptimizedPreview(result.optimized)
        setSuccess('AI优化完成！请预览后选择"应用结果"')
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(result.error || 'AI优化失败')
        setTimeout(() => setError(''), 5000)
      }
    } catch (error) {
      let errorMessage = 'AI优化失败，请稍后重试'
      if (error instanceof Error) {
        if (error.message.includes('500')) {
          errorMessage = 'AI服务暂时不可用，请稍后重试'
        } else if (error.message.includes('timeout')) {
          errorMessage = 'AI优化超时，请稍后重试'
        } else if (error.message.includes('network')) {
          errorMessage = '网络连接失败，请检查网络后重试'
        } else {
          errorMessage = error.message
        }
      }
      setError(errorMessage)
      setTimeout(() => setError(''), 5000)
    } finally {
      setIsOptimizing(false)
    }
  }

  const handleSave = () => {
    if (onSave) {
      onSave()
    }
  }

  // 应用AI优化结果
  const handleApplyOptimizedResult = () => {
    onChange({ ...data, content: optimizedPreview })
    setOptimizedPreview('')
  }

  // 取消AI优化预览
  const handleCancelOptimizedPreview = () => {
    setOptimizedPreview('')
  }

  // 自动调整textarea高度
  const adjustTextareaHeight = (textarea: HTMLTextAreaElement, minHeight: number, maxHeight: number) => {
    textarea.style.height = 'auto'
    const scrollHeight = textarea.scrollHeight
    textarea.style.height = Math.min(Math.max(scrollHeight, minHeight), maxHeight) + 'px'
  }

  return (
    <div className="space-y-6">
      {/* 专业模式提示 */}
      {showGuide && (
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Settings className="h-4 w-4 text-purple-600" />
                <span className="text-purple-800">专业模式：完全自主控制，支持结构化编辑和高级功能。</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowGuide(false)}
                className="text-purple-600 hover:text-purple-700"
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
          <CardTitle className="flex items-center">
            <FileText className="h-5 w-5 mr-2" />
            基本信息
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
                className="bg-purple-600 hover:bg-purple-700"
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
                      className="h-3 w-3 cursor-pointer hover:text-purple-600"
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

      {/* 约束条件 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <CheckSquare className="h-5 w-5 mr-2" />
              约束条件
            </div>
            <Button size="sm" onClick={addConstraint} disabled={loading} className="bg-purple-600 hover:bg-purple-700">
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
                className="border-purple-300 text-purple-600 hover:bg-purple-50"
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
            <Button size="sm" onClick={addExample} disabled={loading} className="bg-purple-600 hover:bg-purple-700">
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
                  className="border-purple-300 text-purple-600 hover:bg-purple-50"
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
            <Button size="sm" onClick={() => addVariable()} disabled={loading} className="bg-purple-600 hover:bg-purple-700">
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
                className="border-purple-300 text-purple-600 hover:bg-purple-50"
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
      {(data.content || optimizedPreview) && (
        <Card className="bg-gray-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {optimizedPreview ? 'AI优化预览' : '内容预览'}
              </CardTitle>
                              <div className="flex items-center space-x-4">
                  {/* 模型选择 */}
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">AI模型:</span>
                    <Select value={modelType} onValueChange={(value: 'deepseek' | 'kimi' | 'qwen' | 'zhipu') => {
                      setModelType(value)
                      const providerModels = getProviderModels(value)
                      if (providerModels.length > 0) {
                        setModelName(providerModels[0].key)
                      }
                    }}>
                      <SelectTrigger className="w-32 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="qwen">通义千问</SelectItem>
                        <SelectItem value="deepseek">DeepSeek</SelectItem>
                        <SelectItem value="kimi">Kimi</SelectItem>
                        <SelectItem value="zhipu">智谱GLM</SelectItem>
                      </SelectContent>
                    </Select>
                    {/* 二级模型选择 */}
                    <Select value={modelName} onValueChange={setModelName}>
                      <SelectTrigger className="w-40 h-8">
                        <SelectValue placeholder="选择具体模型" />
                      </SelectTrigger>
                      <SelectContent>
                        {getProviderModels(modelType).map((model) => (
                          <SelectItem key={model.key} value={model.key}>{model.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Temperature控制 */}
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">创造性:</span>
                    <div className="flex items-center space-x-2">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        className="w-20 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                      />
                      <span className="text-xs text-gray-500 w-8">{temperature}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {temperature <= 0.3 ? '精确' : temperature <= 0.7 ? '平衡' : '创意'}
                    </div>
                  </div>
                {optimizedPreview ? (
                  <div className="flex items-center space-x-2">
                    <Button
                      onClick={handleApplyOptimizedResult}
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      应用结果
                    </Button>
                    <Button
                      onClick={handleCancelOptimizedPreview}
                      size="sm"
                      variant="outline"
                      className="border-purple-300 text-purple-600 hover:bg-purple-50"
                    >
                      取消
                    </Button>
                  </div>
                ) : (
                  isOptimizing ? (
                    <div className="flex items-center justify-center">
                      <AIOptimizingLoading 
                        message="AI正在优化提示词..." 
                        size="sm" 
                        className="text-purple-600"
                      />
                    </div>
                  ) : (
                    <Button
                      onClick={handleOptimize}
                      disabled={loading || !data.task}
                      size="sm"
                      className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      AI智能优化
                    </Button>
                  )
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* 错误/成功提示 */}
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
            {isOptimizing ? (
              <div className="bg-white p-8 rounded-lg border">
                <AIOptimizingLoading message="AI正在优化您的提示词，请稍候..." size="md" />
              </div>
            ) : (
              <div className="bg-white rounded-lg p-4 border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-700">
                      {optimizedPreview ? 'AI优化结果（预览）:' : '提示词内容:'}
                    </span>
                    <button
                      onClick={() => setShowMarkdown(!showMarkdown)}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                        showMarkdown
                          ? 'bg-purple-100 border-purple-300 text-purple-700'
                          : 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {showMarkdown ? 'Markdown' : '编辑'}
                    </button>
                  </div>
                  <span className="text-xs text-gray-500">
                    {(optimizedPreview || data.content).length} 字符
                  </span>
                </div>
                {showMarkdown ? (
                  <div className="min-h-[120px] max-h-[600px] overflow-auto p-3 border border-gray-200 rounded-lg bg-white">
                    <MarkdownPreview content={optimizedPreview || data.content} />
                  </div>
                ) : (
                  <textarea
                    ref={previewTextareaRef}
                    value={optimizedPreview || data.content}
                    onChange={(e) => {
                      if (optimizedPreview) return
                      onChange({ ...data, content: e.target.value })
                      adjustTextareaHeight(e.target, 120, 600)
                    }}
                    placeholder="在这里编辑或查看生成的提示词..."
                    className="w-full min-h-[120px] p-3 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    style={{ resize: 'vertical', minHeight: '120px', maxHeight: '600px' }}
                    disabled={loading || !!optimizedPreview}
                    onInput={(e) => adjustTextareaHeight(e.target as HTMLTextAreaElement, 120, 600)}
                  />
                )}
                {optimizedPreview && (
                  <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                    💡 AI优化结果预览中，点击"应用结果"将优化内容应用到原始内容，或点击"取消"保持原内容不变
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span>💡 提示：点击"编辑/Markdown"切换视图</span>
                  <Button
                    onClick={async () => {
                      try {
                        const textToCopy = optimizedPreview || data.content
                        await navigator.clipboard.writeText(textToCopy)
                        setSuccess('已复制到剪贴板')
                        setTimeout(() => setSuccess(''), 2000)
                      } catch {
                        setError('复制失败，请手动复制')
                        setTimeout(() => setError(''), 3000)
                      }
                    }}
                    size="sm"
                    variant="outline"
                    className="border-purple-300 text-purple-600 hover:bg-purple-50"
                  >
                    📋 复制
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}


    </div>
  )
}

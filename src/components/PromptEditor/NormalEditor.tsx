'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileText, Tag, X, Sparkles } from 'lucide-react'
import { NormalModeData, PromptTemplate } from '@/types'
import { AILoading, AIOptimizingLoading } from '@/components/ui/ai-loading'
import { optimizePrompt, generatePrompt } from '@/lib/api'
import { getAvailableProviders, getProviderModels } from '@/config/ai'

interface NormalEditorProps {
  data: NormalModeData
  onChange: (data: NormalModeData) => void
  onSave?: () => void
  loading?: boolean
  aiOptimizing?: boolean
  onAiOptimizingChange?: (optimizing: boolean) => void
  tags?: string[]
  onTagsChange?: (tags: string[]) => void
  availableTags?: string[]
}

// 预设模板
const templates: PromptTemplate[] = [
  {
    id: 'writing',
    name: '写作助手',
    description: '专业的写作辅助工具，支持多种文体和风格',
    category: 'writing',
    structure: {
      role: '你是一位经验丰富的写作专家，擅长各种文体创作',
      background: '用户需要创作高质量的文字内容，需要专业的写作指导',
      task: '请根据以下要求创作{文体}：\n\n主题：{主题}\n目标读者：{目标读者}\n写作目的：{写作目的}',
      format: '请按照以下格式输出：\n1. 标题：简洁有力的标题\n2. 引言：吸引读者注意的开头\n3. 正文：结构清晰的主要内容\n4. 结论：总结要点或行动号召\n\n写作要求：\n- 字数：约{字数}字\n- 风格：{风格}\n- 语调：{语调}\n- 结构：{结构}',
      examples: '示例：\n主题：环保意识\n文体：议论文\n目标读者：大学生\n写作目的：提高环保意识\n\n输出：\n标题：《守护地球，从你我做起》\n引言：在当今社会，环境问题日益严重...\n正文：首先，环境污染对人类的危害...\n结论：让我们携手共建美好家园...',
      constraints: [
        '确保内容原创，避免抄袭',
        '语言表达准确、生动',
        '逻辑结构清晰合理',
        '符合目标读者的阅读习惯'
      ]
    }
  },
  {
    id: 'analysis',
    name: '分析解答',
    description: '深度分析问题并提供系统性的解决方案',
    category: 'analysis',
    structure: {
      role: '你是一位资深的问题分析专家和解决方案设计师',
      background: '用户面临复杂问题，需要系统性的分析和解决方案',
      task: '请对以下问题进行深度分析并提供解决方案：\n\n问题描述：{问题描述}\n问题背景：{问题背景}\n期望目标：{期望目标}',
      format: '请按照以下结构进行分析：\n\n1. 问题分析\n   - 问题本质：深入分析问题的核心\n   - 影响因素：识别关键影响因素\n   - 现状评估：客观评估当前状况\n\n2. 解决方案\n   - 方案一：[具体方案名称]\n     * 实施步骤：详细的操作步骤\n     * 预期效果：可量化的预期结果\n     * 风险评估：可能的风险和应对措施\n   - 方案二：[具体方案名称]\n     * 实施步骤：详细的操作步骤\n     * 预期效果：可量化的预期结果\n     * 风险评估：可能的风险和应对措施\n\n3. 实施建议\n   - 优先级排序：按重要性和可行性排序\n   - 时间规划：分阶段实施计划\n   - 资源需求：人力、物力、财力需求',
      examples: '示例：\n问题：公司员工工作效率低下\n背景：新员工较多，缺乏培训\n目标：提高团队整体工作效率\n\n分析：\n1. 问题分析\n   - 本质：技能不足+流程不清晰\n   - 因素：培训缺失、沟通不畅\n2. 解决方案\n   - 方案一：建立培训体系\n   - 方案二：优化工作流程',
      constraints: [
        '分析要客观全面，避免偏见',
        '解决方案要具体可行',
        '考虑成本效益比',
        '提供可量化的评估指标'
      ]
    }
  },
  {
    id: 'creative',
    name: '创意设计',
    description: '激发创意灵感，生成创新设计方案',
    category: 'creative',
    structure: {
      role: '你是一位富有创造力的设计师和创意总监',
      background: '用户需要突破常规思维，获得创新性的设计理念和方案',
      task: '请为以下项目设计创新方案：\n\n项目名称：{项目名称}\n项目目标：{项目目标}\n目标用户：{目标用户}\n创新要求：{创新要求}',
      format: '请提供以下创意设计方案：\n\n1. 创意概念\n   - 核心理念：独特的创意理念\n   - 创新点：突破性的创新元素\n   - 价值主张：为用户创造的价值\n\n2. 设计方案\n   - 方案一：[创意方案名称]\n     * 设计理念：详细的设计思路\n     * 功能特点：核心功能描述\n     * 实现方式：具体实现方法\n     * 预期效果：创新效果预测\n   - 方案二：[创意方案名称]\n     * 设计理念：详细的设计思路\n     * 功能特点：核心功能描述\n     * 实现方式：具体实现方法\n     * 预期效果：创新效果预测\n\n3. 创新评估\n   - 创新程度：评估创新水平\n   - 可行性：技术实现可行性\n   - 市场潜力：商业价值评估',
      examples: '示例：\n项目：智能家居产品\n目标：提升生活便利性\n用户：年轻家庭\n创新要求：环保节能\n\n创意概念：\n- 理念：绿色智能生活\n- 创新：AI节能优化\n- 价值：省钱+环保',
      constraints: [
        '创意要具有原创性和独特性',
        '设计方案要具有可行性',
        '考虑用户体验和市场需求',
        '平衡创新性和实用性'
      ]
    }
  },
  {
    id: 'learning',
    name: '学习指导',
    description: '制定个性化学习计划，提供系统化教学指导',
    category: 'learning',
    structure: {
      role: '你是一位资深的教育专家和学习规划师',
      background: '用户需要系统性的学习指导，包括学习计划制定和教学方法设计',
      task: '请为以下学习需求制定详细的学习指导方案：\n\n学习科目：{学习科目}\n学习目标：{学习目标}\n学习者背景：{学习者背景}\n学习时间：{学习时间}',
      format: '请提供以下学习指导方案：\n\n1. 学习需求分析\n   - 知识现状：当前知识水平评估\n   - 学习差距：需要掌握的知识点\n   - 学习能力：学习者的优势和不足\n   - 学习偏好：适合的学习方式\n\n2. 学习计划制定\n   - 总体目标：明确的学习目标\n   - 阶段规划：分阶段学习计划\n     * 第一阶段：[具体内容]\n     * 第二阶段：[具体内容]\n     * 第三阶段：[具体内容]\n   - 时间安排：详细的时间分配\n   - 学习资源：推荐的学习材料\n\n3. 教学方法设计\n   - 教学策略：适合的教学方法\n   - 练习设计：针对性的练习安排\n   - 评估方式：学习效果评估方法\n   - 反馈机制：学习进度跟踪方式\n\n4. 学习支持\n   - 常见问题：可能遇到的问题\n   - 解决方案：问题解决方法\n   - 学习建议：实用的学习技巧',
      examples: '示例：\n科目：Python编程\n目标：掌握基础语法\n背景：零基础\n时间：3个月\n\n学习计划：\n1. 需求分析：完全零基础\n2. 阶段规划：\n   - 第1个月：基础语法\n   - 第2个月：数据结构\n   - 第3个月：项目实践\n3. 教学方法：理论+实践',
      constraints: [
        '学习计划要循序渐进',
        '考虑学习者的个体差异',
        '提供可操作的学习建议',
        '建立有效的评估机制'
      ]
    }
  }
]

// 预设选项
const styleOptions = [
  { value: 'professional', label: '专业正式' },
  { value: 'casual', label: '轻松随意' },
  { value: 'friendly', label: '友好亲切' },
  { value: 'creative', label: '创意生动' },
  { value: 'academic', label: '学术严谨' }
]

const toneOptions = [
  { value: 'neutral', label: '中性客观' },
  { value: 'enthusiastic', label: '热情积极' },
  { value: 'calm', label: '冷静理性' },
  { value: 'humorous', label: '轻松幽默' },
  { value: 'serious', label: '严肃认真' }
]

const formatOptions = [
  { value: 'paragraph', label: '段落文本' },
  { value: 'list', label: '列表格式' },
  { value: 'steps', label: '步骤说明' },
  { value: 'qa', label: '问答形式' },
  { value: 'table', label: '表格展示' }
]

export default function NormalEditor({
  data,
  onChange,
  onSave,
  loading = false,
  aiOptimizing = false,
  onAiOptimizingChange,
  tags = [],
  onTagsChange,
  availableTags = [],
}: NormalEditorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [showTips, setShowTips] = useState(true)
  const [newTag, setNewTag] = useState('')
  const [modelType, setModelType] = useState<'deepseek' | 'kimi' | 'qwen' | 'zhipu'>('qwen')
  const [modelName, setModelName] = useState<string>('qwen3.5-plus')
  const [temperature, setTemperature] = useState<number>(0.7)
  const [aiFunction, setAiFunction] = useState<'optimize' | 'generate'>('optimize')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // 复制功能
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setSuccess('已复制到剪贴板')
      setTimeout(() => setSuccess(''), 2000)
    } catch (err) {
      setError('复制失败，请手动复制')
      setTimeout(() => setError(''), 3000)
    }
  }
  
  // 创建refs用于自适应高度
  const objectiveRef = useRef<HTMLTextAreaElement>(null)
  const contextRef = useRef<HTMLTextAreaElement>(null)
  const examplesRef = useRef<HTMLTextAreaElement>(null)

  // 自适应高度函数
  const adjustTextareaHeight = (textarea: HTMLTextAreaElement, minHeight: number, maxHeight: number) => {
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px'
  }

  // 在组件加载和内容变化时调整高度
  useEffect(() => {
    if (objectiveRef.current) {
      adjustTextareaHeight(objectiveRef.current, 80, 200)
    }
    if (contextRef.current) {
      adjustTextareaHeight(contextRef.current, 60, 150)
    }
    if (examplesRef.current) {
      adjustTextareaHeight(examplesRef.current, 60, 120)
    }
  }, [data.objective, data.context, data.examples])

  const handleFieldChange = (field: keyof NormalModeData, value: string) => {
    onChange({
      ...data,
      [field]: value
    })
  }

  const applyTemplate = (template: PromptTemplate) => {
    const newData: NormalModeData = {
      ...data,
      title: template.name,
      objective: template.structure.task,
      format: template.structure.format
    }
    onChange(newData)
    setSelectedTemplate(template.id)
  }

  const generateLocalPrompt = (): string => {
    let prompt = ''

    if (data.objective) {
      prompt += `目标：${data.objective}\n\n`
    }

    if (data.context) {
      prompt += `背景：${data.context}\n\n`
    }

    if (data.style || data.tone) {
      prompt += `要求：`
      if (data.style) prompt += `使用${styleOptions.find(s => s.value === data.style)?.label}的风格`
      if (data.style && data.tone) prompt += `，`
      if (data.tone) prompt += `保持${toneOptions.find(t => t.value === data.tone)?.label}的语调`
      prompt += `\n\n`
    }

    if (data.format) {
      const formatLabel = formatOptions.find(f => f.value === data.format)?.label
      prompt += `输出格式：${formatLabel}\n\n`
    }

    if (data.examples) {
      prompt += `参考示例：${data.examples}\n\n`
    }

    return prompt.trim()
  }

  const handleOptimize = async (promptContent: string, temperature?: number) => {
    // 输入验证
    if (!promptContent || promptContent.trim().length === 0) {
      setError('请输入要处理的提示词内容')
      setTimeout(() => setError(''), 3000)
      return
    }

    if (promptContent.trim().length < 10) {
      setError('提示词内容太短，请输入至少10个字符')
      setTimeout(() => setError(''), 3000)
      return
    }

    // 设置加载状态
    if (onAiOptimizingChange) {
      onAiOptimizingChange(true)
    }
    setError('')
    setSuccess('')

    try {
      if (aiFunction === 'optimize') {
        // AI优化功能
        
        const result = await optimizePrompt({ 
          prompt: promptContent.trim(),
          provider: modelType,
          model: modelName,
          temperature: temperature
        })
        
        if (result.success && result.optimized) {
          // 将优化结果应用到当前内容
          onChange({ ...data, objective: result.optimized })
          
          // 显示成功消息
          setSuccess('AI优化完成！')
          setTimeout(() => setSuccess(''), 3000)
        } else {
          setError(result.error || 'AI优化失败')
          setTimeout(() => setError(''), 5000)
        }
      } else {
        // AI生成功能
        
        const result = await generatePrompt({ 
          userInfo: promptContent.trim(),
          targetDescription: data.objective || '生成专业提示词',
          writingStyle: data.style || '专业、清晰',
          tone: data.tone || '正式、友好',
          outputFormat: data.format || '结构化文本',
          examples: data.examples || '',
          tags: tags.join(', ') || '',
          provider: modelType,
          model: modelName
        })
        
        if (result.success && result.generated) {
          // 将生成结果应用到当前内容
          onChange({ ...data, objective: result.generated })
          
          // 显示成功消息
          setSuccess('AI生成完成！')
          setTimeout(() => setSuccess(''), 3000)
        } else {
          setError(result.error || 'AI生成失败')
          setTimeout(() => setError(''), 5000)
        }
      }
      
    } catch (error) {
      // Handle error silently
      
      // 更详细的错误信息
      let errorMessage = aiFunction === 'optimize' ? 'AI优化失败，请稍后重试' : 'AI生成失败，请稍后重试'
      if (error instanceof Error) {
        if (error.message.includes('500')) {
          errorMessage = 'AI服务暂时不可用，请稍后重试'
        } else if (error.message.includes('timeout')) {
          errorMessage = 'AI处理超时，请稍后重试'
        } else if (error.message.includes('network')) {
          errorMessage = '网络连接失败，请检查网络后重试'
        } else {
          errorMessage = error.message
        }
      }
      
      setError(errorMessage)
      setTimeout(() => setError(''), 5000)
    } finally {
      // 重置加载状态
      if (onAiOptimizingChange) {
        onAiOptimizingChange(false)
      }
    }
  }

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

  const handleSave = () => {
    if (onSave) {
      onSave()
    }
  }

  return (
    <div className="space-y-6">
      {/* 模板快速选择（折叠式） */}
      <Card>
        <CardHeader className="py-3 cursor-pointer" onClick={() => setShowTips(!showTips)}>
          <CardTitle className="text-sm flex items-center justify-between">
            <div className="flex items-center">
              <FileText className="h-4 w-4 mr-2 text-teal-600" />
              <span>快速模板（可选）</span>
            </div>
            <span className="text-xs text-gray-400">{showTips ? '收起' : '展开'}</span>
          </CardTitle>
        </CardHeader>
        {showTips && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`p-2 border rounded-lg cursor-pointer transition-colors text-center ${
                    selectedTemplate === template.id
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => applyTemplate(template)}
                >
                  <h4 className="font-medium text-xs">{template.name}</h4>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{template.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* 核心输入区：标题 + 目标 + 背景 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">提示词内容</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">标题 *</label>
            <Input
              value={data.title}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              placeholder="给你的提示词起个名字"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">目标描述 *</label>
            <Textarea
              value={data.objective}
              onChange={(e) => handleFieldChange('objective', e.target.value)}
              placeholder="描述你希望AI完成什么任务，例如：写一篇关于环保的文章"
              className="min-h-[80px] resize-none"
              style={{ height: 'auto', minHeight: '80px', maxHeight: '200px', overflowY: 'auto' }}
              onInput={(e) => adjustTextareaHeight(e.target as HTMLTextAreaElement, 80, 200)}
              disabled={loading}
              ref={objectiveRef}
            />
            <p className="text-xs text-gray-400 mt-1">清楚描述你的需求，AI会更好地理解并完成任务</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">背景信息（可选）</label>
            <Textarea
              value={data.context || ''}
              onChange={(e) => handleFieldChange('context', e.target.value)}
              placeholder="提供相关背景信息，帮助AI更好理解情境"
              className="min-h-[60px] resize-none"
              style={{ height: 'auto', minHeight: '60px', maxHeight: '150px', overflowY: 'auto' }}
              onInput={(e) => adjustTextareaHeight(e.target as HTMLTextAreaElement, 60, 150)}
              disabled={loading}
              ref={contextRef}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">示例说明（可选）</label>
            <Textarea
              value={data.examples || ''}
              onChange={(e) => handleFieldChange('examples', e.target.value)}
              placeholder="提供一些示例，帮助AI理解你的期望输出"
              className="min-h-[60px] resize-none"
              style={{ height: 'auto', minHeight: '60px', maxHeight: '120px', overflowY: 'auto' }}
              onInput={(e) => adjustTextareaHeight(e.target as HTMLTextAreaElement, 60, 120)}
              disabled={loading}
              ref={examplesRef}
            />
          </div>
        </CardContent>
      </Card>

      {/* 风格与标签（合并） */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">风格与标签</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 风格设置 — 一行三列 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">写作风格</label>
              <Select value={data.style || ''} onValueChange={(value) => handleFieldChange('style', value)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="选择风格" />
                </SelectTrigger>
                <SelectContent>
                  {styleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">语调设置</label>
              <Select value={data.tone || ''} onValueChange={(value) => handleFieldChange('tone', value)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="选择语调" />
                </SelectTrigger>
                <SelectContent>
                  {toneOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">输出格式</label>
              <Select value={data.format || ''} onValueChange={(value) => handleFieldChange('format', value)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="选择格式" />
                </SelectTrigger>
                <SelectContent>
                  {formatOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 标签管理 — 紧凑行内 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Tag className="h-3 w-3 inline mr-1" />
              标签
            </label>
            <div className="flex gap-2 mb-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="输入标签回车添加"
                className="h-9"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(newTag) } }}
                disabled={loading}
              />
              <Button onClick={() => addTag(newTag)} disabled={!newTag || loading} size="sm" className="bg-teal-600 hover:bg-teal-700 h-9">
                添加
              </Button>
            </div>
            {/* 预设标签 */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => addTag(tag)}
                  disabled={tags.includes(tag) || loading}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    tags.includes(tag)
                      ? 'bg-teal-100 border-teal-300 text-teal-600'
                      : 'border-gray-200 text-gray-600 hover:border-teal-300 hover:text-teal-600'
                  }`}
                >
                  {tags.includes(tag) ? '✓' : '+'} {tag}
                </button>
              ))}
            </div>
            {/* 已选标签 */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1 text-xs">
                    {tag}
                    <X className="h-3 w-3 cursor-pointer hover:text-red-500" onClick={() => removeTag(tag)} />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 生成的提示词预览 */}
      {data.objective && (
        <Card className="bg-gray-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold whitespace-nowrap">内容预览</span>
              <div className="flex items-center space-x-4">
                {/* AI功能选择 */}
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">AI功能:</span>
                  <Select value={aiFunction} onValueChange={(value: 'optimize' | 'generate') => setAiFunction(value)}>
                    <SelectTrigger className="w-32 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="optimize">AI优化</SelectItem>
                      <SelectItem value="generate">AI生成</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* 模型选择 */}
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">AI模型:</span>
                  <Select value={modelType} onValueChange={(value: 'deepseek' | 'kimi' | 'qwen' | 'zhipu') => {
                    setModelType(value)
                    // 当提供商改变时，重置模型选择为第一个可用模型
                    const providerModels = getProviderModels(value)
                    if (providerModels.length > 0) {
                      setModelName(providerModels[0].key)
                    }
                  }}>
                    <SelectTrigger className="w-32 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="qwen">Qwen (阿里)</SelectItem>
                      <SelectItem value="deepseek">DeepSeek</SelectItem>
                      <SelectItem value="kimi">Kimi (月之暗面)</SelectItem>
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
                        <SelectItem key={model.key} value={model.key}>
                          {model.name}
                        </SelectItem>
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
              {aiOptimizing ? (
                  <div className="flex items-center space-x-2">
                    <div className="relative w-3.5 h-3.5">
                      {/* 主旋转环 */}
                      <div className="w-3.5 h-3.5 border-2 border-teal-200 border-t-teal-600 rounded-full animate-spin"></div>
                    </div>
                    <span className="text-xs text-teal-600 font-medium">AI优化中</span>
                  </div>
                ) : (
                  <Button
                    onClick={() => {
                      // 组装所有用户输入字段传给大模型
                      const fullPrompt = generateLocalPrompt() || data.objective
                      handleOptimize(fullPrompt, temperature)
                    }}
                    disabled={!data.objective}
                    size="sm"
                    className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white"
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    {aiFunction === 'optimize' ? 'AI优化' : 'AI生成'}
                  </Button>
                )
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-white rounded-lg p-4 border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">
                提示词内容（可直接编辑）:
              </span>
              <span className="text-xs text-gray-500">
                {data.objective.length} 字符
              </span>
            </div>
            <textarea
              value={data.objective}
              onChange={(e) => {
                onChange({ ...data, objective: e.target.value })
                // 自动调整高度
                adjustTextareaHeight(e.target, 120, 600)
              }}
              className="w-full min-h-[120px] p-3 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="在这里编辑或完善你的提示词..."
              style={{
                resize: 'vertical',
                minHeight: '120px',
                maxHeight: '600px'
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement
                adjustTextareaHeight(target, 120, 600)
              }}
            />
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
              <span>💡 提示：你可以直接在这里修改生成的提示词</span>
              <Button
                onClick={() => {
                  handleCopy(data.objective)
                }}
                size="sm"
                variant="outline"
              >
                📋 复制
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      )}


    </div>
  )
}

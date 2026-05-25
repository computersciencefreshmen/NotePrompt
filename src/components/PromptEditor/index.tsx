'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Save,
  ArrowLeft,
  Wand2,
  Settings2,
  Globe,
  Lock,
  Hash,
  Plus,
  Sparkles,
  X,
} from 'lucide-react'
import { EditMode, NormalModeData, ProfessionalModeData, Prompt } from '@/types'
import NormalEditor from './NormalEditor'
import ProfessionalEditor from './ProfessionalEditor'
import VersionHistory from '@/components/VersionHistory'
import { featureFlags } from '@/config/features'
import { composeProfessionalPrompt } from '@/lib/prompt-content'

interface PromptEditorProps {
  prompt?: Prompt // 编辑模式时传入
  onSave: (data: { title: string; content: string; mode: EditMode; tags: string[]; is_public: boolean }) => void
  onCancel: () => void
  onVersionRestore?: () => void
  loading?: boolean
}

export default function PromptEditor({
  prompt,
  onSave,
  onCancel,
  onVersionRestore,
  loading = false
}: PromptEditorProps) {
  const router = useRouter()
  const [editMode, setEditMode] = useState<EditMode>('normal')
  const [showModeCard, setShowModeCard] = useState(!prompt) // 新建时显示模式选择卡片，编辑时不显示
  const [normalData, setNormalData] = useState<NormalModeData>({
    title: '',
    objective: '',
    context: '',
    style: '',
    tone: '',
    format: '',
    examples: ''
  })
  const [professionalData, setProfessionalData] = useState<ProfessionalModeData>({
    title: '',
    content: '',
    task: '',
    role: '',
    background: '',
    format: '',
    outputStyle: '',
    formatRules: [],
    qualityMetrics: [],
    acceptanceCriteria: [],
    constraints: [],
    examples: [],
    variables: {}
  })
  const [isPublic, setIsPublic] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const [availableTags] = useState<string[]>([
    '文案写作', '营销策划', '代码审查', '学习计划', '数据分析',
    '创意设计', '商业分析', '教育培训', '生活助手', '工作效率',
    '技术开发', '产品设计', '用户体验', '项目管理', '团队协作'
  ])

  // 初始化数据（编辑模式）
  useEffect(() => {
    if (prompt) {
      // 处理历史数据中的"目标："前缀（新保存的数据不再包含此前缀）
      let processedContent = prompt.content
      if (processedContent.startsWith('目标：')) {
        processedContent = processedContent.substring(3).trim()
      }
      
      setNormalData(prev => ({
        ...prev,
        title: prompt.title,
        objective: processedContent // 不再截断内容
      }))
      setProfessionalData(prev => ({
        ...prev,
        title: prompt.title,
        content: prompt.content, // 保持完整内容
        task: processedContent
      }))
      // 初始化标签
      if (prompt.tags) {
        setTags(prompt.tags.map(tag => tag.name))
      }
      // 初始化公开状态
      if (prompt.is_public) {
        setIsPublic(true)
      }
    }
  }, [prompt])

  const handleModeChange = (mode: EditMode) => {
    setEditMode(mode)
    setShowModeCard(false) // 选择后收起卡片

    // 在模式切换时同步数据
    if (mode === 'professional' && normalData.title) {
      setProfessionalData(prev => ({
        ...prev,
        title: normalData.title,
        task: normalData.objective,
        background: normalData.context || '',
        content: generateNormalPrompt()
      }))
    } else if (mode === 'normal' && professionalData.title) {
      setNormalData(prev => ({
        ...prev,
        title: professionalData.title,
        objective: professionalData.task
      }))
    }
  }

  const generateNormalPrompt = (): string => {
    // 直接返回objective的内容，不添加任何前缀
    if (normalData.objective) {
      return normalData.objective.trim()
    }
    return ''
  }



  const handleSave = () => {
    const currentData = editMode === 'normal' ? normalData : professionalData
    const finalContent = editMode === 'normal' ? generateNormalPrompt() : composeProfessionalPrompt(professionalData)

    const saveData = {
      title: currentData.title,
      content: finalContent,
      mode: editMode,
      tags: tags,
      is_public: isPublic,
    }

    onSave(saveData)
  }

  const addTag = (tag: string) => {
    const normalizedTag = tag.trim()
    if (!normalizedTag) return
    setTags(current => current.includes(normalizedTag) ? current : [...current, normalizedTag].slice(0, 12))
    setTagDraft('')
  }

  const removeTag = (tag: string) => {
    setTags(current => current.filter(item => item !== tag))
  }

  const canSave = editMode === 'normal'
    ? normalData.title && normalData.objective
    : professionalData.title && (professionalData.content || professionalData.task)

  const handleOpenOptimizer = () => {
    const draftContent = editMode === 'normal' ? generateNormalPrompt() : composeProfessionalPrompt(professionalData)
    const draftTitle = editMode === 'normal' ? normalData.title : professionalData.title

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('note-prompt-optimizer-draft', JSON.stringify({
        title: draftTitle || '新建提示词',
        prompt: draftContent,
        mode: editMode === 'normal' ? 'simple' : 'pro',
        source: prompt ? 'edit' : 'create',
        promptId: prompt?.id,
        tags,
      }))
    }

    router.push(prompt ? `/optimizer?source=edit&id=${prompt.id}` : '/optimizer?source=create')
  }

  if (!prompt) {
    return (
      <div className="min-h-screen bg-[#f3eee6] px-4 py-6 text-[#2f2a24] dark:bg-[#14120f] dark:text-[#f4efe7] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={onCancel} className="rounded-[8px] text-[#5f5448] hover:bg-[#e8dfd1] dark:text-[#c9bda9] dark:hover:bg-[#26211b]">
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回
              </Button>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="rounded-[6px] bg-[#2f2a24] text-[#fffaf0] hover:bg-[#2f2a24] dark:bg-[#f4efe7] dark:text-[#1d1a16]">V2 内部版</Badge>
                  <Badge variant="outline" className="rounded-[6px] border-[#cfc4b4] bg-[#fbfaf7]/70 dark:border-[#3a342c] dark:bg-[#1d1a16]/70">新建提示词</Badge>
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">输入或粘贴提示词</h1>
              </div>
            </div>
            {featureFlags.promptOptimizerV2 && (
              <Button type="button" onClick={handleOpenOptimizer} disabled={normalData.objective.trim().length < 2} className="h-11 rounded-[8px] bg-teal-700 px-5 text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-zinc-950 dark:hover:bg-teal-400">
                <Sparkles className="mr-2 h-4 w-4" />
                去优化
              </Button>
            )}
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="rounded-[8px] border-[#ded6c8] bg-[#fbfaf7]/95 shadow-[0_20px_70px_rgba(67,56,43,0.10)] dark:border-[#3a342c] dark:bg-[#1d1a16]/95">
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="rounded-[8px] border border-[#ded6c8] bg-[#fffdf8] p-3 dark:border-[#3a342c] dark:bg-[#171410]">
                  <Textarea
                    value={normalData.objective}
                    onChange={event => setNormalData(current => ({ ...current, objective: event.target.value }))}
                    placeholder="把原始提示词、任务描述或想法粘贴到这里。"
                    className="min-h-[360px] resize-y border-0 bg-transparent p-1 text-base leading-7 shadow-none focus-visible:ring-0 dark:bg-transparent"
                  />
                  <div className="mt-3 flex flex-col gap-3 border-t border-[#e2d8c8] pt-3 dark:border-[#342e27] sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-[#6b5f51] dark:text-[#c9bda9]">
                      {normalData.objective.trim().length > 0 ? `${normalData.objective.trim().length} 字符，保存前可先优化` : '支持直接粘贴旧提示词或一句需求'}
                    </span>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={onCancel} className="rounded-[8px] border-[#d8cfbf] bg-[#fbfaf7] dark:border-[#3a342c] dark:bg-[#1d1a16]">
                        取消
                      </Button>
                      <Button type="button" onClick={handleOpenOptimizer} disabled={normalData.objective.trim().length < 2 || !featureFlags.promptOptimizerV2} className="rounded-[8px] bg-teal-700 px-5 text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-zinc-950 dark:hover:bg-teal-400">
                        <Wand2 className="mr-2 h-4 w-4" />
                        优化
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card className="rounded-[8px] border-[#ded6c8] bg-[#fbfaf7]/95 shadow-[0_20px_70px_rgba(67,56,43,0.08)] dark:border-[#3a342c] dark:bg-[#1d1a16]/95">
                <CardContent className="space-y-4 p-5">
                  <div className="space-y-2">
                    <Label htmlFor="prompt-title" className="text-sm font-semibold">标题</Label>
                    <Input
                      id="prompt-title"
                      value={normalData.title}
                      onChange={event => setNormalData(current => ({ ...current, title: event.target.value }))}
                      placeholder="给提示词起个名字"
                      className="h-11 rounded-[8px] border-[#d8cfbf] bg-[#fffdf8] dark:border-[#3a342c] dark:bg-[#171410]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-semibold">
                      <Hash className="h-4 w-4" />
                      标签
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={tagDraft}
                        onChange={event => setTagDraft(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            addTag(tagDraft)
                          }
                        }}
                        placeholder="输入标签后回车"
                        className="h-10 rounded-[8px] border-[#d8cfbf] bg-[#fffdf8] dark:border-[#3a342c] dark:bg-[#171410]"
                      />
                      <Button type="button" variant="outline" onClick={() => addTag(tagDraft)} className="h-10 rounded-[8px] border-[#d8cfbf] bg-[#fbfaf7] dark:border-[#3a342c] dark:bg-[#1d1a16]" aria-label="添加标签">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tags.map(tag => (
                        <Badge key={tag} variant="outline" className="gap-1 rounded-[6px] border-[#cfc4b4] bg-[#f6f1e9] text-[#4d4338] dark:border-[#3a342c] dark:bg-[#171410] dark:text-[#e8dcc9]">
                          {tag}
                          <button type="button" onClick={() => removeTag(tag)} aria-label={`移除 ${tag}`}>
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {availableTags.slice(0, 8).filter(tag => !tags.includes(tag)).map(tag => (
                        <button key={tag} type="button" onClick={() => addTag(tag)} className="rounded-[6px] border border-[#d8cfbf] px-2 py-1 text-xs text-[#6b5f51] hover:bg-[#eee5d8] dark:border-[#3a342c] dark:text-[#c9bda9] dark:hover:bg-[#26211b]">
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsPublic(prev => !prev)}
                    className="flex w-full items-center justify-between rounded-[8px] border border-[#d8cfbf] bg-[#fffdf8] px-3 py-3 text-sm dark:border-[#3a342c] dark:bg-[#171410]"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      {isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                      {isPublic ? '公开到提示词库' : '保存为私有提示词'}
                    </span>
                    <span className="text-xs text-[#7b6e5f] dark:text-[#c9bda9]">点击切换</span>
                  </button>

                  <Button
                    onClick={handleSave}
                    disabled={!canSave || loading}
                    className="h-11 w-full rounded-[8px] bg-teal-700 text-white hover:bg-teal-800"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {loading ? '保存中...' : '保存提示词'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* 头部区域 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={onCancel}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {prompt ? '编辑提示词' : '创建提示词'}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {editMode === 'normal' ? '普通模式：简化操作，AI智能辅助' : '专业模式：完全自主控制，高度自定义'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {featureFlags.promptOptimizerV2 && (
              <Button variant="outline" onClick={handleOpenOptimizer}>
                <Wand2 className="h-4 w-4 mr-2" />
                优化工作台
              </Button>
            )}
            {/* 模式切换开关 */}
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium">普通</span>
              <Switch
                checked={editMode === 'professional'}
                onCheckedChange={(checked) => handleModeChange(checked ? 'professional' : 'normal')}
                className="data-[state=checked]:bg-teal-600"
              />
              <span className="text-sm font-medium">专业</span>
            </div>
          </div>
        </div>

        {/* 模式选择大卡片 — 新建时首次显示 */}
        {showModeCard && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              className={`cursor-pointer transition-all hover:shadow-md border-2 ${
                editMode === 'normal' ? 'border-teal-500 bg-teal-50/50' : 'border-gray-200 hover:border-teal-300'
              }`}
              onClick={() => handleModeChange('normal')}
            >
              <CardContent className="p-6">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0">
                    <Wand2 className="h-6 w-6 text-teal-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">普通模式</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      简化操作，AI 智能辅助。适合快速创建和优化提示词。
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs px-2 py-1 bg-teal-100 text-teal-700 rounded-full">模板快选</span>
                      <span className="text-xs px-2 py-1 bg-teal-100 text-teal-700 rounded-full">AI 优化</span>
                      <span className="text-xs px-2 py-1 bg-teal-100 text-teal-700 rounded-full">AI 生成</span>
                      <span className="text-xs px-2 py-1 bg-teal-100 text-teal-700 rounded-full">风格设置</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer transition-all hover:shadow-md border-2 ${
                editMode === 'professional' ? 'border-purple-500 bg-purple-50/50' : 'border-gray-200 hover:border-purple-300'
              }`}
              onClick={() => handleModeChange('professional')}
            >
              <CardContent className="p-6">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <Settings2 className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">专业模式</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      完全自主控制，高度自定义。适合精细化提示词工程。
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">角色设定</span>
                      <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">约束条件</span>
                      <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">变量系统</span>
                      <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">AI 优化</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 编辑器内容 */}
              {editMode === 'normal' ? (
          <NormalEditor
            data={normalData}
            onChange={setNormalData}
            onSave={handleSave}
            loading={loading}
            onOpenOptimizer={featureFlags.promptOptimizerV2 ? handleOpenOptimizer : undefined}
            tags={tags}
            onTagsChange={setTags}
            availableTags={availableTags}
          />
        ) : (
          <ProfessionalEditor
            data={professionalData}
            onChange={setProfessionalData}
            onSave={handleSave}
            loading={loading}
            onOpenOptimizer={featureFlags.promptOptimizerV2 ? handleOpenOptimizer : undefined}
            tags={tags}
            onTagsChange={setTags}
            availableTags={availableTags}
          />
        )}

        {/* 底部固定操作栏 */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 mt-8">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* 公开/私有切换 */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsPublic(prev => !prev)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isPublic
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {isPublic ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  <span>{isPublic ? '公开' : '私有'}</span>
                </button>
              </div>

              {/* 版本历史按钮（仅编辑模式） */}
              {prompt && (
                <VersionHistory
                  promptId={prompt.id}
                  onRestore={onVersionRestore}
                />
              )}

              <Button variant="outline" onClick={onCancel} disabled={loading}>
                取消
              </Button>
            </div>
            
            <div className="flex items-center space-x-4">
              {editMode === 'normal' && (
                <div className="text-sm text-gray-600">
                  {normalData.objective ? `已输入 ${normalData.objective.length} 字符` : '请输入提示词内容'}
                </div>
              )}
              
              <Button
                onClick={handleSave}
                disabled={!canSave || loading}
                className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-2"
                size="lg"
              >
                <Save className="h-4 w-4 mr-2" />
                {loading ? '保存中...' : '保存提示词'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

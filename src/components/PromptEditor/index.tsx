'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import {
  Save,
  ArrowLeft,
  Wand2,
  Settings2,
  Globe,
  Lock,
} from 'lucide-react'
import { EditMode, NormalModeData, ProfessionalModeData, Prompt } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import NormalEditor from './NormalEditor'
import ProfessionalEditor from './ProfessionalEditor'
import VersionHistory from '@/components/VersionHistory'

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
  const { user } = useAuth()
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
    constraints: [],
    examples: [],
    variables: {}
  })
  const [aiOptimizing, setAiOptimizing] = useState(false)
  const [isPublic, setIsPublic] = useState(false)
  const [tags, setTags] = useState<string[]>([])
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
    const finalContent = editMode === 'normal' ? generateNormalPrompt() : professionalData.content

    const saveData = {
      title: currentData.title,
      content: finalContent,
      mode: editMode,
      tags: tags,
      is_public: isPublic,
    }
    }

    onSave(saveData)
  }

  const canSave = editMode === 'normal'
    ? normalData.title && normalData.objective
    : professionalData.title && professionalData.content

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
            aiOptimizing={aiOptimizing}
            onAiOptimizingChange={setAiOptimizing}
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

              {/* 版本历史按钮（仅编辑模式）*/}
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

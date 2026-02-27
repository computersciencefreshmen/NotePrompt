'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'

import { Badge } from '@/components/ui/badge'
import { Loader2, Upload, CheckCircle, AlertCircle, Search } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'

interface ParsedPrompt {
  title: string
  content: string
  category: string
  tags: string[]
  description: string
}

export default function BatchImportPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [inputText, setInputText] = useState('')
  const [parsedPrompts, setParsedPrompts] = useState<ParsedPrompt[]>([])
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<{id: number; title: string; content: string}[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // 自动识别类别和标签的函数
  const detectCategoryAndTags = (title: string, content: string): { category: string; tags: string[] } => {
    const text = (title + ' ' + content).toLowerCase()
    
    // 类别识别规则
    const categoryRules = [
      { keywords: ['医生', '医疗', '诊断', '症状', '患�?, '治疗'], category: '专业领域' },
      { keywords: ['翻译', '语言', '英语', '中文', '阿拉伯语'], category: '学习教育' },
      { keywords: ['代码', '编程', '开�?, 'docker', '终端', 'linux'], category: '编程开�? },
      { keywords: ['写作', '文案', '创作', '文章'], category: 'AI写作' },
      { keywords: ['营销', '推广', '商业', '产品'], category: '商业营销' },
      { keywords: ['设计', '创意', '艺术', '视觉'], category: '创意设计' },
      { keywords: ['数据', '分析', '统计', '报告'], category: '数据分析' },
      { keywords: ['学习', '教育', '培训', '教学'], category: '学习教育' },
      { keywords: ['生活', '助手', '日常', '工具'], category: '生活助手' }
    ]

    // 标签识别规则
    const tagRules = [
      { keywords: ['医生', '医疗', '诊断'], tags: ['医疗健康', '专业咨询'] },
      { keywords: ['翻译', '语言'], tags: ['语言翻译', '跨文化交�?] },
      { keywords: ['代码', '编程', '开�?], tags: ['技术开�?, '编程'] },
      { keywords: ['写作', '文案'], tags: ['内容创作', '文案写作'] },
      { keywords: ['营销', '推广'], tags: ['营销策划', '商业推广'] },
      { keywords: ['设计', '创意'], tags: ['创意设计', '视觉设计'] },
      { keywords: ['数据', '分析'], tags: ['数据分析', '统计报告'] },
      { keywords: ['学习', '教育'], tags: ['学习教育', '知识问答'] },
      { keywords: ['生活', '助手'], tags: ['生活助手', '实用工具'] }
    ]

    // 识别类别
    let detectedCategory = '生活助手' // 默认类别
    for (const rule of categoryRules) {
      if (rule.keywords.some(keyword => text.includes(keyword))) {
        detectedCategory = rule.category
        break
      }
    }

    // 识别标签
    const detectedTags: string[] = []
    for (const rule of tagRules) {
      if (rule.keywords.some(keyword => text.includes(keyword))) {
        detectedTags.push(...rule.tags)
      }
    }

    // 添加一些通用标签
    if (text.includes('ai') || text.includes('人工智能')) {
      detectedTags.push('AI助手')
    }
    if (text.includes('扮演') || text.includes('角色')) {
      detectedTags.push('角色扮演')
    }

    return {
      category: detectedCategory,
      tags: [...new Set(detectedTags)] // 去重
    }
  }

  // 解析输入的文�?  const parseInput = () => {
    if (!inputText.trim()) {
      toast({ description: '请输入要导入的提示词内容', variant: 'destructive' })
      return
    }

    try {
      const lines = inputText.split('\n')
      const prompts: ParsedPrompt[] = []
      let currentPrompt: Partial<ParsedPrompt> = {}
      let currentContent = ''

      for (const line of lines) {
        const trimmedLine = line.trim()
        
        if (!trimmedLine) continue

        // 检测是否是新的提示词标题（通常以大写字母开头，不包含特殊字符）
        if (/^[A-Z\u4e00-\u9fa5][^：]*$/.test(trimmedLine) && !trimmedLine.includes('我希�?) && !trimmedLine.includes('扮演')) {
          // 保存前一个提示词
          if (currentPrompt.title && currentContent) {
            const { category, tags } = detectCategoryAndTags(currentPrompt.title, currentContent)
            prompts.push({
              title: currentPrompt.title,
              content: currentContent.trim(),
              category,
              tags,
              description: currentContent.slice(0, 100) + '...'
            })
          }

          // 开始新的提示词
          currentPrompt = { title: trimmedLine }
          currentContent = ''
        } else {
          // 添加到当前提示词的内�?          currentContent += line + '\n'
        }
      }

      // 保存最后一个提示词
      if (currentPrompt.title && currentContent) {
        const { category, tags } = detectCategoryAndTags(currentPrompt.title, currentContent)
        prompts.push({
          title: currentPrompt.title,
          content: currentContent.trim(),
          category,
          tags,
          description: currentContent.slice(0, 100) + '...'
        })
      }

      setParsedPrompts(prompts)
    } catch (err) {
      toast({ description: '解析失败，请检查输入格�?, variant: 'destructive' })
    }
  }

  // 搜索提示�?  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      toast({ description: '请输入搜索关键词', variant: 'destructive' })
      return
    }

    setSearchLoading(true)
    try {
      const response = await api.prompts.list({
        search: searchTerm,
        page: 1,
        limit: 20
      })

      if (response.success && response.data) {
        setSearchResults(response.data.items)
        toast({ description: `找到 ${response.data.items.length} 个提示词`, variant: 'default' })
      } else {
        setSearchResults([])
        toast({ description: '搜索失败', variant: 'destructive' })
      }
    } catch (error) {
      console.error('搜索失败:', error)
      toast({ description: '搜索失败，请稍后重试', variant: 'destructive' })
    } finally {
      setSearchLoading(false)
    }
  }

  // 批量导入提示�?  const handleBatchImport = async () => {
    if (parsedPrompts.length === 0) {
      toast({ description: '没有可导入的提示�?, variant: 'destructive' })
      return
    }

    setImporting(true)

    try {
      let successCount = 0
      
      for (const prompt of parsedPrompts) {
        try {
          // 获取默认文件�?          const foldersResponse = await api.folders.list()
          if (!foldersResponse.success || !foldersResponse.data || foldersResponse.data.length === 0) {
            throw new Error('请先创建一个文件夹')
          }

          const defaultFolder = foldersResponse.data[0]

          // 获取类别ID
          const categoriesResponse = await api.categories.list()
          let categoryId: number | undefined = undefined
          if (categoriesResponse.success && categoriesResponse.data) {
            const category = categoriesResponse.data.find(cat => cat.name === prompt.category)
            if (category) {
              categoryId = category.id
            }
          }

          // 创建提示�?          const createResponse = await api.prompts.create({
            title: prompt.title,
            content: prompt.content,
            folder_id: defaultFolder.id,
            category_id: categoryId,
            tags: prompt.tags
          })

          if (createResponse.success) {
            successCount++
          }
        } catch (err) {
          console.error(`Failed to import prompt "${prompt.title}":`, err)
        }
      }

      setImportedCount(successCount)
      setParsedPrompts([])
      setInputText('')
      
      // 导入成功
    } catch (err) {
      toast({ description: '导入失败，请稍后重试', variant: 'destructive' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">批量导入提示�?/h1>
          <p className="text-gray-600">
            粘贴您收集的优秀提示词，系统将自动识别类别和标签
          </p>
          
          {/* 搜索功能 */}
          <div className="mt-6 p-4 bg-white rounded-lg border">
            <h2 className="text-lg font-semibold mb-4">搜索现有提示�?/h2>
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <Input
                  placeholder="搜索提示�?.."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              <Button onClick={handleSearch} disabled={searchLoading}>
                {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                搜索
              </Button>
            </div>
            
            {/* 搜索结果 */}
            {searchResults.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">搜索结果:</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {searchResults.map((prompt) => (
                    <div key={prompt.id} className="p-3 bg-gray-50 rounded border">
                      <h4 className="font-medium text-sm">{prompt.title}</h4>
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">{prompt.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 输入区域 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                输入提示�?              </CardTitle>
              <CardDescription>
                粘贴您收集的提示词，每行一个标题，系统会自动解�?              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="粘贴您的提示词内容，例如�?AI 辅助医生
我希望你扮演一�?AI 辅助医生...

AI 试图逃离盒子
[免责声明：发出此提示�?.."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="min-h-[300px]"
              />
              
              <div className="flex gap-2">
                <Button onClick={parseInput} disabled={!inputText.trim()}>
                  解析提示�?                </Button>
                <Button 
                  onClick={handleBatchImport} 
                  disabled={parsedPrompts.length === 0 || importing}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      导入�?..
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      批量导入 ({parsedPrompts.length})
                    </>
                  )}
                </Button>
              </div>



              {importedCount > 0 && (
                <div className="text-center text-green-600 py-4">
                  <CheckCircle className="h-6 w-6 inline-block mr-2" />
                  成功导入 {importedCount} 个提示词�?                </div>
              )}
            </CardContent>
          </Card>

          {/* 预览区域 */}
          <Card>
            <CardHeader>
              <CardTitle>解析预览</CardTitle>
              <CardDescription>
                系统自动识别的类别和标签
              </CardDescription>
            </CardHeader>
            <CardContent>
              {parsedPrompts.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  解析后将在这里显示预�?                </div>
              ) : (
                <div className="space-y-4 max-h-[500px] overflow-y-auto">
                  {parsedPrompts.map((prompt, index) => (
                    <Card key={`parsed-prompt-${index}`} className="border-gray-200">
                      <CardContent className="p-4">
                        <h3 className="font-semibold text-gray-900 mb-2">
                          {prompt.title}
                        </h3>
                        <p className="text-sm text-gray-600 mb-3">
                          {prompt.description}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                            {prompt.category}
                          </Badge>
                          {prompt.tags.map((tag, tagIndex) => (
                            <Badge key={`batch-tag-${index}-${tagIndex}`} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 text-center">
          <Button 
            variant="outline" 
            onClick={() => router.push('/prompts')}
          >
            返回提示词列�?          </Button>
        </div>
      </div>
    </div>
  )
} 
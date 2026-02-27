'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Header from '@/components/Header'
import { PublicPrompt } from '@/types'
import { api } from '@/lib/api'
import { 
  ArrowLeft, 
  FileText, 
  User, 
  Calendar, 
  Copy, 
  Check,
  Eye,
  Loader2,
  Heart,
  Download
} from 'lucide-react'

export default function PublicPromptDetailPage() {
  const params = useParams()
  const router = useRouter()
  const promptId = parseInt(params.id as string)
  
  const [prompt, setPrompt] = useState<PublicPrompt | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (promptId) {
      fetchPromptDetail()
    }
  }, [promptId])

  const fetchPromptDetail = async () => {
    setLoading(true)
    try {
      const response = await api.publicPrompts.get(promptId)
      if (response.success && response.data) {
        setPrompt(response.data)
      }
    } catch (error) {
      console.error('Failed to fetch prompt detail:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCopyPrompt = async () => {
    if (!prompt) return
    
    try {
      await navigator.clipboard.writeText(prompt.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy prompt:', error)
    }
  }

  const handleFavorite = async () => {
    if (!prompt) return
    
    try {
      // 这里需要实现收藏功能
    } catch (error) {
      console.error('Failed to favorite prompt:', error)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return ''
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <Header />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">正在加载提示词详情...</span>
          </div>
        </main>
      </div>
    )
  }

  if (!prompt) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <Header />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">提示词不存在</h1>
            <Button onClick={() => router.push('/public-prompts')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回提示词列表
            </Button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 返回按钮 */}
        <div className="mb-6">
          <Button
            onClick={() => router.push('/public-prompts')}
            variant="outline"
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回提示词列表
          </Button>
        </div>

        {/* 提示词详情 */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <FileText className="h-8 w-8 text-blue-600" />
                <div>
                  <CardTitle className="text-2xl font-bold">{prompt.title}</CardTitle>
                  <div className="flex items-center space-x-4 text-sm text-gray-500 mt-2">
                    <div className="flex items-center space-x-1">
                      <User className="h-4 w-4" />
                      <span>{prompt.author}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-4 w-4" />
                      <span>{formatDate(prompt.created_at)}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Eye className="h-4 w-4" />
                      <span>{prompt.views_count || 0} 次浏览</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  onClick={handleFavorite}
                  variant="outline"
                  size="sm"
                >
                  <Heart className="h-4 w-4 mr-1" />
                  收藏
                </Button>
                <Button
                  onClick={handleCopyPrompt}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  size="sm"
                >
                  {copied ? (
                    <Check className="h-4 w-4 mr-1" />
                  ) : (
                    <Copy className="h-4 w-4 mr-1" />
                  )}
                  {copied ? '已复制' : '复制'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 描述 */}
            {prompt.description && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">描述</h3>
                <p className="text-gray-700 leading-relaxed">
                  {prompt.description}
                </p>
              </div>
            )}

            {/* 提示词内容 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">提示词内容</h3>
                <Button
                  onClick={handleCopyPrompt}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {copied ? (
                    <Check className="h-4 w-4 mr-1" />
                  ) : (
                    <Copy className="h-4 w-4 mr-1" />
                  )}
                  {copied ? '已复制' : '复制'}
                </Button>
              </div>
              <div className="bg-gray-50 p-6 rounded-lg border">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono leading-relaxed">
                  {prompt.content}
                </pre>
              </div>
            </div>

            {/* 统计信息 */}
            <div className="flex items-center space-x-6 text-sm text-gray-600 pt-4 border-t">
              <div className="flex items-center space-x-1">
                <Heart className="h-4 w-4" />
                <span>收藏: {prompt.favorites_count || 0}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Eye className="h-4 w-4" />
                <span>浏览: {prompt.views_count || 0}</span>
              </div>
              {prompt.favorites_count !== undefined && (
                <div className="flex items-center space-x-1">
                  <Download className="h-4 w-4" />
                  <span>收藏: {prompt.favorites_count}</span>
                </div>
              )}
            </div>

            {/* 标签 */}
            {prompt.tags && prompt.tags.length > 0 && (
              <div className="flex items-center space-x-2 pt-4 border-t">
                <span className="text-sm font-medium text-gray-700">标签:</span>
                {prompt.tags.map((tag, index) => (
                  <span
                    key={`public-detail-tag-${prompt.id}-${index}`}
                    className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 相关提示词推荐 */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            相关推荐
          </h2>
          <div className="text-center py-8 text-gray-600">
            <FileText className="h-12 w-12 mx-auto text-gray-400 mb-2" />
            <p>相关推荐功能开发中...</p>
          </div>
        </div>
      </main>
    </div>
  )
} 
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Header from '@/components/Header'
import { PublicPrompt } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'
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
import { detectLocaleFromSearch, Locale, withLocaleHref } from '@/lib/i18n'

const promptDetailCopy = {
  zh: {
    loginToFavorite: '请先登录后再收藏',
    unfavorited: '已取消收藏',
    favorited: '收藏成功',
    favoriteFailed: '收藏失败',
    actionFailed: '操作失败，请稍后重试',
    loading: '正在加载提示词详情...',
    notFound: '提示词不存在',
    back: '返回提示词列表',
    views: (count: number) => `${count} 次浏览`,
    processing: '处理中...',
    favoritedButton: '已收藏',
    favorite: '收藏',
    copied: '已复制',
    copy: '复制',
    description: '描述',
    content: '提示词内容',
    favoritesStat: (count: number) => `收藏: ${count}`,
    viewsStat: (count: number) => `浏览: ${count}`,
    tags: '标签:',
    dateLocale: 'zh-CN',
  },
  en: {
    loginToFavorite: 'Log in before saving prompts.',
    unfavorited: 'Removed from favorites',
    favorited: 'Saved to favorites',
    favoriteFailed: 'Could not save favorite',
    actionFailed: 'Action failed. Please try again later.',
    loading: 'Loading prompt details...',
    notFound: 'Prompt not found',
    back: 'Back to prompt library',
    views: (count: number) => `${count} view${count === 1 ? '' : 's'}`,
    processing: 'Processing...',
    favoritedButton: 'Saved',
    favorite: 'Save',
    copied: 'Copied',
    copy: 'Copy',
    description: 'Description',
    content: 'Prompt content',
    favoritesStat: (count: number) => `Saves: ${count}`,
    viewsStat: (count: number) => `Views: ${count}`,
    tags: 'Tags:',
    dateLocale: 'en-US',
  },
}

export default function PublicPromptDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const promptId = parseInt(params.id as string)
  const [locale, setLocale] = useState<Locale>('zh')
  const [localeReady, setLocaleReady] = useState(false)
  const copy = promptDetailCopy[locale]
  const href = (path: string) => withLocaleHref(path, locale)
  
  const [prompt, setPrompt] = useState<PublicPrompt | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [isFavorited, setIsFavorited] = useState(false)
  const [favoriting, setFavoriting] = useState(false)

  useEffect(() => {
    setLocale(detectLocaleFromSearch())
    setLocaleReady(true)
  }, [])

  useEffect(() => {
    if (promptId && localeReady) {
      fetchPromptDetail()
    }
  }, [promptId, locale, localeReady])

  // 检查当前用户是否已收藏
  useEffect(() => {
    if (user && promptId) {
      checkFavoriteStatus()
    }
  }, [user, promptId])

  const checkFavoriteStatus = async () => {
    try {
      const response = await api.favorites.list(1, 200)
      if (response.success && response.data?.items) {
        const found = response.data.items.some((item: PublicPrompt) => item.id === promptId)
        setIsFavorited(found)
      }
    } catch {
      // 未登录或请求失败忽略
    }
  }

  const fetchPromptDetail = async () => {
    setLoading(true)
    try {
      const response = await api.publicPrompts.get(promptId, locale)
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

    if (!user) {
      toast({ description: copy.loginToFavorite, variant: 'destructive' })
      router.push(href('/login'))
      return
    }

    setFavoriting(true)
    try {
      if (isFavorited) {
        const response = await api.favorites.remove(prompt.id)
        if (response.success) {
          setIsFavorited(false)
          setPrompt({ ...prompt, favorites_count: Math.max(0, (prompt.favorites_count || 0) - 1) })
          toast({ description: copy.unfavorited })
        }
      } else {
        const response = await api.favorites.add(prompt.id)
        if (response.success) {
          setIsFavorited(true)
          setPrompt({ ...prompt, favorites_count: (prompt.favorites_count || 0) + 1 })
          toast({ description: copy.favorited })
        } else {
          toast({ description: ('error' in response ? response.error : copy.favoriteFailed) || copy.favoriteFailed, variant: 'destructive' })
        }
      }
    } catch (error) {
      console.error('Failed to favorite prompt:', error)
      toast({ description: copy.actionFailed, variant: 'destructive' })
    } finally {
      setFavoriting(false)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString(copy.dateLocale, {
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
            <span className="ml-2 text-gray-600">{copy.loading}</span>
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
            <h1 className="text-2xl font-bold text-gray-900 mb-4">{copy.notFound}</h1>
            <Button onClick={() => router.push(href('/public-prompts'))}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {copy.back}
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
            onClick={() => router.push(href('/public-prompts'))}
            variant="outline"
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {copy.back}
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
                      <span>{copy.views(prompt.views_count || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {locale === 'zh' && (
                  <Button
                    onClick={handleFavorite}
                    variant={isFavorited ? 'default' : 'outline'}
                    size="sm"
                    disabled={favoriting}
                    className={isFavorited ? 'bg-red-500 hover:bg-red-600 text-white' : ''}
                  >
                    <Heart className={`h-4 w-4 mr-1 ${isFavorited ? 'fill-current' : ''}`} />
                    {favoriting ? copy.processing : isFavorited ? copy.favoritedButton : copy.favorite}
                  </Button>
                )}
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
                  {copied ? copy.copied : copy.copy}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 描述 */}
            {prompt.description && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">{copy.description}</h3>
                <p className="text-gray-700 leading-relaxed">
                  {prompt.description}
                </p>
              </div>
            )}

            {/* 提示词内容 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">{copy.content}</h3>
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
                  {copied ? copy.copied : copy.copy}
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
                <span>{copy.favoritesStat(prompt.favorites_count || 0)}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Eye className="h-4 w-4" />
                <span>{copy.viewsStat(prompt.views_count || 0)}</span>
              </div>
            </div>

            {/* 标签 */}
            {prompt.tags && prompt.tags.length > 0 && (
              <div className="flex items-center space-x-2 pt-4 border-t">
                <span className="text-sm font-medium text-gray-700">{copy.tags}</span>
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


      </main>
    </div>
  )
} 
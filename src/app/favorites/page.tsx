'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import PromptCard from '@/components/PromptCard'
import Header from '@/components/Header'
import { PublicPrompt } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { Star, Heart, Loader2, BookOpen, Search, Sparkles, TrendingUp, Users, Zap, ArrowRight, Plus, User } from 'lucide-react'
import { detectLocaleFromSearch, Locale, withLocaleHref } from '@/lib/i18n'

const favoritesCopy = {
  zh: {
    fetchFailedTitle: '获取失败',
    fetchFailedDesc: '获取收藏列表失败，请稍后重试',
    deleteSuccessTitle: '删除成功',
    deleteSuccessDesc: '已从收藏列表中删除',
    deleteFailedTitle: '删除失败',
    deleteFailedDesc: '删除收藏失败',
    addSuccessTitle: '添加成功',
    addSuccessDesc: '已添加到收藏列表',
    addFailedTitle: '添加失败',
    addFailedDesc: '添加收藏失败',
    title: '我的收藏',
    subtitle: '您收藏的优质提示词，随时可用',
    discover: '发现更多',
    browseAll: '浏览全部',
    favoriteCount: '收藏数量',
    popular: '热门',
    recommended: '推荐内容',
    community: '社区',
    sharedResources: '共享资源',
    loadingFavorites: '正在加载收藏...',
    emptyTitle: '暂无收藏',
    emptyText: '开始收藏您喜欢的提示词吧',
    discoverQuality: '发现优质提示词',
    dialogTitle: '发现更多优质提示词',
    whyTitle: '为什么推荐这些提示词？',
    highSaveRate: '高收藏率',
    hotContent: '热门内容',
    communityPicked: '社区精选',
    loadingRecommendations: '正在加载推荐内容...',
    save: '收藏',
    dateLocale: 'zh-CN',
  },
  en: {
    fetchFailedTitle: 'Could not load favorites',
    fetchFailedDesc: 'Your favorites could not be loaded. Please try again later.',
    deleteSuccessTitle: 'Removed',
    deleteSuccessDesc: 'The prompt was removed from your favorites.',
    deleteFailedTitle: 'Remove failed',
    deleteFailedDesc: 'Could not remove this favorite.',
    addSuccessTitle: 'Saved',
    addSuccessDesc: 'The prompt was added to your favorites.',
    addFailedTitle: 'Save failed',
    addFailedDesc: 'Could not save this prompt.',
    title: 'Favorites',
    subtitle: 'Your saved prompt assets, ready to reuse anytime.',
    discover: 'Discover more',
    browseAll: 'Browse all',
    favoriteCount: 'Saved prompts',
    popular: 'Popular',
    recommended: 'Recommended',
    community: 'Community',
    sharedResources: 'Shared resources',
    loadingFavorites: 'Loading favorites...',
    emptyTitle: 'No favorites yet',
    emptyText: 'Save prompts you want to reuse later.',
    discoverQuality: 'Discover prompts',
    dialogTitle: 'Discover more prompts',
    whyTitle: 'Why these recommendations?',
    highSaveRate: 'High save rate',
    hotContent: 'Popular content',
    communityPicked: 'Curated picks',
    loadingRecommendations: 'Loading recommendations...',
    save: 'Save',
    dateLocale: 'en-US',
  },
}

export default function FavoritesPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const [locale] = useState<Locale>(() => detectLocaleFromSearch())
  const copy = favoritesCopy[locale]
  const href = (path: string) => withLocaleHref(path, locale)
  const [favorites, setFavorites] = useState<PublicPrompt[]>([])
  const [loading, setLoading] = useState(false)
  const [showDiscoverDialog, setShowDiscoverDialog] = useState(false)
  const [discoverPrompts, setDiscoverPrompts] = useState<PublicPrompt[]>([])
  const [discoverLoading, setDiscoverLoading] = useState(false)

  // 检查登录状态
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(withLocaleHref('/login', locale))
      return
    }
  }, [user, authLoading, router, locale])

  // 获取收藏列表
  const fetchFavorites = async () => {
    if (!user) return

    setLoading(true)

    try {
      const response = await api.favorites.list(1, 1000) // 一次性加载大量数据
      if (response.success && response.data) {
        setFavorites(response.data.items)
      } else {
        toast({
          title: copy.fetchFailedTitle,
          description: response.error || copy.fetchFailedDesc,
          variant: 'destructive',
        })
      }
    } catch (err) {
      console.error('Failed to fetch favorites:', err)
      toast({
        title: copy.fetchFailedTitle,
        description: copy.fetchFailedDesc,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // 获取推荐提示词
  const fetchDiscoverPrompts = async () => {
    setDiscoverLoading(true)
    try {
      const response = await api.publicPrompts.list({
        sort: 'favorites',
        lang: locale,
        page: 1,
        limit: 6
      })
      
      if (response.success && response.data) {
        // 过滤掉已经收藏的提示词
        const favoriteIds = new Set(favorites.map(f => f.id))
        const filteredPrompts = response.data.items.filter(p => !favoriteIds.has(p.id))
        setDiscoverPrompts(filteredPrompts.slice(0, 6))
      }
    } catch (error) {
      console.error('获取推荐提示词失败', error)
    } finally {
      setDiscoverLoading(false)
    }
  }

  // 初始加载
  useEffect(() => {
    if (user) {
      fetchFavorites()
    }
  }, [user])

  // 处理收藏变化
  const handleFavoriteChange = () => {
    // 重新加载收藏列表
    fetchFavorites()
  }

  // 新增 handleDeleteFavorite 方法
  const handleDeleteFavorite = async (promptId: number) => {
    try {
      await api.favorites.remove(promptId)
      
      // API调用成功后再从UI中移除
      setFavorites(prev => prev.filter(p => p.id !== promptId))
      
      toast({
        title: copy.deleteSuccessTitle,
        description: copy.deleteSuccessDesc,
        variant: 'success',
      })
    } catch (error) {
      toast({
        title: copy.deleteFailedTitle,
        description: copy.deleteFailedDesc,
        variant: 'destructive',
      })
    }
  }

  // 打开发现更多对话框
  const handleDiscoverMore = () => {
    setShowDiscoverDialog(true)
    fetchDiscoverPrompts()
  }

  // 导入提示词到收藏
  const handleImportToFavorites = async (promptId: number) => {
    try {
      await api.favorites.add(promptId)
      toast({
        title: copy.addSuccessTitle,
        description: copy.addSuccessDesc,
        variant: 'success',
      })
      // 重新加载收藏列表
      fetchFavorites()
    } catch (error) {
      toast({
        title: copy.addFailedTitle,
        description: copy.addFailedDesc,
        variant: 'destructive',
      })
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <Header />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 页面标题和操作区 */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Star className="h-8 w-8 text-yellow-500 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{copy.title}</h1>
          </div>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-6">
            {copy.subtitle}
          </p>
          
          {/* 操作按钮 */}
          <div className="flex justify-center gap-4">
            <Button
              onClick={handleDiscoverMore}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3"
              size="lg"
            >
              <Sparkles className="h-5 w-5 mr-2" />
              {copy.discover}
            </Button>
            <Button
              onClick={() => router.push(href('/public-prompts'))}
              variant="outline"
              className="border-blue-600 text-blue-600 hover:bg-blue-50 px-6 py-3"
              size="lg"
            >
              <BookOpen className="h-5 w-5 mr-2" />
              {copy.browseAll}
            </Button>
          </div>
        </div>

        {/* 统计信息 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-center">
                <Star className="h-8 w-8 text-blue-600 mr-4" />
                <div>
                  <p className="text-2xl font-bold text-blue-900">{favorites.length}</p>
                  <p className="text-sm text-blue-700">{copy.favoriteCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-6">
              <div className="flex items-center">
                <TrendingUp className="h-8 w-8 text-green-600 mr-4" />
                <div>
                  <p className="text-2xl font-bold text-green-900">{copy.popular}</p>
                  <p className="text-sm text-green-700">{copy.recommended}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-purple-600 mr-4" />
                <div>
                  <p className="text-2xl font-bold text-purple-900">{copy.community}</p>
                  <p className="text-sm text-purple-700">{copy.sharedResources}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>



        {/* 收藏列表 */}
        {loading && favorites.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">{copy.loadingFavorites}</span>
          </div>
        ) : (
          <>
            {favorites.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {favorites.map((prompt) => (
                  <PromptCard
                    key={prompt.id}
                    prompt={prompt}
                    type="public"
                    onFavoriteChange={handleFavoriteChange}
                    onDelete={handleDeleteFavorite}
                    locale={locale}
                  />
                ))}
              </div>
            ) : (
              <Card className="text-center py-12">
                <CardContent>
                  <Star className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <h3 className="text-xl font-medium text-gray-900 dark:text-gray-100 mb-2">{copy.emptyTitle}</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">{copy.emptyText}</p>
                  <Button
                    onClick={handleDiscoverMore}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    {copy.discoverQuality}
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>

      {/* 发现更多对话框 */}
      <Dialog open={showDiscoverDialog} onOpenChange={setShowDiscoverDialog}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center">
              <Sparkles className="h-6 w-6 mr-2 text-blue-600" />
              {copy.dialogTitle}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* 推荐理由 */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">{copy.whyTitle}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center">
                  <Zap className="h-5 w-5 text-yellow-500 mr-2" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{copy.highSaveRate}</span>
                </div>
                <div className="flex items-center">
                  <TrendingUp className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{copy.hotContent}</span>
                </div>
                <div className="flex items-center">
                  <Users className="h-5 w-5 text-blue-500 mr-2" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{copy.communityPicked}</span>
                </div>
              </div>
            </div>

            {/* 推荐提示词列表 */}
            {discoverLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <span className="ml-2 text-gray-600 dark:text-gray-400">{copy.loadingRecommendations}</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {discoverPrompts.map((prompt) => (
                  <Card key={prompt.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg line-clamp-2">{prompt.title}</CardTitle>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                            {prompt.description || prompt.content.substring(0, 100)}...
                          </p>
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                            <Star className="h-4 w-4 mr-1" />
                            {prompt.favorites_count || 0}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                          <User className="h-4 w-4 mr-1" />
                          {prompt.author}
                        </div>
                        <Button
                          onClick={() => handleImportToFavorites(prompt.id)}
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          {copy.save}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* 底部操作 */}
            <div className="flex justify-center pt-6 border-t">
              <Button
                onClick={() => router.push(href('/public-prompts'))}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                size="lg"
              >
                {copy.browseAll}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

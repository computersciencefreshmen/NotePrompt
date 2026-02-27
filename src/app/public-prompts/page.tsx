'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import PromptCard from '@/components/PromptCard'
import Header from '@/components/Header'
import { PublicPrompt, PublicPromptQueryParams, Category } from '@/types'
import { api } from '@/lib/api'
import { Filter, Loader2, Copy, Check, X, ArrowUp } from 'lucide-react'
import { SearchInput } from '@/components/ui/search-input'

export default function PublicPromptsPage() {
  const [prompts, setPrompts] = useState<PublicPrompt[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTag, setSelectedTag] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [selectedPrompt, setSelectedPrompt] = useState<PublicPrompt | null>(null)
  const [showPromptDialog, setShowPromptDialog] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)
  // 在组件顶部 state 区域添加排序相关 state
  const [sort, setSort] = useState<'favorites' | 'latest'>('favorites')

  const fetchPrompts = async (params: PublicPromptQueryParams = {}) => {
    setLoading(true)
    try {
      const response = await api.publicPrompts.list({
        search: searchTerm || undefined,
        tag: selectedTag || undefined,
        sort: sort, // 使用当前排序
        page: page,
        limit: 12,
        ...params
      })

      if (response.success && response.data) {
        if (params.page === 1) {
          setPrompts(response.data.items)
        } else {
          setPrompts(prev => [...prev, ...response.data!.items])
        }
        setTotalPages(response.data.totalPages)
        setHasMore(response.data.page < response.data.totalPages)
      }
    } catch (error) {
      console.error('Failed to fetch prompts:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const response = await api.categories.list()
      if (response.success && response.data) {
        setCategories(response.data)
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error)
    }
  }

  // 初始加载提示词
  useEffect(() => {
    fetchPrompts({ page: 1 })
  }, [])

  // 排序、搜索、标签变化时自动刷新
  useEffect(() => {
    fetchPrompts({ page: 1 })
  }, [searchTerm, selectedTag, sort])

  // 监听滚动事件，显示/隐藏回到顶部按钮
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // 下拉加载更多
  const handleScroll = useCallback(() => {
    if (loading || !hasMore || typeof window === 'undefined') return

    const scrollTop = window.scrollY
    const windowHeight = window.innerHeight
    const documentHeight = document.documentElement.scrollHeight

    if (scrollTop + windowHeight >= documentHeight - 100) {
      setPage(prev => prev + 1)
      fetchPrompts({ page: page + 1 })
    }
  }, [loading, hasMore, page])

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // 回到顶部
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 搜索处理
  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setSelectedTag('') // 清除标签筛选
    setPage(1)
  }

  // 标签筛选
  const handleTagFilter = (tag: string) => {
    setSelectedTag(tag)
    setPage(1)
    // 不清空 searchTerm，支持组合筛选
  }

  // 清除筛选
  const clearFilters = () => {
    setSearchTerm('')
    setSelectedTag('')
    setPage(1)
  }

  // 处理收藏状态变化
  const handleFavoriteChange = () => {
    // 重新获取数据以更新收藏状态
    fetchPrompts({ page: 1 })
  }

  // 处理提示词点击
  const handlePromptClick = (prompt: PublicPrompt) => {
    setSelectedPrompt(prompt)
    setShowPromptDialog(true)
  }

  // 处理复制提示词
  const handleCopyPrompt = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('复制失败:', error)
    }
  }

  // 处理导入提示词
  const handleImportPrompt = async (promptId: number) => {
    try {
      const response = await api.publicPrompts.import(promptId)
      if (response.success) {
        // 可以添加成功提示
        console.log('导入成功')
      }
    } catch (error) {
      console.error('导入失败:', error)
    }
  }

  // 处理排序变化
  const handleSortChange = (value: 'favorites' | 'latest') => {
    setSort(value)
    setPage(1)
  }

  // 1. 热门标签筛选优化
  const hotTags = ['数据分析', '文案写作', '代码生成', '创意设计', '营销推广', '学习助手']

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 页面标题和操作区 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            公共提示词库
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-6">
            发现和导入由社区贡献的优质AI提示词，提升您的AI交互体验
          </p>
          <div className="flex justify-center gap-4">
            <Button
              onClick={() => window.location.href = '/prompts/new'}
              className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 text-lg"
              size="lg"
            >
              + 创建新提示词
            </Button>
            <Button
              onClick={() => window.location.href = '/prompts'}
              variant="outline"
              className="border-teal-600 text-teal-600 hover:bg-teal-50 px-6 py-3 text-lg"
              size="lg"
            >
              我的提示词
            </Button>
          </div>
        </div>

        {/* 搜索区域 */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">搜索提示词</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 items-center">
              {/* 搜索框 */}
              <div className="flex-1">
                <SearchInput
                  value={searchTerm}
                  onChange={handleSearch}
                  placeholder="搜索提示词标题、内容..."
                  debounceMs={500}
                  onClear={() => setSearchTerm('')}
                />
              </div>
              {/* 排序下拉框 */}
              <div className="w-full md:w-48">
                <select
                  value={sort}
                  onChange={e => handleSortChange(e.target.value as 'favorites' | 'latest')}
                  className="block w-full border-gray-300 rounded-full shadow focus:ring-blue-500 focus:border-blue-500 text-sm px-4 py-2 bg-white hover:border-blue-400 transition-all"
                  style={{ minWidth: 120 }}
                >
                  <option value="favorites">按收藏数排序</option>
                  <option value="latest">按发布时间排序</option>
                </select>
              </div>
            </div>

            {/* 当前筛选状态 */}
            {(searchTerm || selectedTag) && (
              <div className="flex items-center gap-2">
                {selectedTag && (
                  <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                    标签: {selectedTag}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => setSelectedTag('')}
                    />
                  </div>
                )}
                <Button
                  onClick={clearFilters}
                  variant="outline"
                  size="sm"
                >
                  清除筛选
                </Button>
              </div>
            )}

            {/* 标签筛选 */}
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">热门标签</h3>
              <div className="flex flex-wrap gap-2">
                {hotTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleTagFilter(tag)}
                    className={`px-3 py-1 text-sm rounded-full border transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                      selectedTag === tag
                        ? 'bg-blue-100 border-blue-300 text-blue-700'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-400'
                    }`}
                    style={{ minWidth: 70 }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 提示词网格 */}
        {loading && prompts.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">正在加载提示词...</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {prompts.map((prompt) => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  type="public"
                  onFavoriteChange={handleFavoriteChange}
                  onClick={() => handlePromptClick(prompt)}
                  onTagClick={handleTagFilter}
                />
              ))}
            </div>

            {/* 空状态 */}
            {prompts.length === 0 && !loading && (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <Filter className="h-16 w-16 mx-auto" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  未找到相关提示词
                </h3>
                <p className="text-gray-600">
                  尝试调整搜索条件或浏览其他分类
                </p>
              </div>
            )}

            {/* 加载状态 */}
            {loading && prompts.length > 0 && (
              <div className="text-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" />
                <span className="ml-2 text-gray-600">加载更多...</span>
              </div>
            )}
          </>
        )}
      </main>

      {/* 回到顶部按钮 */}
      {showBackToTop && (
        <Button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-50 rounded-full w-12 h-12 shadow-lg bg-blue-600 hover:bg-blue-700 text-white"
          size="sm"
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
      )}

      {/* 提示词详情对话框 */}
      <Dialog open={showPromptDialog} onOpenChange={setShowPromptDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          {selectedPrompt && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">
                  {selectedPrompt.title}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* 提示词信息 */}
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>作者: {selectedPrompt.author}</span>
                  <span>发布时间: {new Date(selectedPrompt.created_at).toLocaleDateString()}</span>
                </div>

                {/* 描述 */}
                {selectedPrompt.description && (
                  <div>
                    <h3 className="font-semibold mb-2">描述</h3>
                    <p className="text-gray-700">{selectedPrompt.description}</p>
                  </div>
                )}

                {/* 分类标签 */}
                {selectedPrompt.category && (
                  <div>
                    <h3 className="font-semibold mb-2">分类</h3>
                    <span
                      className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm cursor-pointer hover:bg-blue-200"
                      onClick={() => {
                        handleTagFilter(selectedPrompt.category)
                        setShowPromptDialog(false)
                      }}
                    >
                      {selectedPrompt.category}
                    </span>
                  </div>
                )}

                {/* 标签 */}
                {selectedPrompt.tags && selectedPrompt.tags.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">标签</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedPrompt.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-block bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm cursor-pointer hover:bg-gray-200"
                          onClick={() => {
                            handleTagFilter(tag)
                            setShowPromptDialog(false)
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 提示词内容 */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold">提示词内容</h3>
                    <Button
                      onClick={() => handleCopyPrompt(selectedPrompt.content)}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4" />
                          已复制
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          复制
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <pre className="whitespace-pre-wrap text-sm">{selectedPrompt.content}</pre>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    onClick={() => setShowPromptDialog(false)}
                    variant="outline"
                  >
                    关闭
                  </Button>
                  <Button
                    onClick={() => handleImportPrompt(selectedPrompt.id)}
                    className="bg-teal-600 hover:bg-teal-700"
                  >
                    导入我的提示词
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
} 
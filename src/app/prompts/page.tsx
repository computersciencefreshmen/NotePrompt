'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Plus, FileText, ArrowUp } from 'lucide-react'
import { SearchInput } from '@/components/ui/search-input'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import Header from '@/components/Header'
import { useToast } from '@/hooks/use-toast'
import { Prompt, Folder, ImportedFolder, PublicPrompt } from '@/types'
import PromptCard, { PromptCardSkeleton } from '@/components/PromptCard'
import { Card, CardContent } from '@/components/ui/card'
import StatsCards from '@/components/StatsCards'
import FolderSection from '@/components/FolderSection'
import { NewFolderDialog, FolderSelectDialog } from '@/components/FolderDialogs'
import { detectLocaleFromSearch, Locale, withLocaleHref } from '@/lib/i18n'

const DEFAULT_USER_STATS = {
  total_prompts: 0,
  total_folders: 0,
  monthly_usage: 0,
  total_favorites: 0,
  ai_optimize_count: 0,
}

const promptsPageCopy = {
  zh: {
    title: '我的提示词',
    subtitle: '管理和优化您的AI提示词库',
    fetchFailedTitle: '获取失败',
    fetchFailedDesc: '获取提示词失败',
    createFolderSuccessTitle: '创建成功',
    createFolderSuccessDesc: '文件夹创建成功',
    createFolderFailedTitle: '创建失败',
    createFolderFailedDesc: '创建文件夹失败',
    addSuccessTitle: '添加成功',
    addSuccessDesc: '提示词已添加到文件夹',
    addFailedTitle: '添加失败',
    addFailedDesc: '添加到文件夹失败',
    duplicateAddDesc: '提示词已在该文件夹中，请勿重复添加',
    retryLater: '请稍后重试',
    deleteSuccessTitle: '删除成功',
    deleteSuccessDesc: '提示词已删除',
    deleteFailedTitle: '删除失败',
    deleteFailedDesc: '删除提示词失败',
    publishSuccessTitle: '发布成功',
    publishPromptSuccessDesc: '提示词已发布到公共库',
    publishFolderSuccessDesc: '文件夹已发布到公共库',
    publishFailedTitle: '发布失败',
    publishPromptFailedDesc: '发布提示词失败',
    publishFolderFailedDesc: '发布文件夹失败',
    sectionTitle: '我的提示词',
    newPrompt: '新建提示词',
    searchPlaceholder: '搜索提示词...',
    folderPlaceholder: '选择文件夹',
    allFolders: '全部文件夹',
    searchResults: (term: string) => `搜索 "${term}" 的结果`,
    loadingLabel: '正在加载提示词',
    emptySearch: (term: string) => `未找到包含 "${term}" 的提示词`,
    clearSearch: '清除搜索',
    empty: '暂无提示词',
    firstPrompt: '创建第一个提示词',
    loadingMore: '加载更多...',
  },
  en: {
    title: 'My Prompts',
    subtitle: 'Manage, organize, and improve your reusable AI prompt library.',
    fetchFailedTitle: 'Unable to load',
    fetchFailedDesc: 'Could not load prompts.',
    createFolderSuccessTitle: 'Folder created',
    createFolderSuccessDesc: 'Your folder is ready.',
    createFolderFailedTitle: 'Create failed',
    createFolderFailedDesc: 'Could not create the folder.',
    addSuccessTitle: 'Added',
    addSuccessDesc: 'The prompt was added to the folder.',
    addFailedTitle: 'Add failed',
    addFailedDesc: 'Could not add the prompt to the folder.',
    duplicateAddDesc: 'This prompt is already in that folder.',
    retryLater: 'Please try again later.',
    deleteSuccessTitle: 'Deleted',
    deleteSuccessDesc: 'The prompt has been deleted.',
    deleteFailedTitle: 'Delete failed',
    deleteFailedDesc: 'Could not delete the prompt.',
    publishSuccessTitle: 'Published',
    publishPromptSuccessDesc: 'The prompt has been published to the public library.',
    publishFolderSuccessDesc: 'The folder has been published to the public library.',
    publishFailedTitle: 'Publish failed',
    publishPromptFailedDesc: 'Could not publish the prompt.',
    publishFolderFailedDesc: 'Could not publish the folder.',
    sectionTitle: 'My prompts',
    newPrompt: 'New prompt',
    searchPlaceholder: 'Search prompts...',
    folderPlaceholder: 'Select folder',
    allFolders: 'All folders',
    searchResults: (term: string) => `Results for "${term}"`,
    loadingLabel: 'Loading prompts',
    emptySearch: (term: string) => `No prompts found for "${term}"`,
    clearSearch: 'Clear search',
    empty: 'No prompts yet',
    firstPrompt: 'Create first prompt',
    loadingMore: 'Loading more...',
  },
}

export default function PromptsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const [locale, setLocale] = useState<Locale>(() => detectLocaleFromSearch())
  const copy = promptsPageCopy[locale]

  useEffect(() => {
    setLocale(detectLocaleFromSearch())
  }, [])

  // 状态管理
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [importedFolders, setImportedFolders] = useState<ImportedFolder[]>([])
  const [userStats, setUserStats] = useState<{
    total_prompts: number;
    total_folders: number;
    monthly_usage: number;
    total_favorites: number;
    ai_optimize_count: number;
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  // 对话框状态
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderLoading, setNewFolderLoading] = useState(false)
  const [showFolderSelectDialog, setShowFolderSelectDialog] = useState(false)
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null)
  const [showBackToTop, setShowBackToTop] = useState(false)

  // 获取用户统计
  const fetchUserStats = async () => {
    try {
      const response = await api.user.getStats()
      if (response.success && response.data) {
        setUserStats(response.data)
      }
    } catch (error) {
      console.warn('Failed to fetch user stats, using fallback stats:', error)
      setUserStats(DEFAULT_USER_STATS)
    }
  }

  // 获取文件夹列表
  const fetchFolders = async () => {
    try {
      const response = await api.folders.list()
      
      if (response.success && response.data) {
        setFolders(response.data)
      }
    } catch (error) {
      console.error('Failed to fetch folders:', error)
    }
  }

  // 获取导入文件夹列表
  const fetchImportedFolders = async () => {
    try {
      const response = await api.user.getImportedFolders()
      
      if (response.success && response.data) {
        setImportedFolders(response.data)
      }
    } catch (error) {
      console.error('Failed to fetch imported folders:', error)
    }
  }

  // 处理查看导入文件夹
  const handleViewImportedFolder = (folder: ImportedFolder) => {
    router.push(`/imported-folders/${folder.id}`)
  }

  // 获取提示词列表
  const fetchPrompts = async (params: {
    search?: string;
    folder_id?: number | undefined;
    page?: number;
    limit?: number;
  } = {}) => {
    setLoading(true)
    try {
      const response = await api.prompts.list({
        search: searchTerm || undefined,
        folder_id: selectedFolderId || undefined,
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
      toast({
        title: copy.fetchFailedTitle,
        description: copy.fetchFailedDesc,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // 创建新文件夹
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    setNewFolderLoading(true)
    try {
      const response = await api.folders.create({
        name: newFolderName.trim(),
        parent_id: null
      })
      if (response.success) {
        toast({
          title: copy.createFolderSuccessTitle,
          description: copy.createFolderSuccessDesc,
          variant: 'success',
        })
        setNewFolderName('')
        setShowNewFolderDialog(false)
        fetchFolders()
      }
    } catch (error) {
      console.error('Failed to create folder:', error)
      toast({
        title: copy.createFolderFailedTitle,
        description: copy.createFolderFailedDesc,
        variant: 'destructive',
      })
    } finally {
      setNewFolderLoading(false)
    }
  }

  // 处理文件夹编辑
  const handleEditFolder = (updatedFolder: Folder) => {
    setFolders(prev => prev.map(f => f.id === updatedFolder.id ? updatedFolder : f))
  }

  // 处理文件夹删除
  const handleDeleteFolder = (folderId: number) => {
    setFolders(prev => prev.filter(f => f.id !== folderId))
    setImportedFolders(prev => prev.filter(f => f.id !== folderId))
  }

  // 拖拽相关状态
  const [dragOverFolder, setDragOverFolder] = useState<number | null>(null)

  // 处理拖拽开始
  const handleDragStart = (e: React.DragEvent, prompt: Prompt | PublicPrompt) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'prompt',
      id: prompt.id,
      title: prompt.title
    }))
  }

  // 处理拖拽悬停
  const handleDragOver = (e: React.DragEvent, folderId: number) => {
    e.preventDefault()
    setDragOverFolder(folderId)
  }

  // 处理拖拽离开
  const handleDragLeave = () => {
    setDragOverFolder(null)
  }

  // 处理拖拽放置
  const handleDrop = async (e: React.DragEvent, folderId: number) => {
    e.preventDefault()
    setDragOverFolder(null)
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      
      if (data.type === 'prompt') {
        const response = await api.folders.addPromptToFolder(folderId, data.id)
        
        if (response.success) {
          toast({
            title: copy.addSuccessTitle,
            description: locale === 'en' ? `Added "${data.title}" to the folder.` : `已将"${data.title}"添加到文件夹`,
            variant: 'success',
          })
          // 刷新提示词列表和文件夹数据
          fetchPrompts({ page: 1 })
          fetchFolders()
          fetchImportedFolders()
          fetchUserStats() // 刷新用户统计
        } else {
          toast({
            title: '添加失败',
            description: response.error || copy.addFailedDesc,
            variant: 'destructive',
          })
        }
      }
    } catch (error) {
      toast({
        title: copy.addFailedTitle,
        description: locale === 'en' ? 'Drag-and-drop failed.' : '拖拽操作失败',
        variant: 'destructive',
      })
    }
  }

  // 处理点选添加到文件夹
  const handleAddToFolder = (promptId: number) => {
    setSelectedPromptId(promptId)
    setShowFolderSelectDialog(true)
  }

  // 处理选择文件夹添加提示词
  const handleSelectFolder = async (folderId: number) => {
    if (!selectedPromptId) return
    
    try {
      const response = await api.folders.addPromptToFolder(folderId, selectedPromptId)
      
      if (response.success) {
        toast({
          title: copy.addSuccessTitle,
          description: copy.addSuccessDesc,
          variant: 'success',
        })
        // 刷新数据
        fetchPrompts({ page: 1 })
        fetchFolders()
        fetchImportedFolders()
        fetchUserStats() // 刷新用户统计
      } else {
        toast({
          title: copy.addFailedTitle,
          description: response.error || copy.addFailedDesc,
          variant: 'destructive',
        })
      }
    } catch (error) {
      // 检查是否是重复添加的错误
      const errorMessage = error instanceof Error ? error.message : copy.addFailedDesc
      if (errorMessage.includes('已在该文件夹中') || errorMessage.includes('重复')) {
        toast({
          title: copy.addFailedTitle,
          description: copy.duplicateAddDesc,
          variant: 'destructive',
        })
      } else {
        toast({
          title: copy.addFailedTitle,
          description: `${copy.addFailedDesc}. ${copy.retryLater}`,
          variant: 'destructive',
        })
      }
    } finally {
      setShowFolderSelectDialog(false)
      setSelectedPromptId(null)
    }
  }

  // 处理删除提示词
  const handleDeletePrompt = async (promptId: number) => {
    try {
      const response = await api.prompts.delete(promptId)
      if (response.success) {
        toast({
          title: copy.deleteSuccessTitle,
          description: copy.deleteSuccessDesc,
          variant: 'success',
        })
        // 刷新提示词列表
        fetchPrompts({ page: 1 })
        // 刷新用户统计
        fetchUserStats()
      } else {
        toast({
          title: '删除失败',
          description: response.error || copy.deleteFailedDesc,
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: copy.deleteFailedTitle,
        description: `${copy.deleteFailedDesc}. ${copy.retryLater}`,
        variant: 'destructive',
      })
    }
  }

  // 处理发布提示词
  const handlePublishPrompt = async (prompt: Prompt) => {
    try {
      const response = await api.prompts.publish(prompt.id)
      if (response.success) {
        toast({
          title: copy.publishSuccessTitle,
          description: copy.publishPromptSuccessDesc,
          variant: 'success',
        })
        // 刷新提示词列表
        fetchPrompts({ page: 1 })
      } else {
        toast({
          title: copy.publishFailedTitle,
          description: response.error || copy.publishPromptFailedDesc,
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: copy.publishFailedTitle,
        description: `${copy.publishPromptFailedDesc}. ${copy.retryLater}`,
        variant: 'destructive',
      })
    }
  }

  // 处理发布文件夹
  const handlePublishFolder = async (folderId: number) => {
    try {
      const response = await api.folders.publish(folderId)
      if (response.success) {
        toast({
          title: copy.publishSuccessTitle,
          description: copy.publishFolderSuccessDesc,
          variant: 'success',
        })
        // 刷新文件夹列表
        fetchFolders()
      } else {
        toast({
          title: copy.publishFailedTitle,
          description: response.error || copy.publishFolderFailedDesc,
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: copy.publishFailedTitle,
        description: `${copy.publishFolderFailedDesc}. ${copy.retryLater}`,
        variant: 'destructive',
      })
    }
  }

  // 初始加载
  useEffect(() => {
    if (user) {
      Promise.all([
        fetchUserStats(),
        fetchFolders(),
        fetchImportedFolders(),
        fetchPrompts({ page: 1 })
      ])
    }
  }, [user])

  // 监听滚动事件，显示/隐藏回到顶部按钮
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // 下拉加载更多
  const handleScroll = useCallback(() => {
    if (loading || !hasMore) return

    const scrollTop = window.scrollY
    const windowHeight = window.innerHeight
    const documentHeight = document.documentElement.scrollHeight

    if (scrollTop + windowHeight >= documentHeight - 100) {
      setPage(prev => prev + 1)
      fetchPrompts({ page: page + 1 })
    }
  }, [loading, hasMore, page])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // 回到顶部
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 处理搜索变化
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value)
  }, [])

  // 搜索和筛选变化时重新加载
  useEffect(() => {
    if (user) {
      setPage(1)
      fetchPrompts({ page: 1 })
    }
  }, [searchTerm, selectedFolderId, user])

  return (
    <ProtectedRoute locale={locale}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <Header />
        
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* 页面标题 */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{copy.title}</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">{copy.subtitle}</p>
            </div>
          </div>

          {/* 统计卡片 */}
          <StatsCards stats={userStats} locale={locale} />

          <div className="space-y-8">
            {/* 文件夹区域 */}
            <div id="folders-section" />
            <FolderSection
              folders={folders}
              importedFolders={importedFolders}
              onCreateFolder={() => setShowNewFolderDialog(true)}
              onEditFolder={handleEditFolder}
              onDeleteFolder={handleDeleteFolder}
              onPublishFolder={handlePublishFolder}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              dragOverFolder={dragOverFolder}
              locale={locale}
            />

            {/* 提示词列表 */}
            <div id="prompts-section">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">{copy.sectionTitle}</h2>
                <div className="flex items-center space-x-2">
                  <Button 
                    onClick={() => router.push(withLocaleHref('/prompts/new', locale))} 
                    className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {copy.newPrompt}
                  </Button>
                </div>
              </div>

              {/* 搜索和筛选 */}
              <Card className="mb-6">
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                      <SearchInput
                        value={searchTerm}
                        onChange={handleSearchChange}
                        placeholder={copy.searchPlaceholder}
                        debounceMs={500}
                        onClear={() => setSearchTerm('')}
                      />
                    </div>
                    <Select value={selectedFolderId?.toString() || 'all'} onValueChange={(value) => setSelectedFolderId(value === 'all' ? null : parseInt(value))}>
                      <SelectTrigger className="w-full md:w-48">
                        <SelectValue placeholder={copy.folderPlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{copy.allFolders}</SelectItem>
                        {folders.map((folder) => (
                          <SelectItem key={folder.id} value={folder.id.toString()}>
                            {folder.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* 搜索状态指示器 */}
              {searchTerm && (
                <div className="mb-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {copy.searchResults(searchTerm)}
                  </p>
                </div>
              )}

              {/* 提示词网格 */}
              {loading && prompts.length === 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-label={copy.loadingLabel}>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <PromptCardSkeleton key={index} />
                  ))}
                </div>
              ) : prompts.length === 0 ? (
                <Card>
                  <CardContent className="py-8">
                    <div className="text-center text-gray-500 dark:text-gray-400">
                      <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                      {searchTerm ? (
                        <>
                          <p>{copy.emptySearch(searchTerm)}</p>
                          <Button 
                            variant="outline" 
                            className="mt-4"
                            onClick={() => {
                              setSearchTerm('')
                            }}
                          >
                            {copy.clearSearch}
                          </Button>
                        </>
                      ) : (
                        <>
                          <p>{copy.empty}</p>
                          <Button 
                            variant="outline" 
                            className="mt-4"
                            onClick={() => router.push(withLocaleHref('/prompts/new', locale))}
                          >
                            {copy.firstPrompt}
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {prompts.map((prompt) => (
                    <PromptCard
                      key={prompt.id}
                      prompt={prompt}
                      type="user"
                      draggable={true}
                      onDragStart={handleDragStart}
                      onClick={() => router.push(withLocaleHref(`/prompts/edit/${prompt.id}`, locale))}
                      onEdit={() => {
                        const currentPath = window.location.pathname
                        const returnPath = currentPath.startsWith('/folders/') ? currentPath : '/prompts'
                        router.push(withLocaleHref(`/prompts/edit/${prompt.id}?return=${encodeURIComponent(returnPath)}`, locale))
                      }}
                      onDelete={handleDeletePrompt}
                      onPublish={handlePublishPrompt}
                      onFavoriteChange={() => {}}
                      onAddToFolder={handleAddToFolder}
                      showAddToFolder={true}
                      locale={locale}
                    />
                  ))}
                </div>
              )}

              {/* 加载状态 */}
              {loading && prompts.length > 0 && (
                <div className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" />
                  <span className="ml-2 text-gray-600 dark:text-gray-400">{copy.loadingMore}</span>
                </div>
              )}
            </div>
          </div>
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

        {/* 新建文件夹对话框 */}
        <NewFolderDialog
          open={showNewFolderDialog}
          onOpenChange={setShowNewFolderDialog}
          folderName={newFolderName}
          onFolderNameChange={setNewFolderName}
          onSubmit={handleCreateFolder}
          loading={newFolderLoading}
          locale={locale}
        />

        {/* 选择文件夹对话框 */}
        <FolderSelectDialog
          open={showFolderSelectDialog}
          onOpenChange={setShowFolderSelectDialog}
          folders={folders}
          onSelectFolder={handleSelectFolder}
          locale={locale}
        />
      </div>
    </ProtectedRoute>
  )
} 
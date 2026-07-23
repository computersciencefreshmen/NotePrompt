'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, Plus, FileText, PanelLeft, RotateCcw } from 'lucide-react'
import { SearchInput } from '@/components/ui/search-input'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useToast } from '@/hooks/use-toast'
import { Prompt, Folder, ImportedFolder } from '@/types'
import PromptAssetRow, { PromptAssetRowSkeleton } from '@/components/PromptAssetRow'
import PromptCollectionRail from '@/components/PromptCollectionRail'
import { NewFolderDialog, FolderSelectDialog } from '@/components/FolderDialogs'
import { detectLocaleFromSearch, Locale, withLocaleHref } from '@/lib/i18n'

const promptsPageCopy = {
  zh: {
    eyebrow: 'PROMPT LIBRARY',
    title: '提示词资产库',
    subtitle: '在一个安静、可检索的工作台中组织、审阅和演进您的提示词。',
    fetchFailedTitle: '获取失败',
    fetchFailedDesc: '获取提示词失败',
    createFolderSuccessTitle: '创建成功',
    createFolderSuccessDesc: '收藏集已创建',
    createFolderFailedTitle: '创建失败',
    createFolderFailedDesc: '创建收藏集失败',
    addSuccessTitle: '添加成功',
    addSuccessDesc: '提示词已添加到收藏集',
    addFailedTitle: '添加失败',
    addFailedDesc: '添加到收藏集失败',
    duplicateAddDesc: '提示词已在该收藏集中，请勿重复添加',
    retryLater: '请稍后重试',
    deleteSuccessTitle: '删除成功',
    deleteSuccessDesc: '提示词已删除',
    deleteFailedTitle: '删除失败',
    deleteFailedDesc: '删除提示词失败',
    publishSuccessTitle: '发布成功',
    publishPromptSuccessDesc: '发布请求已完成，请在发现页核对公开内容',
    publishFolderSuccessDesc: '已创建收藏集的公开快照',
    publishFailedTitle: '发布失败',
    publishPromptFailedDesc: '发布提示词失败',
    publishFolderFailedDesc: '发布收藏集快照失败',
    sectionTitle: '全部提示词',
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
    loadMore: '加载更多',
    resultCount: (count: number) => `${count} 项资产`,
    openCollections: '打开收藏集',
    collectionsTitle: '收藏集',
    collectionsLoading: '正在加载收藏集…',
    collectionsLoadError: '收藏集暂时无法刷新。',
    retry: '重试',
    resetFilters: '重置筛选',
    loadError: '提示词暂时无法刷新，已保留可用内容。',
    listLabel: '提示词资产列表',
    searchLabel: '搜索提示词资产',
    clearSearchLabel: '清除提示词搜索',
  },
  en: {
    eyebrow: 'PROMPT LIBRARY',
    title: 'Prompt assets',
    subtitle: 'Organize, review, and evolve your prompts in one calm, searchable workbench.',
    fetchFailedTitle: 'Unable to load',
    fetchFailedDesc: 'Could not load prompts.',
    createFolderSuccessTitle: 'Collection created',
    createFolderSuccessDesc: 'Your collection is ready.',
    createFolderFailedTitle: 'Create failed',
    createFolderFailedDesc: 'Could not create the collection.',
    addSuccessTitle: 'Added',
    addSuccessDesc: 'The prompt was added to the collection.',
    addFailedTitle: 'Add failed',
    addFailedDesc: 'Could not add the prompt to the collection.',
    duplicateAddDesc: 'This prompt is already in that collection.',
    retryLater: 'Please try again later.',
    deleteSuccessTitle: 'Deleted',
    deleteSuccessDesc: 'The prompt has been deleted.',
    deleteFailedTitle: 'Delete failed',
    deleteFailedDesc: 'Could not delete the prompt.',
    publishSuccessTitle: 'Published',
    publishPromptSuccessDesc: 'Publishing completed. Review the public content in Discover.',
    publishFolderSuccessDesc: 'A public snapshot of the collection has been created.',
    publishFailedTitle: 'Publish failed',
    publishPromptFailedDesc: 'Could not publish the prompt.',
    publishFolderFailedDesc: 'Could not publish the collection snapshot.',
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
    loadMore: 'Load more',
    resultCount: (count: number) => `${count} assets`,
    openCollections: 'Open collections',
    collectionsTitle: 'Collections',
    collectionsLoading: 'Loading collections…',
    collectionsLoadError: 'Collections could not be refreshed.',
    retry: 'Retry',
    resetFilters: 'Reset filters',
    loadError: 'Prompts could not be refreshed. Safe existing content has been preserved.',
    listLabel: 'Prompt asset list',
    searchLabel: 'Search prompt assets',
    clearSearchLabel: 'Clear prompt search',
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
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [collectionsLoading, setCollectionsLoading] = useState(true)
  const [collectionsError, setCollectionsError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResetSignal, setSearchResetSignal] = useState(0)
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  // 对话框状态
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderLoading, setNewFolderLoading] = useState(false)
  const [showFolderSelectDialog, setShowFolderSelectDialog] = useState(false)
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null)
  const [showCollectionsDialog, setShowCollectionsDialog] = useState(false)
  const requestSequenceRef = useRef(0)
  const listHeadingRef = useRef<HTMLHeadingElement>(null)
  const userId = user?.id

  // 获取文件夹列表
  const loadFolders = useCallback(async () => {
    const response = await api.folders.list()
    if (!response.success || !response.data) throw new Error(response.error || 'Failed to load collections')
    return response.data
  }, [])

  const loadImportedFolders = useCallback(async () => {
    const response = await api.user.getImportedFolders()
    if (!response.success || !response.data) throw new Error(response.error || 'Failed to load imported collections')
    return response.data
  }, [])

  const fetchFolders = useCallback(async () => {
    setFolders(await loadFolders())
  }, [loadFolders])

  const refreshOwnedCollections = useCallback(async () => {
    try {
      await fetchFolders()
      setCollectionsError('')
    } catch (error) {
      console.error('Failed to refresh owned collections:', error)
      setCollectionsError(copy.collectionsLoadError)
    }
  }, [copy.collectionsLoadError, fetchFolders])

  const fetchCollections = useCallback(async () => {
    setCollectionsLoading(true)
    setCollectionsError('')
    try {
      const [nextFolders, nextImportedFolders] = await Promise.all([
        loadFolders(),
        loadImportedFolders(),
      ])
      setFolders(nextFolders)
      setImportedFolders(nextImportedFolders)
    } catch (error) {
      console.error('Failed to load collections:', error)
      setCollectionsError(locale === 'en' ? 'Collections could not be refreshed.' : '收藏集暂时无法刷新。')
    } finally {
      setCollectionsLoading(false)
    }
  }, [loadFolders, loadImportedFolders, locale])

  // 处理查看导入文件夹
  const handleViewImportedFolder = (folder: ImportedFolder) => {
    router.push(withLocaleHref(`/imported-folders/${folder.id}`, locale))
  }

  // 获取提示词列表
  const fetchPrompts = useCallback(async (params: {
    search?: string;
    folder_id?: number | undefined;
    page?: number;
    limit?: number;
  } = {}) => {
    const requestedPage = params.page ?? 1
    const requestSequence = ++requestSequenceRef.current
    if (requestedPage === 1) setLoading(true)
    else setLoadingMore(true)
    setLoadError('')
    try {
      const response = await api.prompts.list({
        search: searchTerm || undefined,
        folder_id: selectedFolderId || undefined,
        page: requestedPage,
        limit: 12,
        ...params
      })

      if (requestSequence !== requestSequenceRef.current) return
      if (response.success && response.data) {
        if (requestedPage === 1) {
          setPrompts(response.data.items)
        } else {
          setPrompts(prev => [...prev, ...response.data!.items])
        }
        setPage(response.data.page)
        setTotalPages(response.data.totalPages)
        setTotalCount(response.data.total)
        setHasMore(response.data.page < response.data.totalPages)
      } else {
        throw new Error(response.error || copy.fetchFailedDesc)
      }
    } catch (error) {
      if (requestSequence !== requestSequenceRef.current) return
      console.error('Failed to fetch prompts:', error)
      setLoadError(copy.loadError)
      toast({
        title: copy.fetchFailedTitle,
        description: copy.fetchFailedDesc,
        variant: 'destructive',
      })
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [copy.fetchFailedDesc, copy.fetchFailedTitle, copy.loadError, searchTerm, selectedFolderId, toast])

  const reloadFromFirstPage = useCallback(async () => {
    setPage(1)
    await fetchPrompts({ page: 1 })
  }, [fetchPrompts])

  // 创建新文件夹
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    setNewFolderLoading(true)
    try {
      const response = await api.folders.create({
        name: newFolderName.trim(),
        parent_id: null
      })
      if (!response.success) throw new Error(response.error || copy.createFolderFailedDesc)
      toast({
        title: copy.createFolderSuccessTitle,
        description: copy.createFolderSuccessDesc,
        variant: 'success',
      })
      setNewFolderName('')
      setShowNewFolderDialog(false)
      await refreshOwnedCollections()
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

  const handleRenameOwnedCollection = async (folderId: number, name: string) => {
    const response = await api.folders.update(folderId, { name })
    if (!response.success) throw new Error(response.error || copy.createFolderFailedDesc)
    setFolders(current => current.map(folder => folder.id === folderId ? { ...folder, name } : folder))
  }

  const handleDeleteCollection = async (kind: 'owned' | 'imported', folderId: number) => {
    if (kind === 'owned') {
      const response = await api.folders.delete(folderId)
      if (!response.success) throw new Error(response.error || copy.deleteFailedDesc)
      setFolders(current => current.filter(folder => folder.id !== folderId))
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null)
      } else {
        await reloadFromFirstPage()
      }
      return
    }

    const response = await api.user.deleteImportedFolder(folderId)
    if (!response.success) throw new Error(response.error || copy.deleteFailedDesc)
    setImportedFolders(current => current.filter(folder => folder.id !== folderId))
  }

  // 拖拽相关状态
  const [dragOverFolder, setDragOverFolder] = useState<number | null>(null)

  // 处理拖拽开始
  const handleDragStart = (e: React.DragEvent, prompt: Prompt) => {
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
      const data = JSON.parse(e.dataTransfer.getData('application/json')) as Record<string, unknown>
      
      if (data.type === 'prompt' && Number.isInteger(data.id) && Number(data.id) > 0) {
        const response = await api.folders.addPromptToFolder(folderId, Number(data.id))
        
        if (!response.success) throw new Error(response.error || copy.addFailedDesc)
        const title = typeof data.title === 'string' ? data.title : ''
        toast({
          title: copy.addSuccessTitle,
          description: locale === 'en' ? `Added "${title}" to the collection.` : `已将“${title}”添加到收藏集`,
          variant: 'success',
        })
        await Promise.all([reloadFromFirstPage(), refreshOwnedCollections()])
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
      
      if (!response.success) throw new Error(response.error || copy.addFailedDesc)
      toast({
        title: copy.addSuccessTitle,
        description: copy.addSuccessDesc,
        variant: 'success',
      })
      await Promise.all([reloadFromFirstPage(), refreshOwnedCollections()])
      setShowFolderSelectDialog(false)
      setSelectedPromptId(null)
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
    }
  }

  // 处理删除提示词
  const handleDeletePrompt = async (promptId: number) => {
    try {
      const response = await api.prompts.delete(promptId)
      if (!response.success) throw new Error(response.error || copy.deleteFailedDesc)
      toast({
        title: copy.deleteSuccessTitle,
        description: copy.deleteSuccessDesc,
        variant: 'success',
      })
      await Promise.all([reloadFromFirstPage(), refreshOwnedCollections()])
      window.requestAnimationFrame(() => listHeadingRef.current?.focus())
    } catch (error) {
      toast({
        title: copy.deleteFailedTitle,
        description: `${copy.deleteFailedDesc}. ${copy.retryLater}`,
        variant: 'destructive',
      })
      throw error
    }
  }

  // 处理发布提示词
  const handlePublishPrompt = async (prompt: Prompt) => {
    try {
      const response = await api.prompts.publish(prompt.id)
      if (!response.success) throw new Error(response.error || copy.publishPromptFailedDesc)
      toast({
        title: copy.publishSuccessTitle,
        description: copy.publishPromptSuccessDesc,
        variant: 'success',
      })
    } catch (error) {
      toast({
        title: copy.publishFailedTitle,
        description: `${copy.publishPromptFailedDesc}. ${copy.retryLater}`,
        variant: 'destructive',
      })
      throw error
    }
  }

  // 处理发布文件夹
  const handlePublishFolder = async (folderId: number) => {
    try {
      const response = await api.folders.publish(folderId)
      if (!response.success) throw new Error(response.error || copy.publishFolderFailedDesc)
      toast({
        title: copy.publishSuccessTitle,
        description: copy.publishFolderSuccessDesc,
        variant: 'success',
      })
    } catch (error) {
      toast({
        title: copy.publishFailedTitle,
        description: `${copy.publishFolderFailedDesc}. ${copy.retryLater}`,
        variant: 'destructive',
      })
      throw error
    }
  }

  // 初始加载
  useEffect(() => {
    if (userId) {
      void fetchCollections()
    }
  }, [fetchCollections, userId])

  const handleLoadMore = () => {
    if (loading || loadingMore || !hasMore) return
    void fetchPrompts({ page: page + 1 })
  }

  // 处理搜索变化
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value)
  }, [])

  // 搜索和筛选变化时重新加载
  useEffect(() => {
    if (userId) {
      void reloadFromFirstPage()
    }
  }, [reloadFromFirstPage, userId])

  const handleResetFilters = () => {
    setSearchTerm('')
    setSelectedFolderId(null)
    setSearchResetSignal(current => current + 1)
  }

  const selectedCollectionName = selectedFolderId == null
    ? copy.sectionTitle
    : folders.find(folder => folder.id === selectedFolderId)?.name || copy.sectionTitle

  const hasCollectionData = folders.length > 0 || importedFolders.length > 0
  const hasActiveFilters = Boolean(searchTerm || selectedFolderId)

  const renderCollections = () => {
    if (collectionsLoading && !hasCollectionData) {
      return (
        <div
          role="status"
          className="flex h-full min-h-64 items-center justify-center gap-2 bg-[var(--np-surface)] px-6 text-sm text-[var(--np-ink-muted)]"
        >
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {copy.collectionsLoading}
        </div>
      )
    }

    if (collectionsError && !hasCollectionData) {
      return (
        <div
          role="alert"
          className="flex h-full min-h-64 flex-col items-start justify-center gap-4 bg-[var(--np-surface)] px-6 text-sm text-[var(--np-ink-muted)]"
        >
          <p>{copy.collectionsLoadError}</p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 border-[var(--np-rule)] bg-transparent text-[var(--np-ink)]"
            onClick={() => void fetchCollections()}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {copy.retry}
          </Button>
        </div>
      )
    }

    return (
      <div className="flex h-full min-h-0 flex-col">
        {collectionsError ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 border-b border-[var(--np-rule)] bg-[var(--np-accent-soft)] px-3 py-2 text-xs text-[var(--np-ink)]"
          >
            <span>{copy.collectionsLoadError}</span>
            <button
              type="button"
              className="min-h-11 shrink-0 rounded-[6px] px-3 font-semibold text-[var(--np-accent-strong)] hover:bg-[var(--np-surface-raised)] lg:min-h-9"
              onClick={() => void fetchCollections()}
            >
              {copy.retry}
            </button>
          </div>
        ) : null}
        <PromptCollectionRail
          folders={folders}
          importedFolders={importedFolders}
          selectedFolderId={selectedFolderId}
          locale={locale}
          dragOverFolder={dragOverFolder}
          onSelectFolder={(folderId) => {
            setSelectedFolderId(folderId)
            setShowCollectionsDialog(false)
          }}
          onCreateCollection={() => setShowNewFolderDialog(true)}
          onRenameOwned={handleRenameOwnedCollection}
          onDeleteCollection={handleDeleteCollection}
          onPublishFolder={handlePublishFolder}
          onViewImported={(folder) => {
            setShowCollectionsDialog(false)
            handleViewImportedFolder(folder)
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        />
      </div>
    )
  }

  return (
    <ProtectedRoute locale={locale}>
      <div className="min-h-screen bg-[var(--np-canvas)] text-[var(--np-ink)]">
        <main className="mx-auto w-full max-w-[1480px] px-3 py-6 sm:px-6 lg:px-8 lg:py-8">
          <header className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--np-accent-strong)]">
                {copy.eyebrow}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[var(--np-ink)] sm:text-4xl">
                {copy.title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--np-ink-muted)] sm:text-base">
                {copy.subtitle}
              </p>
            </div>
            <Button
              type="button"
              className="min-h-11 w-full rounded-[8px] bg-[var(--np-accent)] px-4 font-semibold text-[var(--np-ink)] shadow-none hover:bg-[var(--np-accent-hover)] sm:w-auto"
              onClick={() => router.push(withLocaleHref('/prompts/new', locale))}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {copy.newPrompt}
            </Button>
          </header>

          <div className="min-h-[36rem] overflow-hidden rounded-[10px] border border-[var(--np-rule)] bg-[var(--np-surface)] shadow-[0_18px_50px_rgb(20_20_19_/_0.055)] lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
            <div className="hidden min-h-0 lg:block">
              {renderCollections()}
            </div>

            <section className="min-w-0" aria-labelledby="prompt-assets-heading">
              <div className="border-b border-[var(--np-rule)] bg-[var(--np-surface-raised)] px-4 py-4 sm:px-5">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0 border-[var(--np-rule)] bg-[var(--np-surface)] text-[var(--np-ink)] lg:hidden"
                    onClick={() => setShowCollectionsDialog(true)}
                    aria-label={copy.openCollections}
                  >
                    <PanelLeft className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <SearchInput
                    value={searchTerm}
                    onChange={handleSearchChange}
                    resetSignal={searchResetSignal}
                    placeholder={copy.searchPlaceholder}
                    debounceMs={350}
                    onClear={() => setSearchTerm('')}
                    ariaLabel={copy.searchLabel}
                    clearLabel={copy.clearSearchLabel}
                    className="min-w-0 flex-1"
                  />
                  {hasActiveFilters ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="hidden min-h-11 shrink-0 text-[var(--np-ink-muted)] hover:bg-[var(--np-surface-soft)] hover:text-[var(--np-ink)] sm:inline-flex"
                      onClick={handleResetFilters}
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      {copy.resetFilters}
                    </Button>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2
                      id="prompt-assets-heading"
                      ref={listHeadingRef}
                      tabIndex={-1}
                      className="text-lg font-semibold tracking-[-0.018em] text-[var(--np-ink)] outline-none"
                    >
                      {selectedCollectionName}
                    </h2>
                    {searchTerm ? (
                      <p className="mt-1 text-xs text-[var(--np-ink-muted)]">
                        {copy.searchResults(searchTerm)}
                      </p>
                    ) : null}
                  </div>
                  <p className="font-mono text-xs tabular-nums text-[var(--np-ink-muted)]" aria-live="polite">
                    {loading ? '—' : copy.resultCount(totalCount)}
                  </p>
                </div>

                {hasActiveFilters ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-3 min-h-11 w-full justify-center text-[var(--np-ink-muted)] hover:bg-[var(--np-surface-soft)] hover:text-[var(--np-ink)] sm:hidden"
                    onClick={handleResetFilters}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {copy.resetFilters}
                  </Button>
                ) : null}
              </div>

              {loadError && prompts.length > 0 ? (
                <div
                  role="alert"
                  className="flex flex-col gap-3 border-b border-[var(--np-rule)] bg-[var(--np-accent-soft)] px-4 py-3 text-sm text-[var(--np-ink)] sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <span>{loadError}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 self-start text-[var(--np-accent-strong)] hover:bg-[var(--np-surface-raised)] sm:min-h-9 sm:self-auto"
                    onClick={() => void reloadFromFirstPage()}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {copy.retry}
                  </Button>
                </div>
              ) : null}

              <div
                role="region"
                aria-label={copy.listLabel}
                aria-busy={loading || loadingMore}
                className="min-h-[28rem]"
              >
                {loading ? (
                  <div role="status" aria-label={copy.loadingLabel}>
                    {Array.from({ length: 5 }).map((_, index) => (
                      <PromptAssetRowSkeleton key={index} />
                    ))}
                  </div>
                ) : loadError && prompts.length === 0 ? (
                  <div
                    role="alert"
                    className="flex min-h-[28rem] flex-col items-center justify-center px-6 py-16 text-center"
                  >
                    <FileText className="h-8 w-8 text-[var(--np-accent-strong)]" aria-hidden="true" />
                    <p className="mt-4 max-w-md text-sm leading-6 text-[var(--np-ink-muted)]">{loadError}</p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-5 min-h-11 border-[var(--np-rule)] bg-transparent text-[var(--np-ink)]"
                      onClick={() => void reloadFromFirstPage()}
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      {copy.retry}
                    </Button>
                  </div>
                ) : prompts.length === 0 ? (
                  <div className="flex min-h-[28rem] flex-col items-center justify-center px-6 py-16 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--np-accent-soft)] text-[var(--np-accent-strong)]">
                      <FileText className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <p className="mt-4 text-base font-semibold text-[var(--np-ink)]">
                      {searchTerm ? copy.emptySearch(searchTerm) : copy.empty}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-5 min-h-11 border-[var(--np-rule)] bg-transparent text-[var(--np-ink)] hover:bg-[var(--np-surface-soft)]"
                      onClick={hasActiveFilters
                        ? handleResetFilters
                        : () => router.push(withLocaleHref('/prompts/new', locale))}
                    >
                      {hasActiveFilters ? copy.resetFilters : copy.firstPrompt}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-[var(--np-rule)]">
                      {prompts.map((prompt) => (
                        <PromptAssetRow
                          key={prompt.id}
                          prompt={prompt}
                          locale={locale}
                          draggable
                          onDragStart={handleDragStart}
                          onOpen={() => router.push(withLocaleHref(`/prompts/edit/${prompt.id}`, locale))}
                          onEdit={() => {
                            const returnPath = withLocaleHref('/prompts', locale)
                            router.push(withLocaleHref(`/prompts/edit/${prompt.id}?return=${encodeURIComponent(returnPath)}`, locale))
                          }}
                          onDelete={handleDeletePrompt}
                          onPublish={handlePublishPrompt}
                          onAddToCollection={handleAddToFolder}
                        />
                      ))}
                    </div>

                    <div className="flex flex-col items-center gap-3 border-t border-[var(--np-rule)] px-4 py-6">
                      {hasMore ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11 min-w-40 border-[var(--np-rule)] bg-[var(--np-surface-raised)] text-[var(--np-ink)] hover:bg-[var(--np-surface-soft)]"
                          onClick={handleLoadMore}
                          disabled={loading || loadingMore}
                        >
                          {loadingMore ? (
                            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                          ) : null}
                          {loadingMore ? copy.loadingMore : copy.loadMore}
                        </Button>
                      ) : null}
                      <span className="font-mono text-[11px] tabular-nums text-[var(--np-ink-muted)]" aria-live="polite">
                        {page} / {Math.max(totalPages, 1)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        </main>

        <Dialog open={showCollectionsDialog} onOpenChange={setShowCollectionsDialog}>
          <DialogContent className="h-[min(82vh,44rem)] w-[calc(100%-1.5rem)] max-w-md overflow-hidden rounded-[10px] border-[var(--np-rule)] bg-[var(--np-surface)] p-0 text-[var(--np-ink)] [&>button]:right-[4.25rem] [&>button]:top-2.5 [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center">
            <DialogHeader className="sr-only">
              <DialogTitle>{copy.collectionsTitle}</DialogTitle>
            </DialogHeader>
            {renderCollections()}
          </DialogContent>
        </Dialog>

        <NewFolderDialog
          open={showNewFolderDialog}
          onOpenChange={setShowNewFolderDialog}
          folderName={newFolderName}
          onFolderNameChange={setNewFolderName}
          onSubmit={handleCreateFolder}
          loading={newFolderLoading}
          locale={locale}
        />

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

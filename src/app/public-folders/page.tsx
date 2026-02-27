'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Header from '@/components/Header'
import { PublicFolder } from '@/types'
import { api } from '@/lib/api'
import { Filter, Loader2, Folder, User, Calendar, FileText, Download, Check, X, Star } from 'lucide-react'
import { SearchInput } from '@/components/ui/search-input'
import { useToast } from '@/hooks/use-toast'

export default function PublicFoldersPage() {
  const [folders, setFolders] = useState<PublicFolder[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const { toast } = useToast()

  const fetchFolders = async (params: { page?: number; search?: string } = {}) => {
    setLoading(true)
    try {
      const response = await api.publicFolders.list({
        page: page,
        limit: 12,
        ...params
      })

      if (response.success && response.data) {
        if (params.page === 1) {
          setFolders(response.data.items)
        } else {
          setFolders(prev => [...prev, ...response.data!.items])
        }
        setTotalPages(response.data.totalPages)
        setHasMore(response.data.page < response.data.totalPages)
      }
    } catch (error) {
      console.error('Failed to fetch folders:', error)
      toast({
        title: '获取失败',
        description: '获取文件夹列表失�?,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // 初始加载文件�?  useEffect(() => {
    fetchFolders({ page: 1 })
  }, [])

  // 搜索条件变化时重新加�?  useEffect(() => {
    fetchFolders({ page: 1, search: searchTerm })
  }, [searchTerm])

  // 搜索处理
  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setPage(1)
  }

  // 清除筛�?  const clearFilters = () => {
    setSearchTerm('')
    setPage(1)
  }

  // 加载更多
  const loadMore = () => {
    const nextPage = page + 1
    setPage(nextPage)
    fetchFolders({ page: nextPage, search: searchTerm })
  }

  // 显示文件夹详�?  const handleFolderClick = async (folder: PublicFolder) => {
    // 跳转到文件夹详情页面
    window.location.href = `/public-folders/${folder.id}`
  }

  // 导入文件夹到我的提示�?  const handleImportFolder = async (folderId: number) => {
    try {
      const response = await api.publicFolders.import(folderId)
      if (response.success) {
        toast({
          title: '导入成功',
          description: response.data?.message || '文件夹导入成�?,
          variant: 'success',
        })
        
        // 导入成功后跳转到用户的提示词页面
        setTimeout(() => {
          window.location.href = '/prompts'
        }, 1500)
      } else {
        toast({
          title: '导入失败',
          description: response.error || '导入失败，请稍后重试',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Failed to import folder:', error)
      toast({
        title: '导入失败',
        description: '导入失败，请稍后重试',
        variant: 'destructive',
      })
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 页面标题和操作区 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            公共文件夹库
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-6">
            发现和导入由社区贡献的优质AI提示词文件夹，快速构建您的提示词�?          </p>
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
              我的提示�?            </Button>
          </div>
        </div>

        {/* 搜索区域 */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">搜索文件�?/CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              {/* 搜索�?*/}
              <div className="flex-1">
                <SearchInput
                  value={searchTerm}
                  onChange={handleSearch}
                  placeholder="搜索文件夹名称、描�?.."
                  debounceMs={500}
                  onClear={() => setSearchTerm('')}
                />
              </div>

              {/* 当前筛选状�?*/}
              {searchTerm && (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={clearFilters}
                    variant="outline"
                    size="sm"
                  >
                    清除筛�?                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 文件夹网�?*/}
        {loading && folders.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">正在加载文件�?..</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {folders.map((folder) => (
                <Card 
                  key={folder.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleFolderClick(folder)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2 flex-1">
                        <Folder className="h-5 w-5 text-blue-600" />
                        <CardTitle className="text-lg font-semibold line-clamp-2">
                          {folder.name}
                        </CardTitle>
                        {folder.is_featured && (
                          <div className="flex items-center px-2 py-1 bg-gradient-to-r from-yellow-400 to-orange-400 text-white text-xs font-medium rounded-full">
                            <Star className="h-3 w-3 mr-1 fill-current" />
                            精�?                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <div className="flex items-center space-x-2">
                        <User className="h-3 w-3" />
                        <span>{folder.author}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <FileText className="h-3 w-3" />
                        <span>{folder.prompt_count || 0} 个提示词</span>
                        <span>�?/span>
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(folder.created_at)}</span>
                      </div>
                    </div>
                  </CardHeader>

                  {/* 添加描述字段显示 */}
                  {folder.description && (
                    <div className="px-6 pb-3">
                      <p className="text-sm text-gray-600 line-clamp-3">
                        {folder.description}
                      </p>
                    </div>
                  )}

                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between pt-2">
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleImportFolder(folder.id)
                        }}
                        className="bg-teal-600 hover:bg-teal-700 text-white"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        导入文件�?                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* 空状�?*/}
            {folders.length === 0 && !loading && (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <Filter className="h-16 w-16 mx-auto" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  未找到相关文件夹
                </h3>
                <p className="text-gray-600">
                  尝试调整搜索条件或浏览其他分�?                </p>
              </div>
            )}

            {/* 加载更多按钮 */}
            {hasMore && (
              <div className="text-center">
                <Button
                  onClick={loadMore}
                  disabled={loading}
                  variant="outline"
                  size="lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      加载�?..
                    </>
                  ) : (
                    '加载更多'
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </main>


    </div>
  )
} 
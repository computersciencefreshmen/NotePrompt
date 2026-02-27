'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit, 
  Eye, 
  Calendar,
  Folder,
  AlertTriangle
} from 'lucide-react'
import PromptCard from '@/components/PromptCard'
import FolderCard from '@/components/FolderCard'
import { PublicPrompt, PublicFolder } from '@/types'

export default function PublishedPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  // 状态管理
  const [publishedPrompts, setPublishedPrompts] = useState<PublicPrompt[]>([])
  const [publishedFolders, setPublishedFolders] = useState<PublicFolder[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('prompts')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  // 删除确认对话框
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<{ id: number; type: 'prompt' | 'folder'; name: string } | null>(null)

  // 编辑对话框
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [itemToEdit, setItemToEdit] = useState<{ id: number; type: 'prompt' | 'folder'; data: PublicPrompt | PublicFolder } | null>(null)
  const [editForm, setEditForm] = useState<{ title?: string; content?: string; description?: string; name?: string; tags?: string[] }>({})

  // 检查用户登录状态 - 等待认证初始化完成
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  // 获取发布的提示词
  const fetchPublishedPrompts = async (params?: { page?: number; search?: string }) => {
    if (!user) return

    try {
      setDataLoading(true)
      console.log('Fetching published prompts with params:', params)
      const response = await api.user.getPublishedPrompts({
        page: params?.page || page,
        limit: 12,
        search: params?.search || searchTerm
      })

      console.log('Published prompts response:', response)

      if (response.success && response.data) {
        if (params?.page === 1 || !params?.page) {
          setPublishedPrompts(response.data.items || [])
        } else {
          setPublishedPrompts(prev => [...prev, ...(response.data?.items || [])])
        }
        setTotalPages(response.data.totalPages || 1)
        setHasMore((response.data.page || 1) < (response.data.totalPages || 1))
      } else {
        console.error('Failed to fetch published prompts:', response.error)
        toast({
          title: '获取失败',
          description: response.error || '获取发布的提示词失败',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Failed to fetch published prompts:', error)
      toast({
        title: '获取失败',
        description: '获取发布的提示词失败',
        variant: 'destructive',
      })
    } finally {
      setDataLoading(false)
    }
  }

  // 获取发布的文件夹
  const fetchPublishedFolders = async (params?: { page?: number; search?: string }) => {
    if (!user) return

    try {
      setDataLoading(true)
      console.log('Fetching published folders with params:', params)
      const response = await api.user.getPublishedFolders({
        page: params?.page || page,
        limit: 12,
        search: params?.search || searchTerm
      })

      console.log('Published folders response:', response)

      if (response.success && response.data) {
        if (params?.page === 1 || !params?.page) {
          setPublishedFolders(response.data.items || [])
        } else {
          setPublishedFolders(prev => [...prev, ...(response.data?.items || [])])
        }
        setTotalPages(response.data.totalPages || 1)
        setHasMore((response.data.page || 1) < (response.data.totalPages || 1))
      } else {
        console.error('Failed to fetch published folders:', response.error)
        toast({
          title: '获取失败',
          description: response.error || '获取发布的文件夹失败',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Failed to fetch published folders:', error)
      toast({
        title: '获取失败',
        description: '获取发布的文件夹失败',
        variant: 'destructive',
      })
    } finally {
      setDataLoading(false)
    }
  }

  // 初始加载
  useEffect(() => {
    if (user) {
      console.log('User authenticated, fetching published content...')
      console.log('User ID:', user.id)
      console.log('User token:', api.auth.getToken())
      fetchPublishedPrompts({ page: 1 })
      fetchPublishedFolders({ page: 1 })
    } else {
      console.log('No user found, redirecting to login...')
      console.log('Auth token:', api.auth.getToken())
      console.log('Is logged in:', api.auth.isLoggedIn())
    }
  }, [user])

  // 处理搜索
  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setPage(1)
    if (activeTab === 'prompts') {
      fetchPublishedPrompts({ page: 1, search: value })
    } else {
      fetchPublishedFolders({ page: 1, search: value })
    }
  }

  // 处理删除
  const handleDelete = (item: PublicPrompt | PublicFolder, type: 'prompt' | 'folder') => {
    setItemToDelete({
      id: item.id,
      type,
      name: type === 'prompt' ? (item as PublicPrompt).title : (item as PublicFolder).name
    })
    setShowDeleteDialog(true)
  }

  // 确认删除
  const confirmDelete = async () => {
    if (!itemToDelete) return

    try {
      let response
      if (itemToDelete.type === 'prompt') {
        response = await api.prompts.deletePublicPrompt(itemToDelete.id)
      } else {
        response = await api.folders.deletePublicFolder(itemToDelete.id)
      }

      if (response.success) {
        toast({
          title: '删除成功',
          description: `${itemToDelete.type === 'prompt' ? '提示词' : '文件夹'}已删除`,
          variant: 'success',
        })
        
        // 刷新数据
        if (activeTab === 'prompts') {
          fetchPublishedPrompts({ page: 1, search: searchTerm })
        } else {
          fetchPublishedFolders({ page: 1, search: searchTerm })
        }
      } else {
        toast({
          title: '删除失败',
          description: response.error || '删除失败',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Delete error:', error)
      toast({
        title: '删除失败',
        description: '删除操作失败',
        variant: 'destructive',
      })
    } finally {
      setShowDeleteDialog(false)
      setItemToDelete(null)
    }
  }

  // 处理编辑
  const handleEdit = (item: PublicPrompt | PublicFolder, type: 'prompt' | 'folder') => {
    if (type === 'prompt') {
      const prompt = item as PublicPrompt
      setEditForm({
        title: prompt.title,
        content: prompt.content,
        description: prompt.description || '',
        tags: prompt.tags || []
      })
    } else {
      const folder = item as PublicFolder
      setEditForm({
        name: folder.name,
        description: folder.description || ''
      })
    }
    setItemToEdit({ id: item.id, type, data: item })
    setShowEditDialog(true)
  }

  // 确认编辑
  const confirmEdit = async () => {
    if (!itemToEdit) return

    try {
      let response
      if (itemToEdit.type === 'prompt') {
        response = await api.prompts.updatePublicPrompt(itemToEdit.id, {
          title: editForm.title,
          content: editForm.content,
          description: editForm.description,
          tags: editForm.tags
        })
      } else {
        response = await api.folders.updatePublicFolder(itemToEdit.id, {
          name: editForm.name,
          description: editForm.description
        })
      }

      if (response.success) {
        toast({
          title: '编辑成功',
          description: `${itemToEdit.type === 'prompt' ? '提示词' : '文件夹'}已更新`,
          variant: 'success',
        })
        
        // 刷新数据
        if (activeTab === 'prompts') {
          fetchPublishedPrompts({ page: 1, search: searchTerm })
        } else {
          fetchPublishedFolders({ page: 1, search: searchTerm })
        }
      } else {
        toast({
          title: '编辑失败',
          description: response.error || '编辑失败',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Edit error:', error)
      toast({
        title: '编辑失败',
        description: '编辑操作失败',
        variant: 'destructive',
      })
    } finally {
      setShowEditDialog(false)
      setItemToEdit(null)
      setEditForm({})
    }
  }

  // 处理标签点击
  const handleTagClick = (tag: string) => {
    // 可以跳转到标签搜索页面
    console.log('Tag clicked:', tag)
  }

  // 格式化日期
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN')
  }

  if (!user) {
    return null
  }

  // 如果认证还在初始化中，显示加载状态
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto mb-4"></div>
            <p className="text-gray-600">正在加载...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">我发布的内容</h1>
        <p className="text-gray-600">管理您发布的公共提示词和文件夹</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="prompts">公共提示词</TabsTrigger>
          <TabsTrigger value="folders">公共文件夹</TabsTrigger>
        </TabsList>

        <TabsContent value="prompts" className="space-y-6">
          {/* 搜索栏 */}
          <div className="flex items-center space-x-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="搜索发布的提示词..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button 
              onClick={() => router.push('/prompts/new')}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              新建提示词
            </Button>
          </div>

          {/* 提示词列表 */}
          {publishedPrompts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {publishedPrompts.map((prompt) => (
                <Card key={prompt.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg font-semibold line-clamp-2">
                          {prompt.title}
                        </CardTitle>
                        <div className="flex items-center space-x-4 text-sm text-gray-500 mt-2">
                          <div className="flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(prompt.created_at)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/public-prompts/${prompt.id}`)}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(prompt, 'prompt')}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(prompt, 'prompt')}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {prompt.description && (
                      <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                        {prompt.description}
                      </p>
                    )}
                    <div className="bg-gray-50 p-3 rounded-md">
                      <p className="text-sm text-gray-700 line-clamp-3">
                        {prompt.content}
                      </p>
                    </div>
                    {prompt.tags && prompt.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {prompt.tags.map((tag, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="text-xs cursor-pointer hover:bg-gray-200"
                            onClick={() => handleTagClick(tag)}
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="text-gray-500">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">暂无发布的提示词</h3>
                  <p className="text-sm mb-4">您还没有发布任何提示词到公共库</p>
                  <Button 
                    onClick={() => router.push('/prompts/new')}
                    className="bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    创建第一个提示词
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 加载更多 */}
          {hasMore && publishedPrompts.length > 0 && (
            <div className="text-center">
              <Button
                variant="outline"
                onClick={() => {
                  const nextPage = page + 1
                  setPage(nextPage)
                  fetchPublishedPrompts({ page: nextPage, search: searchTerm })
                }}
                disabled={dataLoading}
              >
                {dataLoading ? '加载中...' : '加载更多'}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="folders" className="space-y-6">
          {/* 搜索栏 */}
          <div className="flex items-center space-x-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="搜索发布的文件夹..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button 
              onClick={() => router.push('/prompts')}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              发布文件夹
            </Button>
          </div>

          {/* 文件夹列表 */}
          {publishedFolders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {publishedFolders.map((folder) => (
                <Card key={folder.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg font-semibold line-clamp-2">
                          {folder.name}
                        </CardTitle>
                        <div className="flex items-center space-x-4 text-sm text-gray-500 mt-2">
                          <div className="flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(folder.created_at)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/public-folders/${folder.id}`)}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(folder, 'folder')}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(folder, 'folder')}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {folder.description && (
                      <p className="text-sm text-gray-600 line-clamp-3">
                        {folder.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="text-gray-500">
                  <Folder className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">暂无发布的文件夹</h3>
                  <p className="text-sm mb-4">您还没有发布任何文件夹到公共库</p>
                  <Button 
                    onClick={() => router.push('/prompts')}
                    className="bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    发布第一个文件夹
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 加载更多 */}
          {hasMore && publishedFolders.length > 0 && (
            <div className="text-center">
              <Button
                variant="outline"
                onClick={() => {
                  const nextPage = page + 1
                  setPage(nextPage)
                  fetchPublishedFolders({ page: nextPage, search: searchTerm })
                }}
                disabled={dataLoading}
              >
                {dataLoading ? '加载中...' : '加载更多'}
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* 删除确认对话框 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              您确定要删除"{itemToDelete?.name}"吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              取消
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDelete}
            >
              确认删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              编辑{itemToEdit?.type === 'prompt' ? '提示词' : '文件夹'}
            </DialogTitle>
            <DialogDescription>
              修改{itemToEdit?.type === 'prompt' ? '提示词' : '文件夹'}的信息
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {itemToEdit?.type === 'prompt' ? (
              <>
                <div>
                  <label className="text-sm font-medium">标题</label>
                  <Input
                    value={editForm.title || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="输入标题"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">描述</label>
                  <Input
                    value={editForm.description || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="输入描述"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">内容</label>
                  <textarea
                    value={editForm.content || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="输入提示词内容"
                    className="w-full h-32 p-3 border border-gray-300 rounded-md resize-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">标签</label>
                  <Input
                    value={editForm.tags?.join(', ') || ''}
                    onChange={(e) => setEditForm(prev => ({ 
                      ...prev, 
                      tags: e.target.value.split(',').map(tag => tag.trim()).filter(tag => tag)
                    }))}
                    placeholder="输入标签，用逗号分隔"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium">名称</label>
                  <Input
                    value={editForm.name || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="输入文件夹名称"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">描述</label>
                  <Input
                    value={editForm.description || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="输入描述"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              取消
            </Button>
            <Button onClick={confirmEdit}>
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
} 
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  ArrowLeft, 
  Plus, 
  Edit, 
  Trash2, 
  Folder, 
  FileText,
  Search,
  Loader2
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { AdminFolder, AdminPrompt } from '@/types'

export default function AdminFolderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const hasAdminAccess = Boolean(user && (user.is_admin || user.user_type === 'admin'))
  
  const folderId = parseInt(params.id as string)
  const [folder, setFolder] = useState<AdminFolder | null>(null)
  const [prompts, setPrompts] = useState<AdminPrompt[]>([])
  const [promptPage, setPromptPage] = useState(1)
  const [promptTotal, setPromptTotal] = useState(0)
  const [promptTotalPages, setPromptTotalPages] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [availablePrompts, setAvailablePrompts] = useState<AdminPrompt[]>([])
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null)
  const [loadingAvailablePrompts, setLoadingAvailablePrompts] = useState(false)

  const fetchFolderData = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const response = await api.admin.getPublicFolderPrompts(folderId, { page, limit: 20 })
      if (response.success && response.data) {
        setFolder(response.data.folder)
        setPrompts(response.data.prompts)
        setPromptPage(response.pagination?.page ?? page)
        setPromptTotal(response.pagination?.total ?? response.data.prompts.length)
        setPromptTotalPages(response.pagination?.totalPages ?? 1)
      } else {
        toast({
          title: '获取数据失败',
          description: response.error || '无法获取文件夹数据',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Failed to fetch folder data:', error)
      toast({
        title: '获取数据失败',
        description: '无法获取文件夹数据',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [folderId, toast])

  useEffect(() => {
    if (hasAdminAccess && folderId) {
      void fetchFolderData()
    }
  }, [fetchFolderData, folderId, hasAdminAccess])

  const handleAddPrompt = async () => {
    if (!selectedPromptId) return

    try {
      const response = await api.admin.addPromptToPublicFolder(folderId, selectedPromptId)
      if (response.success) {
        toast({
          title: '添加成功',
          description: '提示词已添加到文件夹',
          variant: 'success',
        })
        fetchFolderData(promptPage)
        setShowAddDialog(false)
        setSelectedPromptId(null)
      } else {
        toast({
          title: '添加失败',
          description: response.error || '添加提示词失败',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Add prompt error:', error)
      toast({
        title: '添加失败',
        description: '添加提示词失败',
        variant: 'destructive',
      })
    }
  }

  const handleRemovePrompt = async (promptId: number) => {
    try {
      const response = await api.admin.removePromptFromPublicFolder(folderId, promptId)
      if (response.success) {
        toast({
          title: '移除成功',
          description: '提示词已从文件夹移除',
          variant: 'success',
        })
        fetchFolderData(promptPage)
      } else {
        toast({
          title: '移除失败',
          description: response.error || '移除提示词失败',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Remove prompt error:', error)
      toast({
        title: '移除失败',
        description: '移除提示词失败',
        variant: 'destructive',
      })
    }
  }

  const fetchAvailablePrompts = async (search?: string) => {
    setLoadingAvailablePrompts(true)
    try {
      const response = await api.admin.getAvailablePrompts({
        search,
        folderId
      })
      if (response.success) {
        setAvailablePrompts(response.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch available prompts:', error)
    } finally {
      setLoadingAvailablePrompts(false)
    }
  }

  const filteredPrompts = prompts.filter(prompt =>
    prompt.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prompt.content.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">权限不足</h1>
          <p className="text-gray-600">您没有管理员权限</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Button
            onClick={() => router.push('/admin')}
            variant="outline"
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回管理员控制台
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">正在加载...</span>
          </div>
        ) : folder ? (
          <>
            <Card className="mb-8">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <Folder className="h-8 w-8 text-blue-600" />
                  <div>
                    <CardTitle className="text-2xl font-bold">
                      {folder.name}
                    </CardTitle>
                    <div className="flex items-center space-x-4 text-sm text-gray-500 mt-2">
                      <div className="flex items-center space-x-1">
                        <FileText className="h-4 w-4" />
                        <span>{promptTotal} 个提示词</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span>作者: {folder.author}</span>
                      </div>
                      {folder.is_featured && (
                        <Badge variant="default" className="bg-yellow-100 text-yellow-800">
                          精选
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">{folder.description}</p>
              </CardContent>
            </Card>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  文件夹内的提示词 ({promptTotal})
                </h2>
                                 <Button onClick={() => {
                   setShowAddDialog(true)
                   fetchAvailablePrompts()
                 }}>
                   <Plus className="h-4 w-4 mr-2" />
                   添加提示词
                 </Button>
              </div>

              <div className="mb-4">
                <Input
                  aria-label="搜索文件夹内的提示词"
                  placeholder="搜索提示词..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-md"
                />
              </div>

              {filteredPrompts.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    暂无提示词
                  </h3>
                  <p className="text-gray-600">
                    这个文件夹中还没有提示词
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredPrompts.map((prompt) => (
                    <div key={prompt.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{prompt.title}</h3>
                          <p className="text-sm text-gray-600 mt-1">{prompt.author}</p>
                          <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                            {prompt.description || prompt.content}
                          </p>
                          <div className="flex items-center space-x-2 mt-2">
                            <span className="text-xs text-gray-500">
                              {new Date(prompt.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(`/public-prompts/${prompt.id}?source=published`, '_blank', 'noopener,noreferrer')}
                            aria-label={`在新窗口查看提示词：${prompt.title}`}
                          >
                            <FileText className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleRemovePrompt(prompt.id)}
                            className="text-red-600 hover:text-red-700"
                            aria-label={`从文件夹移除提示词：${prompt.title}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {promptTotalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-3" aria-label="文件夹提示词分页">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={promptPage <= 1}
                    onClick={() => void fetchFolderData(promptPage - 1)}
                  >
                    上一页
                  </Button>
                  <span className="text-sm text-gray-500">{promptPage} / {promptTotalPages}</span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={promptPage >= promptTotalPages}
                    onClick={() => void fetchFolderData(promptPage + 1)}
                  >
                    下一页
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">文件夹不存在</h1>
            <p className="text-gray-600">无法找到指定的文件夹</p>
          </div>
        )}
      </div>

             {/* 添加提示词对话框 */}
       <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
         <DialogContent className="max-w-2xl">
           <DialogHeader>
             <DialogTitle>添加提示词到文件夹</DialogTitle>
           </DialogHeader>
           <div className="space-y-4">
             <div>
               <label htmlFor="available-prompt-search" className="block text-sm font-medium text-gray-700 mb-2">
                 搜索提示词
               </label>
               <Input
                 id="available-prompt-search"
                 placeholder="搜索提示词..."
                 onChange={(e) => fetchAvailablePrompts(e.target.value)}
                 className="mb-4"
               />
             </div>
             
             <div className="max-h-60 overflow-y-auto">
               {loadingAvailablePrompts ? (
                 <div className="flex items-center justify-center py-8" role="status" aria-live="polite">
                   <Loader2 className="h-6 w-6 animate-spin text-blue-600" aria-hidden="true" />
                   <span className="ml-2 text-gray-600">加载中...</span>
                 </div>
               ) : availablePrompts.length === 0 ? (
                 <div className="text-center py-8">
                   <p className="text-gray-500">没有找到可添加的提示词</p>
                 </div>
               ) : (
                 <div className="space-y-2" role="radiogroup" aria-label="选择要添加的提示词">
                   {availablePrompts.map((prompt) => (
                     <div
                       key={prompt.id}
                       className={`border rounded-lg hover:bg-gray-50 ${
                         selectedPromptId === prompt.id ? 'border-blue-500 bg-blue-50' : ''
                       }`}
                     >
                       <label className="flex cursor-pointer items-start justify-between p-3">
                         <span className="flex-1">
                           <span className="block font-medium text-sm">{prompt.title}</span>
                           <span className="block text-xs text-gray-600 mt-1">{prompt.author}</span>
                           <span className="block text-xs text-gray-500 mt-1 line-clamp-2">
                             {prompt.description || prompt.content}
                           </span>
                         </span>
                         <span className="ml-2">
                           <input
                             type="radio"
                             name="available-prompt"
                             checked={selectedPromptId === prompt.id}
                             onChange={() => setSelectedPromptId(prompt.id)}
                             className="text-blue-600"
                           />
                         </span>
                       </label>
                     </div>
                   ))}
                 </div>
               )}
             </div>
             
             <div className="flex justify-end space-x-2">
               <Button
                 variant="outline"
                 onClick={() => {
                   setShowAddDialog(false)
                   setSelectedPromptId(null)
                 }}
               >
                 取消
               </Button>
               <Button
                 onClick={handleAddPrompt}
                 disabled={!selectedPromptId}
               >
                 添加
               </Button>
             </div>
           </div>
         </DialogContent>
       </Dialog>
    </div>
  )
}

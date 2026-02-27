'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { ImportedFolder, PublicPrompt } from '@/types'
import PromptCard from '@/components/PromptCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Folder, User, Calendar, FileText } from 'lucide-react'
import Header from '@/components/Header'
import ProtectedRoute from '@/components/ProtectedRoute'

export default function ImportedFolderDetailPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const params = useParams()
  const folderId = parseInt(params.id as string)

  const [folder, setFolder] = useState<ImportedFolder | null>(null)
  const [prompts, setPrompts] = useState<PublicPrompt[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPrompt, setSelectedPrompt] = useState<PublicPrompt | null>(null)
  const [showPromptDialog, setShowPromptDialog] = useState(false)

  useEffect(() => {
    if (user && folderId) {
      fetchFolderData()
    }
  }, [user, folderId])

  const fetchFolderData = async () => {
    setLoading(true)
    try {
      // 获取导入文件夹信息
      const folderResponse = await api.user.getImportedFolders()
      if (folderResponse.success && folderResponse.data) {
        const foundFolder = folderResponse.data.find((f: ImportedFolder) => f.id === folderId)
        if (foundFolder) {
          setFolder(foundFolder)
        } else {
          toast({
            title: '错误',
            description: '文件夹不存在',
            variant: 'destructive',
          })
          router.push('/prompts')
          return
        }
      }

      // 获取文件夹中的提示词
      const promptsResponse = await api.user.getImportedFolderPrompts(folderId)
      if (promptsResponse.success && promptsResponse.data) {
        setPrompts(promptsResponse.data)
      }
    } catch (error) {
      console.error('Failed to fetch folder data:', error)
      toast({
        title: '获取失败',
        description: '获取文件夹数据失败',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
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

  const handleRemoveFromImportedFolder = async (promptId: number) => {
    try {
      // 对于导入的文件夹，我们只能从用户的导入列表中移除，不能删除原始提示词
      toast({
        title: '提示',
        description: '导入文件夹中的提示词无法删除，但您可以从导入列表中移除整个文件夹',
        variant: 'warning',
      })
    } catch (error) {
      console.error('操作失败:', error)
      toast({
        title: '操作失败',
        description: '操作失败',
        variant: 'destructive',
      })
    }
  }

  const handlePromptClick = (prompt: PublicPrompt) => {
    // 显示提示词完整详情对话框
    setSelectedPrompt(prompt)
    setShowPromptDialog(true)
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
          <Header />
          <div className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">加载中...</p>
              </div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  if (!folder) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
          <Header />
          <div className="container mx-auto px-4 py-8">
            <div className="text-center">
              <p className="text-gray-600">文件夹不存在</p>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* 返回按钮 */}
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => router.push('/prompts')}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>返回我的提示词</span>
            </Button>
          </div>

          {/* 文件夹信息 */}
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center space-x-3">
                <Folder className="h-6 w-6 text-blue-600" />
                <div>
                  <CardTitle className="text-xl">{folder.name}</CardTitle>
                  <div className="flex items-center space-x-4 text-sm text-gray-500 mt-2">
                    <div className="flex items-center space-x-1">
                      <User className="h-4 w-4" />
                      <span>{folder.author}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-4 w-4" />
                      <span>{formatDate(folder.original_created_at)}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <FileText className="h-4 w-4" />
                      <span>{prompts.length} 个提示词</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            {folder.description && (
              <CardContent className="pt-0">
                <p className="text-gray-600">{folder.description}</p>
              </CardContent>
            )}
          </Card>

          {/* 提示词列表 */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">提示词列表</h2>
            {prompts.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <div className="text-center text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>暂无提示词</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {prompts.map((prompt) => (
                  <PromptCard
                    key={prompt.id}
                    prompt={prompt}
                    type="public"
                    onEdit={() => {}} // 导入的提示词暂时不支持编辑
                    onDelete={() => handleRemoveFromImportedFolder(prompt.id)} // 导入的提示词暂时不支持删除
                    onFavoriteChange={() => {}}
                    onClick={() => handlePromptClick(prompt)}
                    disableFavorite={true} // 禁用导入文件夹中提示词的收藏功能
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 提示词详情对话框 */}
        <Dialog open={showPromptDialog} onOpenChange={setShowPromptDialog}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                {selectedPrompt?.title}
              </DialogTitle>
            </DialogHeader>
            {selectedPrompt && (
              <div className="space-y-6">
                {/* 提示词内容 */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">提示词内容</h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                      {selectedPrompt.content}
                    </pre>
                  </div>
                </div>

                {/* 描述信息 */}
                {selectedPrompt.description && (
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-gray-900">描述</h3>
                    <p className="text-gray-600">{selectedPrompt.description}</p>
                  </div>
                )}

                {/* 标签信息 */}
                {selectedPrompt.tags && selectedPrompt.tags.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-gray-900">标签</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedPrompt.tags.map((tag, index) => (
                        <Badge key={`dialog-tag-${selectedPrompt.id}-${index}`} variant="secondary" className="text-sm">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* 分类信息 */}
                {selectedPrompt.category && (
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-gray-900">分类</h3>
                    <Badge variant="outline" className="text-sm">
                      {selectedPrompt.category}
                    </Badge>
                  </div>
                )}

                {/* 统计信息 */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div className="space-y-1">
                    <p className="text-sm text-gray-500">作者</p>
                    <p className="text-sm font-medium">{selectedPrompt.author}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-gray-500">创建时间</p>
                    <p className="text-sm font-medium">{formatDate(selectedPrompt.created_at)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-gray-500">浏览量</p>
                    <p className="text-sm font-medium">{selectedPrompt.views_count || 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-gray-500">收藏数</p>
                    <p className="text-sm font-medium">{selectedPrompt.favorites_count || 0}</p>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  )
} 
'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Plus, 
  Edit, 
  Trash2, 
  Folder, 
  FileText, 
  Users, 
  Settings,
  Search,
  Filter,
  Eye
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { useRouter } from 'next/navigation'
import AdminPromptEditDialog from '@/components/AdminPromptEditDialog'
import AdminFolderEditDialog from '@/components/AdminFolderEditDialog'

interface AdminPrompt {
  id: number
  title: string
  content: string
  description?: string
  author_id: number
  author: string
  category_id?: number
  category?: string
  is_featured: boolean
  created_at: string
  updated_at: string
}

interface AdminFolder {
  id: number
  name: string
  description: string
  user_id: number
  author: string
  original_folder_id: number
  is_featured: boolean
  prompt_count: number
  created_at: string
  updated_at: string
}

export default function AdminPage() {
  const { user, loading } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  
  const [prompts, setPrompts] = useState<AdminPrompt[]>([])
  const [folders, setFolders] = useState<AdminFolder[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('prompts')
  
  // 编辑状�?  const [editingPrompt, setEditingPrompt] = useState<AdminPrompt | null>(null)
  const [editingFolder, setEditingFolder] = useState<AdminFolder | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'prompt' | 'folder', id: number, title: string } | null>(null)
  const [showPromptEditDialog, setShowPromptEditDialog] = useState(false)

  // 检查管理员权限
  useEffect(() => {
    // 只有当用户信息已加载且不是管理员时才跳转
    if (user && !user.is_admin) {
      toast({
        title: '权限不足',
        description: '您没有管理员权限',
        variant: 'destructive',
      })
      router.push('/')
    }
  }, [user, router, toast])

  useEffect(() => {
    if (user?.is_admin) {
      fetchData()
    }
  }, [user])

  const fetchData = async () => {
    setDataLoading(true)
    try {
      const promptsResponse = await api.admin.getPublicPrompts()
      const foldersResponse = await api.admin.getPublicFolders()
      setPrompts(promptsResponse.data || [])
      setFolders(foldersResponse.data || [])
    } catch (error) {
      console.error('Failed to fetch admin data:', error)
      toast({
        title: '获取数据失败',
        description: '无法获取管理员数�?,
        variant: 'destructive',
      })
    } finally {
      setDataLoading(false)
    }
  }

  const handleEditPrompt = (prompt: AdminPrompt) => {
    setEditingPrompt(prompt)
    setShowPromptEditDialog(true)
  }

  const handleEditFolder = (folder: AdminFolder) => {
    setEditingFolder(folder)
    setShowEditDialog(true)
  }

  const handleDelete = (type: 'prompt' | 'folder', id: number, title: string) => {
    setDeleteTarget({ type, id, title })
    setShowDeleteDialog(true)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    
    try {
      if (deleteTarget.type === 'prompt') {
        await api.admin.deletePublicPrompt(deleteTarget.id)
      } else {
        await api.admin.deletePublicFolder(deleteTarget.id)
      }
      
      toast({
        title: '删除成功',
        description: `${deleteTarget.type === 'prompt' ? '提示�? : '文件�?}已删除`,
        variant: 'success',
      })
      
      fetchData()
    } catch (error) {
      console.error('Delete failed:', error)
      toast({
        title: '删除失败',
        description: '删除操作失败',
        variant: 'destructive',
      })
    } finally {
      setShowDeleteDialog(false)
      setDeleteTarget(null)
    }
  }

  const filteredPrompts = prompts.filter(prompt =>
    prompt.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prompt.content.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredFolders = folders.filter(folder =>
    folder.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    folder.description.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // 调试信息
  console.log('Admin page debug:', {
    loading,
    user: user ? {
      id: user.id,
      username: user.username,
      user_type: user.user_type,
      is_admin: user.is_admin,
      is_active: user.is_active
    } : null
  })

  // 如果用户信息还在加载中，显示加载状�?  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">正在加载用户信息...</p>
        </div>
      </div>
    )
  }

  // 如果用户信息已加载但用户不存在，显示权限不足
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">权限不足</h1>
          <p className="text-gray-600">请先登录</p>
        </div>
      </div>
    )
  }

  // 如果用户不是管理员，显示权限不足
  if (!user.is_admin) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">权限不足</h1>
          <p className="text-gray-600">您没有管理员权限</p>
          <div className="mt-4 text-sm text-gray-500">
            <p>用户ID: {user.id}</p>
            <p>用户�? {user.username}</p>
            <p>用户类型: {user.user_type}</p>
            <p>是否管理�? {user.is_admin ? '�? : '�?}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">管理员控制台</h1>
          <p className="text-gray-600 mt-2">管理公共提示词和文件�?/p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="prompts" className="flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span>公共提示�?/span>
              <Badge variant="secondary">{prompts.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="folders" className="flex items-center space-x-2">
              <Folder className="h-4 w-4" />
              <span>公共文件�?/span>
              <Badge variant="secondary">{folders.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="prompts" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>公共提示词管�?/CardTitle>
                  <div className="flex items-center space-x-2">
                    <Input
                      placeholder="搜索提示�?.."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-64"
                    />
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      新建提示�?                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {dataLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600">加载�?..</p>
                  </div>
                ) : filteredPrompts.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">暂无提示�?/h3>
                    <p className="text-gray-600">还没有公共提示词</p>
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
                              {prompt.is_featured && (
                                <Badge variant="default" className="bg-yellow-100 text-yellow-800">
                                  精�?                                </Badge>
                              )}
                              <span className="text-xs text-gray-500">
                                {new Date(prompt.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 ml-4">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditPrompt(prompt)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(`/public-prompts/${prompt.id}`, '_blank')}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete('prompt', prompt.id, prompt.title)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="folders" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>公共文件夹管�?/CardTitle>
                  <div className="flex items-center space-x-2">
                    <Input
                      placeholder="搜索文件�?.."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-64"
                    />
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      新建文件�?                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {dataLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600">加载�?..</p>
                  </div>
                ) : filteredFolders.length === 0 ? (
                  <div className="text-center py-8">
                    <Folder className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">暂无文件�?/h3>
                    <p className="text-gray-600">还没有公共文件夹</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredFolders.map((folder) => (
                      <div key={folder.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg">{folder.name}</h3>
                            <p className="text-sm text-gray-600 mt-1">{folder.author}</p>
                            <p className="text-sm text-gray-500 mt-2">{folder.description}</p>
                            <div className="flex items-center space-x-2 mt-2">
                              {folder.is_featured && (
                                <Badge variant="default" className="bg-yellow-100 text-yellow-800">
                                  精�?                                </Badge>
                              )}
                              <Badge variant="secondary">
                                {folder.prompt_count} 个提示词
                              </Badge>
                              <span className="text-xs text-gray-500">
                                {new Date(folder.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 ml-4">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => router.push(`/admin/folders/${folder.id}`)}
                            >
                              <Folder className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditFolder(folder)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete('folder', folder.id, folder.name)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* 删除确认对话�?*/}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">
              确定要删除{deleteTarget?.type === 'prompt' ? '提示�? : '文件�?} "{deleteTarget?.title}" 吗？此操作不可撤销�?            </p>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(false)}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
              >
                确认删除
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 公共提示词编辑对话框 */}
      <AdminPromptEditDialog
        prompt={editingPrompt}
        open={showPromptEditDialog}
        onOpenChange={setShowPromptEditDialog}
        onSave={() => {
          fetchData()
          setEditingPrompt(null)
        }}
      />

      {/* 公共文件夹编辑对话框 */}
      <AdminFolderEditDialog
        folder={editingFolder}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        onSave={() => {
          fetchData()
          setEditingFolder(null)
        }}
      />
    </div>
  )
} 
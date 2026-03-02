'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Trash2, 
  Folder, 
  FileText, 
  Users, 
  BarChart3,
  Search,
  Eye,
  Star,
  ChevronLeft,
  ChevronRight,
  Crown,
  Shield,
  Home,
  LogOut
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

interface AdminUser {
  id: number
  username: string
  email: string
  user_type: string
  is_admin: boolean | number
  is_active: boolean | number
  avatar_url?: string
  created_at: string
  updated_at: string
}

interface StatsData {
  stats: {
    totalUsers: number
    adminUsers: number
    activeUsers: number
    totalPrompts: number
    totalPublicPrompts: number
    featuredPrompts: number
    totalPublicFolders: number
    totalFavorites: number
  }
  recentUsers: Array<{ id: number; username: string; email: string; user_type: string; is_admin: boolean; created_at: string }>
  recentPrompts: Array<{ id: number; title: string; created_at: string; views_count: number; author: string }>
}

export default function AdminPage() {
  const { user, loading } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  
  const [activeTab, setActiveTab] = useState('dashboard')
  
  // 统计数据
  const [statsData, setStatsData] = useState<StatsData | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  
  // 提示词
  const [prompts, setPrompts] = useState<AdminPrompt[]>([])
  const [promptsLoading, setPromptsLoading] = useState(false)
  const [promptSearch, setPromptSearch] = useState('')
  
  // 文件夹
  const [folders, setFolders] = useState<AdminFolder[]>([])
  const [foldersLoading, setFoldersLoading] = useState(false)
  const [folderSearch, setFolderSearch] = useState('')
  
  // 用户
  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userPage, setUserPage] = useState(1)
  const [userTotal, setUserTotal] = useState(0)
  const [userTotalPages, setUserTotalPages] = useState(0)
  
  // 编辑状态
  const [editingPrompt, setEditingPrompt] = useState<AdminPrompt | null>(null)
  const [editingFolder, setEditingFolder] = useState<AdminFolder | null>(null)
  const [showPromptEditDialog, setShowPromptEditDialog] = useState(false)
  const [showFolderEditDialog, setShowFolderEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'prompt' | 'folder' | 'user'; id: number; title: string } | null>(null)

  // 管理员权限检查
  useEffect(() => {
    if (user && !user.is_admin) {
      toast({ title: '权限不足', description: '您没有管理员权限', variant: 'destructive' })
      router.push('/')
    }
  }, [user, router, toast])

  // 获取统计数据
  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await api.admin.getStats()
      if (res.success && res.data) {
        setStatsData(res.data)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setStatsLoading(false)
    }
  }, [])

  // 获取提示词
  const fetchPrompts = useCallback(async () => {
    setPromptsLoading(true)
    try {
      const res = await api.admin.getPublicPrompts()
      setPrompts(res.data || [])
    } catch (error) {
      console.error('Failed to fetch prompts:', error)
    } finally {
      setPromptsLoading(false)
    }
  }, [])

  // 获取文件夹
  const fetchFolders = useCallback(async () => {
    setFoldersLoading(true)
    try {
      const res = await api.admin.getPublicFolders()
      setFolders(res.data || [])
    } catch (error) {
      console.error('Failed to fetch folders:', error)
    } finally {
      setFoldersLoading(false)
    }
  }, [])

  // 获取用户
  const fetchUsers = useCallback(async (page = 1, search = '') => {
    setUsersLoading(true)
    try {
      const res = await api.admin.users.list({ page, limit: 15, search: search || undefined })
      if (res.success && res.data) {
        setUsers(res.data.users as unknown as AdminUser[])
        setUserTotal(res.data.total)
        setUserTotalPages(res.data.totalPages)
        setUserPage(res.data.page)
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setUsersLoading(false)
    }
  }, [])

  // 初始加载
  useEffect(() => {
    if (user?.is_admin) {
      fetchStats()
    }
  }, [user, fetchStats])

  // Tab 切换时加载数据
  useEffect(() => {
    if (!user?.is_admin) return
    if (activeTab === 'prompts' && prompts.length === 0) fetchPrompts()
    if (activeTab === 'folders' && folders.length === 0) fetchFolders()
    if (activeTab === 'users' && users.length === 0) fetchUsers(1, '')
  }, [activeTab, user, fetchPrompts, fetchFolders, fetchUsers, prompts.length, folders.length, users.length])

  // 删除操作
  const handleDelete = (type: 'prompt' | 'folder' | 'user', id: number, title: string) => {
    setDeleteTarget({ type, id, title })
    setShowDeleteDialog(true)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.type === 'prompt') {
        await api.admin.deletePublicPrompt(deleteTarget.id)
        fetchPrompts()
      } else if (deleteTarget.type === 'folder') {
        await api.admin.deletePublicFolder(deleteTarget.id)
        fetchFolders()
      } else if (deleteTarget.type === 'user') {
        await api.admin.users.delete(deleteTarget.id)
        fetchUsers(userPage, userSearch)
      }
      toast({ title: '删除成功', description: `已删除 "${deleteTarget.title}"` })
      // 刷新统计
      fetchStats()
    } catch (error) {
      console.error('Delete failed:', error)
      toast({ title: '删除失败', description: '操作失败，请重试', variant: 'destructive' })
    } finally {
      setShowDeleteDialog(false)
      setDeleteTarget(null)
    }
  }

  // 更新用户权限
  const toggleUserAdmin = async (userId: number, currentIsAdmin: boolean) => {
    try {
      await api.admin.users.update(userId, { is_admin: !currentIsAdmin })
      toast({ title: '更新成功', description: `已${!currentIsAdmin ? '设为' : '取消'}管理员` })
      fetchUsers(userPage, userSearch)
      fetchStats()
    } catch (error) {
      toast({ title: '更新失败', variant: 'destructive' })
    }
  }

  const toggleUserActive = async (userId: number, currentIsActive: boolean) => {
    try {
      await api.admin.users.update(userId, { is_active: !currentIsActive })
      toast({ title: '更新成功', description: `已${!currentIsActive ? '启用' : '禁用'}用户` })
      fetchUsers(userPage, userSearch)
      fetchStats()
    } catch (error) {
      toast({ title: '更新失败', variant: 'destructive' })
    }
  }

  // 修改用户类型
  const changeUserType = async (userId: number, newType: string) => {
    try {
      await api.admin.users.update(userId, { user_type: newType })
      const labels: Record<string, string> = { free: '免费用户', pro: 'Pro 会员', admin: '管理员' }
      toast({ title: '更新成功', description: `已设为${labels[newType] || newType}` })
      fetchUsers(userPage, userSearch)
      fetchStats()
    } catch (error) {
      toast({ title: '更新失败', variant: 'destructive' })
    }
  }

  // 格式化日期为 2026/2/28 格式
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
  }

  // 格式化完整日期时间
  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  // 过滤
  const filteredPrompts = prompts.filter(p =>
    p.title.toLowerCase().includes(promptSearch.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(promptSearch.toLowerCase())
  )

  const filteredFolders = folders.filter(f =>
    f.name.toLowerCase().includes(folderSearch.toLowerCase()) ||
    (f.description || '').toLowerCase().includes(folderSearch.toLowerCase())
  )

  // 加载状态
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">正在加载...</p>
        </div>
      </div>
    )
  }

  if (!user || !user.is_admin) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">权限不足</h1>
          <p className="text-gray-600 dark:text-gray-400">{!user ? '请先登录' : '您没有管理员权限'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 页面标题 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">管理员控制台</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">管理系统资源和用户</p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={() => router.push('/')}>
              <Home className="h-4 w-4 mr-2" />
              返回主页
            </Button>
            <Button variant="outline" onClick={() => router.push('/prompts')}>
              <FileText className="h-4 w-4 mr-2" />
              我的提示词
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="dashboard" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>数据概览</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>用户管理</span>
            </TabsTrigger>
            <TabsTrigger value="prompts" className="flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span>提示词</span>
              {prompts.length > 0 && <Badge variant="secondary" className="ml-1">{prompts.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="folders" className="flex items-center space-x-2">
              <Folder className="h-4 w-4" />
              <span>文件夹</span>
              {folders.length > 0 && <Badge variant="secondary" className="ml-1">{folders.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* ===== 数据概览 Tab ===== */}
          <TabsContent value="dashboard" className="mt-6">
            {statsLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600 dark:text-gray-400">加载统计数据...</p>
              </div>
            ) : statsData ? (
              <div className="space-y-6">
                {/* 统计卡片 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center space-x-2">
                        <Users className="h-8 w-8 text-blue-600" />
                        <div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">总用户</p>
                          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{statsData.stats.totalUsers}</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        管理员 {statsData.stats.adminUsers} · 活跃 {statsData.stats.activeUsers}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center space-x-2">
                        <FileText className="h-8 w-8 text-green-600" />
                        <div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">公共提示词</p>
                          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{statsData.stats.totalPublicPrompts}</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        精选 {statsData.stats.featuredPrompts} · 总提示词 {statsData.stats.totalPrompts}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center space-x-2">
                        <Folder className="h-8 w-8 text-purple-600" />
                        <div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">公共文件夹</p>
                          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{statsData.stats.totalPublicFolders}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center space-x-2">
                        <Star className="h-8 w-8 text-yellow-500" />
                        <div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">收藏总数</p>
                          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{statsData.stats.totalFavorites}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* 最近活动 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">最近注册用户</CardTitle>
                        <Badge variant="secondary" className="text-xs">共 {statsData.recentUsers.length} 人</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <ScrollArea className="h-[420px] pr-3">
                        <div className="space-y-1">
                          {statsData.recentUsers.map((u) => (
                            <div key={u.id} className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors border-b last:border-0 dark:border-gray-800">
                              <div className="flex items-center space-x-3">
                                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                                  {u.username.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center space-x-2">
                                    <p className="font-medium text-gray-900 dark:text-gray-100">{u.username}</p>
                                    {u.is_admin && <Shield className="h-3.5 w-3.5 text-red-500" />}
                                  </div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">{u.email || '未设置邮箱'}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {u.user_type === 'admin' ? '管理员' : u.user_type === 'pro' ? 'Pro' : '免费'}
                                </Badge>
                                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 tabular-nums">{formatDate(u.created_at)}</p>
                              </div>
                            </div>
                          ))}
                          {statsData.recentUsers.length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-8">暂无数据</p>
                          )}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">最近公共提示词</CardTitle>
                        <Badge variant="secondary" className="text-xs">共 {statsData.recentPrompts.length} 条</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <ScrollArea className="h-[420px] pr-3">
                        <div className="space-y-1">
                          {statsData.recentPrompts.map((p) => (
                            <div key={p.id} className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors border-b last:border-0 dark:border-gray-800">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{p.title}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">作者: {p.author || '未知'}</p>
                              </div>
                              <div className="text-right ml-4 flex-shrink-0">
                                <div className="flex items-center justify-end space-x-1 text-gray-500 dark:text-gray-400">
                                  <Eye className="h-3.5 w-3.5" />
                                  <span className="text-sm font-medium tabular-nums">{p.views_count ?? 0}</span>
                                </div>
                                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 tabular-nums">{formatDate(p.created_at)}</p>
                              </div>
                            </div>
                          ))}
                          {statsData.recentPrompts.length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-8">暂无数据</p>
                          )}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">无法加载统计数据</div>
            )}
          </TabsContent>

          {/* ===== 用户管理 Tab ===== */}
          <TabsContent value="users" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>用户管理</CardTitle>
                  <div className="flex items-center space-x-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="搜索用户名或邮箱..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') fetchUsers(1, userSearch) }}
                        className="pl-9 w-64"
                      />
                    </div>
                    <Button variant="outline" onClick={() => fetchUsers(1, userSearch)}>
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">加载中...</p>
                  </div>
                ) : users.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">暂无用户</h3>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b dark:border-gray-800 text-left">
                            <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">ID</th>
                            <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">用户名</th>
                            <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">邮箱</th>
                            <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">类型</th>
                            <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">管理员</th>
                            <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">状态</th>
                            <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">注册时间</th>
                            <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((u) => (
                            <tr key={u.id} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900">
                              <td className="py-3 text-gray-900 dark:text-gray-100">{u.id}</td>
                              <td className="py-3">
                                <span className="font-medium text-gray-900 dark:text-gray-100">{u.username}</span>
                              </td>
                              <td className="py-3 text-gray-600 dark:text-gray-400">{u.email || '-'}</td>
                              <td className="py-3">
                                <Select
                                  value={u.user_type}
                                  onValueChange={(val) => changeUserType(u.id, val)}
                                  disabled={u.id === user.id}
                                >
                                  <SelectTrigger className="w-[100px] h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="free">
                                      <span className="flex items-center space-x-1"><Users className="h-3 w-3 text-gray-500" /><span>免费</span></span>
                                    </SelectItem>
                                    <SelectItem value="pro">
                                      <span className="flex items-center space-x-1"><Crown className="h-3 w-3 text-amber-500" /><span>Pro</span></span>
                                    </SelectItem>
                                    <SelectItem value="admin">
                                      <span className="flex items-center space-x-1"><Shield className="h-3 w-3 text-red-500" /><span>管理员</span></span>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="py-3">
                                <Switch
                                  checked={!!u.is_admin}
                                  onCheckedChange={() => toggleUserAdmin(u.id, !!u.is_admin)}
                                  disabled={u.id === user.id}
                                />
                              </td>
                              <td className="py-3">
                                <Switch
                                  checked={!!u.is_active}
                                  onCheckedChange={() => toggleUserActive(u.id, !!u.is_active)}
                                  disabled={u.id === user.id}
                                />
                              </td>
                              <td className="py-3 text-gray-500 dark:text-gray-400 text-xs tabular-nums">
                                {formatDateTime(u.created_at)}
                              </td>
                              <td className="py-3">
                                {u.id !== user.id && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDelete('user', u.id, u.username)}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* 分页 */}
                    {userTotalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t dark:border-gray-800">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          共 {userTotal} 个用户，第 {userPage}/{userTotalPages} 页
                        </p>
                        <div className="flex items-center space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={userPage <= 1}
                            onClick={() => fetchUsers(userPage - 1, userSearch)}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={userPage >= userTotalPages}
                            onClick={() => fetchUsers(userPage + 1, userSearch)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== 公共提示词 Tab ===== */}
          <TabsContent value="prompts" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>公共提示词管理</CardTitle>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="搜索提示词..."
                      value={promptSearch}
                      onChange={(e) => setPromptSearch(e.target.value)}
                      className="pl-9 w-64"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {promptsLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">加载中...</p>
                  </div>
                ) : filteredPrompts.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">暂无提示词</h3>
                    <p className="text-gray-600 dark:text-gray-400">还没有公共提示词</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredPrompts.map((prompt) => (
                      <div
                        key={prompt.id}
                        className="border dark:border-gray-800 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => { setEditingPrompt(prompt); setShowPromptEditDialog(true) }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">{prompt.title}</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">作者: {prompt.author}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">
                              {prompt.description || prompt.content}
                            </p>
                            <div className="flex items-center space-x-2 mt-2">
                              {prompt.is_featured && (
                                <Badge variant="default" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">精选</Badge>
                              )}
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {new Date(prompt.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 ml-4" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="outline" onClick={() => window.open(`/public-prompts/${prompt.id}`, '_blank')}>
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

          {/* ===== 公共文件夹 Tab ===== */}
          <TabsContent value="folders" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>公共文件夹管理</CardTitle>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="搜索文件夹..."
                      value={folderSearch}
                      onChange={(e) => setFolderSearch(e.target.value)}
                      className="pl-9 w-64"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {foldersLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">加载中...</p>
                  </div>
                ) : filteredFolders.length === 0 ? (
                  <div className="text-center py-8">
                    <Folder className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">暂无文件夹</h3>
                    <p className="text-gray-600 dark:text-gray-400">还没有公共文件夹</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredFolders.map((folder) => (
                      <div
                        key={folder.id}
                        className="border dark:border-gray-800 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => { setEditingFolder(folder); setShowFolderEditDialog(true) }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">{folder.name}</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">作者: {folder.author}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{folder.description}</p>
                            <div className="flex items-center space-x-2 mt-2">
                              {folder.is_featured && (
                                <Badge variant="default" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">精选</Badge>
                              )}
                              <Badge variant="secondary">{folder.prompt_count} 个提示词</Badge>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {new Date(folder.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 ml-4" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="outline" onClick={() => window.open(`/public-folders/${folder.id}`, '_blank')}>
                              <Eye className="h-4 w-4" />
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

      {/* 删除确认对话框 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              确定要删除
              {deleteTarget?.type === 'prompt' ? '提示词' : deleteTarget?.type === 'folder' ? '文件夹' : '用户'}
              {' '}&ldquo;{deleteTarget?.title}&rdquo; 吗？此操作不可撤销。
            </p>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>取消</Button>
              <Button variant="destructive" onClick={confirmDelete}>确认删除</Button>
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
          fetchPrompts()
          setEditingPrompt(null)
        }}
      />

      {/* 公共文件夹编辑对话框 */}
      <AdminFolderEditDialog
        folder={editingFolder}
        open={showFolderEditDialog}
        onOpenChange={setShowFolderEditDialog}
        onSave={() => {
          fetchFolders()
          setEditingFolder(null)
        }}
      />
    </div>
  )
}

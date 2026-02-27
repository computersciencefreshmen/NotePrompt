'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  User,
  Mail,
  Calendar,
  Settings,
  Star,
  FileText,
  Heart,
  TrendingUp,
  Crown
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import { UserStats } from '@/types'
import { toast } from '@/hooks/use-toast'

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [message, setMessage] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [formData, setFormData] = useState({
    username: '',
    email: ''
  })

  // 检查登录状�?
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
      return
    }

    if (user) {
      setFormData({
        username: user.username,
        email: user.email
      })
      fetchUserStats()
    }
  }, [user, authLoading, router])

  const fetchUserStats = async () => {
    if (!user) return

    setLoading(true)
    try {
      const response = await api.user.getStats()
      if (response.success && response.data) {
        setStats(response.data)
      }
    } catch (error) {
      console.error('Failed to fetch user stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateProfile = async () => {
    if (!user) return

    setUpdating(true)
    setMessage('')

    try {
      const response = await api.user.updateProfile({
        username: formData.username,
        email: formData.email
      })

      if (response.success) {
        setMessage('个人信息更新成功')
        setEditMode(false)
        toast({
          title: '成功',
          description: '个人信息更新成功',
        })
        // 这里可以触发用户数据刷新
      } else {
        setMessage(response.error || '更新失败')
        toast({
          title: '失败',
          description: response.error || '更新失败',
          variant: 'destructive',
        })
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新失败，请稍后重试')
      toast({
        title: '失败',
        description: error instanceof Error ? error.message : '更新失败，请稍后重试',
        variant: 'destructive',
      })
    } finally {
      setUpdating(false)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载�?..</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">个人资料</h1>
          <p className="text-gray-600 mt-2">管理您的账户信息和使用统�?/p>
        </div>

        {message && (
          <div className="mb-6 border-blue-200 bg-blue-50 rounded-lg p-4">
            <p className="text-blue-800">{message}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 个人信息卡片 */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>个人信息</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditMode(!editMode)}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    {editMode ? '取消编辑' : '编辑资料'}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 头像区域 */}
                <div className="flex items-center space-x-4">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={user.avatar_url} alt={user.username} />
                    <AvatarFallback className="text-xl">
                      {user.username.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-xl font-semibold">{user.username}</h3>
                    <div className="flex items-center mt-2">
                      <Badge variant={user.user_type === 'pro' ? 'default' : 'secondary'}>
                        {user.user_type === 'pro' ? (
                          <>
                            <Crown className="h-3 w-3 mr-1" />
                            专业�?
                          </>
                        ) : (
                          '免费�?
                        )}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* 基本信息 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <User className="h-4 w-4 inline mr-2" />
                      用户�?
                    </label>
                    {editMode ? (
                      <Input
                        value={formData.username}
                        onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                        placeholder="输入用户�?
                      />
                    ) : (
                      <p className="text-gray-900">{user.username}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Mail className="h-4 w-4 inline mr-2" />
                      邮箱地址
                    </label>
                    {editMode ? (
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="输入邮箱地址"
                      />
                    ) : (
                      <p className="text-gray-900">{user.email}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Calendar className="h-4 w-4 inline mr-2" />
                      注册时间
                    </label>
                    <p className="text-gray-900">{formatDate(user.created_at)}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">状�?/label>
                    <Badge variant={user.is_active ? 'default' : 'secondary'}>
                      {user.is_active ? '活跃' : '未激�?}
                    </Badge>
                  </div>
                </div>

                {editMode && (
                  <div className="flex space-x-3">
                    <Button
                      onClick={handleUpdateProfile}
                      disabled={updating}
                      className="bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      {updating ? '更新�?..' : '保存更改'}
                    </Button>
                    <Button variant="outline" onClick={() => setEditMode(false)}>
                      取消
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 使用统计 */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  使用统计
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto mb-2"></div>
                    <p className="text-sm text-gray-600">加载统计�?..</p>
                  </div>
                ) : stats ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <FileText className="h-4 w-4 mr-2 text-blue-500" />
                        <span className="text-sm">总提示词</span>
                      </div>
                      <span className="font-semibold">{stats.total_prompts}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Heart className="h-4 w-4 mr-2 text-red-500" />
                        <span className="text-sm">收藏数量</span>
                      </div>
                      <span className="font-semibold">{stats.total_favorites}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Star className="h-4 w-4 mr-2 text-yellow-500" />
                        <span className="text-sm">文件夹数�?/span>
                      </div>
                      <span className="font-semibold">{stats.total_folders}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <TrendingUp className="h-4 w-4 mr-2 text-green-500" />
                        <span className="text-sm">本月优化</span>
                      </div>
                      <span className="font-semibold">{stats.ai_optimize_count || 0}</span>
                    </div>

                    <hr className="my-4" />

                    <div className="text-center">
                      <p className="text-xs text-gray-500">
                        {user.user_type === 'free' ? `免费版限�? ${stats.max_prompts} 个提示词` : '专业版无限制'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-gray-500 py-8">暂无统计数据</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 快捷操作 */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>快捷操作</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button variant="outline" onClick={() => router.push('/prompts/new')}>
                <FileText className="h-4 w-4 mr-2" />
                创建提示�?
              </Button>
              <Button variant="outline" onClick={() => router.push('/prompts')}>
                <FileText className="h-4 w-4 mr-2" />
                我的提示�?
              </Button>
              <Button variant="outline" onClick={() => router.push('/favorites')}>
                <Heart className="h-4 w-4 mr-2" />
                我的收藏
              </Button>
              <Button variant="outline" onClick={() => router.push('/settings')}>
                <Settings className="h-4 w-4 mr-2" />
                账户设置
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

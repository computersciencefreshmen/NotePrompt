'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
// Alert component removed - using Card instead
import { Switch } from '@/components/ui/switch'
import {
  Settings,
  Shield,
  Bell,
  Palette,
  Download,
  Trash2,
  AlertTriangle,
  Lock,
  User,
  Smartphone
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'

export default function SettingsPage() {
  const { user, logout, loading: authLoading } = useAuth()
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // 设置项状态
  const [settings, setSettings] = useState({
    // 隐私设置
    profilePublic: false,
    showEmail: false,
    allowIndexing: true,

    // 通知设置
    emailNotifications: true,
    browserNotifications: false,
    weeklyDigest: true,

    // 界面设置
    darkMode: false,
    compactView: false,
    showTips: true,

    // 密码修改
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  // 检查登录状态
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
      return
    }
  }, [user, authLoading, router])

  const handleSettingChange = (key: string, value: boolean | string) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handlePasswordChange = async () => {
    if (!settings.currentPassword || !settings.newPassword || !settings.confirmPassword) {
      toast({ description: '请填写所有密码字段', variant: 'destructive' })
      return
    }

    if (settings.newPassword !== settings.confirmPassword) {
      toast({ description: '新密码确认不匹配', variant: 'destructive' })
      return
    }

    if (settings.newPassword.length < 6) {
      toast({ description: '新密码长度至少6位', variant: 'destructive' })
      return
    }

    setLoading(true)

    try {
      // 调用密码修改API
      const response = await api.user.changePassword({
        currentPassword: settings.currentPassword,
        newPassword: settings.newPassword
      })

      if (response.success) {
        toast({ description: '密码修改成功' })
        setSettings(prev => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        }))
      } else {
        toast({ description: response.error || '密码修改失败', variant: 'destructive' })
      }
    } catch (error) {
      toast({ description: '密码修改失败，请检查当前密码是否正确', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleExportData = async () => {
    setLoading(true)
    try {
      // 调用数据导出API
      const response = await api.user.exportData()

      if (response.success && response.data) {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], {
          type: 'application/json'
        })

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `note-prompt-data-${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        toast({ description: '数据导出成功' })
      } else {
        toast({ description: response.error || '数据导出失败', variant: 'destructive' })
      }
    } catch (error) {
      toast({ description: '数据导出失败', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true)
      return
    }

    setLoading(true)
    try {
      // 调用账户删除API
      const response = await api.user.deleteAccount()

      if (response.success) {
        toast({ description: '账户删除成功，即将退出登录..' })
        setTimeout(() => {
          logout()
          router.push('/')
        }, 2000)
      } else {
        toast({ description: response.error || '账户删除失败', variant: 'destructive' })
      }
    } catch (error) {
      toast({ description: '账户删除失败，请稍后重试', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载中..</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">账户设置</h1>
          <p className="text-gray-600 mt-2">管理您的账户偏好和隐私设置</p>
        </div>



        <div className="space-y-6">
          {/* 隐私设置 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="h-5 w-5 mr-2" />
                隐私设置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">公开个人资料</h4>
                  <p className="text-sm text-gray-600">允许其他用户查看您的基本信息</p>
                </div>
                <Switch
                  checked={settings.profilePublic}
                  onCheckedChange={(checked) => handleSettingChange('profilePublic', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">显示邮箱地址</h4>
                  <p className="text-sm text-gray-600">在个人资料中显示邮箱地址</p>
                </div>
                <Switch
                  checked={settings.showEmail}
                  onCheckedChange={(checked) => handleSettingChange('showEmail', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">允许搜索引擎索引</h4>
                  <p className="text-sm text-gray-600">您的公开内容可能出现在搜索结果中</p>
                </div>
                <Switch
                  checked={settings.allowIndexing}
                  onCheckedChange={(checked) => handleSettingChange('allowIndexing', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* 通知设置 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Bell className="h-5 w-5 mr-2" />
                通知设置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">邮件通知</h4>
                  <p className="text-sm text-gray-600">接收重要更新和活动通知</p>
                </div>
                <Switch
                  checked={settings.emailNotifications}
                  onCheckedChange={(checked) => handleSettingChange('emailNotifications', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">浏览器通知</h4>
                  <p className="text-sm text-gray-600">在浏览器中显示即时通知</p>
                </div>
                <Switch
                  checked={settings.browserNotifications}
                  onCheckedChange={(checked) => handleSettingChange('browserNotifications', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">每周摘要</h4>
                  <p className="text-sm text-gray-600">接收每周使用情况摘要</p>
                </div>
                <Switch
                  checked={settings.weeklyDigest}
                  onCheckedChange={(checked) => handleSettingChange('weeklyDigest', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* 界面设置 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Palette className="h-5 w-5 mr-2" />
                界面设置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">深色模式</h4>
                  <p className="text-sm text-gray-600">使用深色主题（即将推出）</p>
                </div>
                <Switch
                  checked={settings.darkMode}
                  onCheckedChange={(checked) => handleSettingChange('darkMode', checked)}
                  disabled
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">紧凑视图</h4>
                  <p className="text-sm text-gray-600">减少界面间距，显示更多内容</p>
                </div>
                <Switch
                  checked={settings.compactView}
                  onCheckedChange={(checked) => handleSettingChange('compactView', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">显示使用提示</h4>
                  <p className="text-sm text-gray-600">在界面上显示操作提示和帮助信息</p>
                </div>
                <Switch
                  checked={settings.showTips}
                  onCheckedChange={(checked) => handleSettingChange('showTips', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* 密码修改 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Lock className="h-5 w-5 mr-2" />
                修改密码
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">当前密码</label>
                <Input
                  type="password"
                  value={settings.currentPassword}
                  onChange={(e) => handleSettingChange('currentPassword', e.target.value)}
                  placeholder="输入当前密码"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">新密码</label>
                <Input
                  type="password"
                  value={settings.newPassword}
                  onChange={(e) => handleSettingChange('newPassword', e.target.value)}
                  placeholder="输入新密码（至少6位）"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">确认新密码</label>
                <Input
                  type="password"
                  value={settings.confirmPassword}
                  onChange={(e) => handleSettingChange('confirmPassword', e.target.value)}
                  placeholder="再次输入新密码"
                />
              </div>

              <Button
                onClick={handlePasswordChange}
                disabled={loading}
                className="bg-teal-600 hover:bg-teal-700 text-white"
              >
                {loading ? '修改中..' : '修改密码'}
              </Button>
            </CardContent>
          </Card>

          {/* 数据管理 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Download className="h-5 w-5 mr-2" />
                数据管理
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">导出数据</h4>
                <p className="text-sm text-gray-600 mb-4">下载您的所有数据，包括提示词、收藏等</p>
                <Button
                  onClick={handleExportData}
                  disabled={loading}
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {loading ? '导出中..' : '导出数据'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 危险操作 */}
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="flex items-center text-red-600">
                <AlertTriangle className="h-5 w-5 mr-2" />
                危险操作
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <h4 className="font-medium mb-2 text-red-600">删除账户</h4>
                <p className="text-sm text-gray-600 mb-4">
                  永久删除您的账户和所有相关数据。此操作不可恢复！
                </p>

                {!showDeleteConfirm ? (
                  <Button
                    onClick={handleDeleteAccount}
                    variant="destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    删除账户
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <Card className="border-red-200 bg-red-50">
                      <CardContent className="pt-6">
                        <div className="flex items-start space-x-2">
                          <AlertTriangle className="h-4 w-4 mt-0.5 text-red-600" />
                          <p className="text-red-700">
                            确认删除账户？此操作将永久删除您的所有数据，无法恢复！
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                    <div className="flex space-x-3">
                      <Button
                        onClick={handleDeleteAccount}
                        disabled={loading}
                        variant="destructive"
                      >
                        {loading ? '删除中..' : '确认删除'}
                      </Button>
                      <Button
                        onClick={() => setShowDeleteConfirm(false)}
                        variant="outline"
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 快捷操作 */}
          <Card>
            <CardHeader>
              <CardTitle>快捷操作</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Button variant="outline" onClick={() => router.push('/profile')}>
                  <User className="h-4 w-4 mr-2" />
                  个人资料
                </Button>
                <Button variant="outline" onClick={() => router.push('/prompts')}>
                  <Settings className="h-4 w-4 mr-2" />
                  我的提示词
                </Button>
                <Button variant="outline" onClick={() => router.push('/favorites')}>
                  <Smartphone className="h-4 w-4 mr-2" />
                  我的收藏
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

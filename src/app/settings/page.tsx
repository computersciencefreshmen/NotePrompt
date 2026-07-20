'use client'

import { useCallback, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
// Alert component removed - using Card instead
import {
  Settings,
  Palette,
  Download,
  Trash2,
  AlertTriangle,
  Lock,
  User,
  Smartphone,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { resolveThemePreference, useTheme } from '@/contexts/ThemeContext'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferencesDto,
} from '@/lib/user-preferences'
import { getPasswordPolicyError } from '@/lib/password-security'

type PasswordFields = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export default function SettingsPage() {
  const { user, logout, loading: authLoading } = useAuth()
  const { setTheme } = useTheme()
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')

  const [settings, setSettings] = useState<PasswordFields>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [preferences, setPreferences] = useState<UserPreferencesDto>(DEFAULT_USER_PREFERENCES)
  const [preferencesLoading, setPreferencesLoading] = useState(true)
  const [preferencesSaving, setPreferencesSaving] = useState(false)
  const [preferencesError, setPreferencesError] = useState('')

  // 检查登录状态
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
      return
    }
  }, [user, authLoading, router])

  const applyPreferences = useCallback((next: UserPreferencesDto) => {
    const resolvedTheme = resolveThemePreference(next.theme)
    setPreferences({ ...next, theme: resolvedTheme, visualStyle: 'workbench' })
    setTheme(resolvedTheme)
  }, [setTheme])

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()

    const loadPreferences = async () => {
      setPreferencesLoading(true)
      setPreferencesError('')
      try {
        const response = await fetch('/api/v1/user/preferences', {
          credentials: 'same-origin',
          signal: controller.signal,
        })
        const payload = await response.json()
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || '获取偏好设置失败')
        }
        applyPreferences(payload.data as UserPreferencesDto)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setPreferencesError(error instanceof Error ? error.message : '获取偏好设置失败')
      } finally {
        if (!controller.signal.aborted) setPreferencesLoading(false)
      }
    }

    void loadPreferences()
    return () => controller.abort()
  }, [applyPreferences, user])

  const handleSettingChange = (key: keyof PasswordFields, value: string) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleSavePreferences = async () => {
    setPreferencesSaving(true)
    setPreferencesError('')
    try {
      const response = await fetch('/api/v1/user/preferences', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || '保存偏好设置失败')
      }
      applyPreferences(payload.data as UserPreferencesDto)
      toast({ description: '偏好设置已保存' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存偏好设置失败'
      setPreferencesError(message)
      toast({ description: message, variant: 'destructive' })
    } finally {
      setPreferencesSaving(false)
    }
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

    const passwordPolicyError = getPasswordPolicyError(settings.newPassword)
    if (passwordPolicyError) {
      toast({ description: passwordPolicyError, variant: 'destructive' })
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
        toast({ description: '密码修改成功，请重新登录' })
        setSettings(prev => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        }))
        logout()
        router.replace('/login')
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

    if (!deletePassword) {
      toast({ description: '请输入当前密码以确认删除账户', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      // 调用账户删除API
      const response = await api.user.deleteAccount(deletePassword)

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
          <p className="text-gray-600 mt-2">管理真实生效并可跨设备同步的界面偏好与账户安全</p>
        </div>



        <div className="space-y-6">
          {/* 仅展示已经接入真实行为和持久化的偏好。 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Palette className="h-5 w-5 mr-2" />
                界面设置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {preferencesError && (
                <div role="alert" className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {preferencesError}
                </div>
              )}

              <div>
                <h4 className="font-medium">主题</h4>
                <p className="mt-1 text-sm text-[var(--np-ink-muted)]">仅保留浅色与深色，两者使用同一套产品语义和交互规则。</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {([
                    ['light', '浅色'],
                    ['dark', '深色'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={preferences.theme === value}
                      onClick={() => {
                        setPreferences(current => ({ ...current, theme: value }))
                        setTheme(value)
                      }}
                      className={`rounded-[8px] border px-3 py-2 text-sm font-medium transition-colors ${
                        preferences.theme === value
                          ? 'border-[var(--np-accent-strong)] bg-[var(--np-accent-soft)] text-[var(--np-ink)]'
                          : 'border-[var(--np-rule)] bg-[var(--np-surface-raised)] text-[var(--np-ink-muted)] hover:text-[var(--np-ink)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-[var(--np-rule)] pt-4" />

              <div>
                <h4 className="font-medium">产品界面</h4>
                <div className="mt-3 rounded-[8px] border border-[var(--np-rule)] bg-[var(--np-surface-soft)] p-4">
                  <p className="font-medium text-[var(--np-ink)]">Claude 风格工作台</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--np-ink-muted)]">
                    全站登录后区域统一使用温暖纸张、克制陶土色与衬线排版；旧版四套视觉偏好已自动归一，不再产生互相覆盖的皮肤。
                  </p>
                </div>
              </div>

              <div className="border-t border-[var(--np-rule)] pt-4" />

              <div>
                <h4 className="font-medium">默认编辑模式</h4>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">新建提示词时默认打开普通编辑器或结构化专业编辑器。</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {([
                    ['normal', '普通模式'],
                    ['professional', '专业模式'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={preferences.defaultEditorMode === value}
                      onClick={() => setPreferences(current => ({ ...current, defaultEditorMode: value }))}
                      className={`rounded-[8px] border px-3 py-2 text-sm font-medium transition-colors ${
                        preferences.defaultEditorMode === value
                          ? 'border-teal-500 bg-teal-50 text-teal-950 dark:border-teal-400 dark:bg-teal-950/30 dark:text-teal-50'
                          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-gray-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                type="button"
                onClick={handleSavePreferences}
                disabled={preferencesLoading || preferencesSaving}
                className="bg-[var(--np-accent)] text-[var(--np-ink)] hover:bg-[var(--np-accent-hover)]"
              >
                {preferencesLoading ? '加载中...' : preferencesSaving ? '保存中...' : '保存界面偏好'}
              </Button>
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
                <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-2">当前密码</label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  value={settings.currentPassword}
                  onChange={(e) => handleSettingChange('currentPassword', e.target.value)}
                  placeholder="输入当前密码"
                />
              </div>

              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-2">新密码</label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  maxLength={128}
                  value={settings.newPassword}
                  onChange={(e) => handleSettingChange('newPassword', e.target.value)}
                  placeholder="8-128位，包含大小写字母和数字"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-2">确认新密码</label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  maxLength={128}
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
                    <div>
                      <label htmlFor="delete-account-password" className="block text-sm font-medium text-gray-700 mb-2">
                        当前密码
                      </label>
                      <Input
                        id="delete-account-password"
                        type="password"
                        autoComplete="current-password"
                        maxLength={128}
                        value={deletePassword}
                        onChange={(event) => setDeletePassword(event.target.value)}
                        placeholder="输入当前密码以确认"
                      />
                    </div>
                    <div className="flex space-x-3">
                      <Button
                        onClick={handleDeleteAccount}
                        disabled={loading}
                        variant="destructive"
                      >
                        {loading ? '删除中..' : '确认删除'}
                      </Button>
                      <Button
                        onClick={() => {
                          setShowDeleteConfirm(false)
                          setDeletePassword('')
                        }}
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

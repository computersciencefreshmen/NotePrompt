'use client'

import React, { createContext, useCallback, useContext, useState, useEffect } from 'react'
import { User, LoginRequest, RegisterRequest, AuthResponse } from '@/types'
import { api } from '@/lib/api'
import { resolveThemePreference, useTheme } from '@/contexts/ThemeContext'
import { useUISettings } from '@/contexts/UISettingsContext'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (credentials: LoginRequest) => Promise<{ success: boolean; error?: string; data?: AuthResponse['data'] }>
  register: (data: RegisterRequest) => Promise<{ success: boolean; error?: string; data?: AuthResponse['data'] }>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true) // 改为true，表示正在初始化
  const { setTheme } = useTheme()
  const { setVisualStyle } = useUISettings()

  const applyRemotePreferences = useCallback(async (): Promise<void> => {
    try {
      const response = await api.user.getPreferences()
      if (response.success && response.data) {
        const resolvedTheme = resolveThemePreference(response.data.theme)
        setTheme(resolvedTheme)
        setVisualStyle(response.data.visualStyle)
        if (response.data.theme === 'system') {
          void api.user
            .updatePreferences({ theme: resolvedTheme, visualStyle: 'workbench' })
            .catch(error => console.warn('Failed to persist normalized theme preference:', error))
        }
      }
    } catch (error) {
      // 偏好同步是增强能力，失败不能使有效会话退出。
      console.warn('Failed to apply remote user preferences:', error)
    }
  }, [setTheme, setVisualStyle])

  // 初始化用户状态
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // HttpOnly Cookie 无法从客户端读取；始终通过服务端资料接口恢复会话。
        const res = await api.user.getProfile()
        if (res.success && res.data && (res.data as User).id) {
          const userData = res.data as User
          setUser({
            ...userData,
            user_type: userData.user_type || 'free',
            is_active: userData.is_active ?? true,
            created_at: userData.created_at || '',
            updated_at: userData.updated_at || '',
            email: userData.email || '',
            avatar_url: userData.avatar_url || ''
          })
          await applyRemotePreferences()
        } else {
          setUser(null)
        }
      } catch (error) {
        console.warn('Failed to restore browser session:', error)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()
  }, [applyRemotePreferences])

  // 真实登录
  const login = async (credentials: LoginRequest): Promise<{ success: boolean; error?: string; data?: AuthResponse['data'] }> => {
    setLoading(true)
    try {
      const response: AuthResponse = await api.auth.login(credentials)
      if (response.success && response.data?.user) {
        setUser(response.data.user as User)
        await applyRemotePreferences()
        setLoading(false)
        return { success: true }
      } else {
        setUser(null)
        setLoading(false)
        // 传递邮箱验证相关数据
        return { success: false, error: response.error || '登录失败', data: response.data }
      }
    } catch (error: unknown) {
      setUser(null)
      setLoading(false)
      let errMsg = '登录异常'
      if (error instanceof Error) errMsg = error.message
      return { success: false, error: errMsg }
    }
  }

  // 真实注册
  const register = async (data: RegisterRequest): Promise<{ success: boolean; error?: string; data?: AuthResponse['data'] }> => {
    setLoading(true)
    try {
      const response: AuthResponse = await api.auth.register(data)
      if (response.success) {
        // 如果需要邮箱验证，不设置用户状态
        if (response.data?.requireVerification) {
          setLoading(false)
          return { success: true, data: response.data }
        }
        // 不需要验证，正常登录
        if (response.data?.user) {
          setUser(response.data.user as User)
          await applyRemotePreferences()
        }
        setLoading(false)
        return { success: true, data: response.data }
      } else {
        setUser(null)
        setLoading(false)
        return { success: false, error: response.error || '注册失败' }
      }
    } catch (error: unknown) {
      setUser(null)
      setLoading(false)
      let errMsg = '注册异常'
      if (error instanceof Error) errMsg = error.message
      return { success: false, error: errMsg }
    }
  }

  // 真实登出
  const logout = async (): Promise<void> => {
    setUser(null)
    try {
      await api.auth.logout()
    } catch (error) {
      console.warn('Failed to clear browser session cookie:', error)
    }
  }

  // 刷新用户信息
  const refreshUser = async (): Promise<void> => {
    try {
      const res = await api.user.getProfile()
      if (res.success && res.data && (res.data as User).id) {
        const userData = res.data as User
        setUser({
          ...userData,
          user_type: userData.user_type || 'free',
          is_active: userData.is_active ?? true,
          created_at: userData.created_at || '',
          updated_at: userData.updated_at || '',
          email: userData.email || '',
          avatar_url: userData.avatar_url || ''
        })
        await applyRemotePreferences()
      }
    } catch (error) {
      console.error('Failed to refresh user:', error)
      setUser(null)
    }
  }

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    refreshUser
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

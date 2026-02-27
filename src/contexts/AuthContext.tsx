'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { User, LoginRequest, RegisterRequest, AuthResponse } from '@/types'
import { api } from '@/lib/api'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (credentials: LoginRequest) => Promise<{ success: boolean; error?: string }>
  register: (data: RegisterRequest) => Promise<{ success: boolean; error?: string; data?: AuthResponse['data'] }>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// 移除测试用户，使用真实的用户认证

function parseJwt(token: string): { userId: number; username: string; userType: string; email?: string; avatar_url?: string } | null {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    }).join(''))
    return JSON.parse(jsonPayload)
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true) // 改为true，表示正在初始化

  // 初始化用户状态
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const token = api.auth.getToken()
        
        if (!token) {
          setLoading(false)
          return
        }

        // 首先尝试从JWT token解析用户信息
        const payload = parseJwt(token)
        if (payload && payload.userId) {
          // 先设置一个基础用户信息，避免页面重定向
          const tempUser: User = {
            id: payload.userId,
            username: payload.username || 'user',
            user_type: (payload.userType as 'free' | 'pro' | 'admin') || 'free',
            is_active: true,
            created_at: '',
            updated_at: '',
            email: payload.email || '',
            avatar_url: payload.avatar_url || '',
            is_admin: payload.userType === 'admin',
            permissions: []
          }
          setUser(tempUser)
        }

        // 然后尝试从服务器获取完整的用户信息
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
          }
        } catch (error) {
          console.warn('Failed to fetch user profile, using token data:', error)
          // 如果获取用户信息失败，但token有效，保持当前用户状态
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
        // 清除无效的token
        api.auth.logout()
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()
  }, [])

  // 真实登录
  const login = async (credentials: LoginRequest): Promise<{ success: boolean; error?: string }> => {
    setLoading(true)
    try {
      const response: AuthResponse = await api.auth.login(credentials)
      if (response.success && response.data) {
        setUser(response.data.user)
        setLoading(false)
        return { success: true }
      } else {
        setUser(null)
        setLoading(false)
        return { success: false, error: response.error || '登录失败' }
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
          setUser(response.data.user)
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
  const logout = (): void => {
    setUser(null)
    api.auth.logout()
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
      }
    } catch (error) {
      console.error('Failed to refresh user:', error)
      // 如果刷新失败，清除用户状态
      setUser(null)
      api.auth.logout()
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

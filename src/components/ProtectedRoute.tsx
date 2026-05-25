'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2 } from 'lucide-react'
import { Locale, withLocaleHref } from '@/lib/i18n'

interface ProtectedRouteProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  locale?: Locale
}

export default function ProtectedRoute({ children, fallback, locale = 'zh' }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // 只有在认证状态加载完成且用户不存在时才重定向
    if (!loading && !user) {
      router.push(withLocaleHref('/login', locale))
    }
  }, [user, loading, router, locale])

  const loadingText = locale === 'en' ? 'Verifying account...' : '验证用户...'

  // 显示加载状态
  if (loading) {
    return fallback || (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-gray-600 mt-2">{loadingText}</p>
        </div>
      </div>
    )
  }

  // 如果用户不存在，返回null（会重定向到登录页）
  if (!user) {
    return null
  }

  // 用户已登录，显示子组件
  return <>{children}</>
} 
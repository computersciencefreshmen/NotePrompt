'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { useAuth } from '@/contexts/AuthContext'
import { RegisterRequest } from '@/types'
import { toast } from '@/hooks/use-toast'

export default function RegisterPage() {
  const [formData, setFormData] = useState<RegisterRequest>({
    username: '',
    email: '',
    password: ''
  })
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { register } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // 表单验证
    if (!formData.username || !formData.email || !formData.password) {
      setError('请填写所有字段')
      setLoading(false)
      return
    }

    if (formData.password !== confirmPassword) {
      setError('两次输入的密码不一致')
      setLoading(false)
      return
    }

    // 密码强度验证（与后端一致）
    if (formData.password.length < 8) {
      setError('密码长度至少8位')
      setLoading(false)
      return
    }

    const passwordErrors = []
    if (!/[a-z]/.test(formData.password)) passwordErrors.push('小写字母')
    if (!/[A-Z]/.test(formData.password)) passwordErrors.push('大写字母')
    if (!/\d/.test(formData.password)) passwordErrors.push('数字')

    if (passwordErrors.length > 0) {
      setError(`密码必须包含：${passwordErrors.join('、')}`)
      setLoading(false)
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError('请输入有效的邮箱地址')
      setLoading(false)
      return
    }

    try {
      const result = await register(formData)

      if (result.success) {
        // 检查是否需要邮箱验证
        if (result.data?.requireVerification) {
          // 跳转到邮箱验证页面
          router.push(`/verify-email?email=${encodeURIComponent(formData.email)}`);
        } else {
          // 不需要验证，直接跳转首页
          router.push('/');
        }
      } else {
        setError(result.error || '注册失败')
      }
    } catch (err) {
      setError('注册失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    if (name === 'confirmPassword') {
      setConfirmPassword(value)
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-gray-900">
              注册 Note Prompt
            </CardTitle>
            <p className="text-gray-600 mt-2">
              创建您的账户，开始使用AI提示词优化
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="border-red-200 bg-red-50 rounded-lg p-4">
                  <p className="text-red-800">{error}</p>
                </div>
              )}

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  用户名 *
                </label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="请输入用户名"
                  disabled={loading}
                  required
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  邮箱 *
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="请输入邮箱地址"
                  disabled={loading}
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  密码 *
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="请输入密码"
                  disabled={loading}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  至少8位，包含大小写字母和数字
                </p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  确认密码 *
                </label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={handleChange}
                  placeholder="请再次输入密码"
                  disabled={loading}
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={loading}
              >
                {loading ? '注册中...' : '注册'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                已有账户？{' '}
                <Link
                  href="/login"
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  立即登录
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

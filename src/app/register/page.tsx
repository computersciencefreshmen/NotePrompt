'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { useAuth } from '@/contexts/AuthContext'
import { RegisterRequest } from '@/types'
import { toast } from '@/hooks/use-toast'
import { detectLocaleFromSearch, Locale, withLocaleHref } from '@/lib/i18n'

const registerCopy = {
  zh: {
    required: '请填写所有字段',
    mismatch: '两次输入的密码不一致',
    minLength: '密码长度至少8位',
    lowercase: '小写字母',
    uppercase: '大写字母',
    number: '数字',
    passwordMustContain: '密码必须包含：',
    invalidEmail: '请输入有效的邮箱地址',
    failed: '注册失败',
    retry: '注册失败，请稍后重试',
    title: '注册 Note Prompt',
    subtitle: '创建您的账户，开始使用AI提示词优化',
    username: '用户名 *',
    usernamePlaceholder: '请输入用户名',
    email: '邮箱 *',
    emailPlaceholder: '请输入邮箱地址',
    password: '密码 *',
    passwordPlaceholder: '请输入密码',
    passwordHint: '至少8位，包含大小写字母和数字',
    confirmPassword: '确认密码 *',
    confirmPasswordPlaceholder: '请再次输入密码',
    submitting: '注册中...',
    submit: '注册',
    hasAccount: '已有账户？',
    login: '立即登录',
  },
  en: {
    required: 'Please fill in all fields.',
    mismatch: 'The two passwords do not match.',
    minLength: 'Password must be at least 8 characters.',
    lowercase: 'a lowercase letter',
    uppercase: 'an uppercase letter',
    number: 'a number',
    passwordMustContain: 'Password must include: ',
    invalidEmail: 'Enter a valid email address.',
    failed: 'Registration failed',
    retry: 'Registration failed. Please try again later.',
    title: 'Create your Note Prompt account',
    subtitle: 'Start building, optimizing, and reusing better AI prompts.',
    username: 'Username *',
    usernamePlaceholder: 'Enter a username',
    email: 'Email *',
    emailPlaceholder: 'Enter your email address',
    password: 'Password *',
    passwordPlaceholder: 'Enter a password',
    passwordHint: 'At least 8 characters, with uppercase, lowercase, and a number.',
    confirmPassword: 'Confirm password *',
    confirmPasswordPlaceholder: 'Enter the password again',
    submitting: 'Creating account...',
    submit: 'Sign up',
    hasAccount: 'Already have an account?',
    login: 'Log in',
  },
}

export default function RegisterPage() {
  const [locale, setLocale] = useState<Locale>('zh')
  const copy = registerCopy[locale]
  const href = (path: string) => withLocaleHref(path, locale)
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

  useEffect(() => {
    setLocale(detectLocaleFromSearch())
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // 表单验证
    if (!formData.username || !formData.email || !formData.password) {
      setError(copy.required)
      setLoading(false)
      return
    }

    if (formData.password !== confirmPassword) {
      setError(copy.mismatch)
      setLoading(false)
      return
    }

    // 密码强度验证（与后端一致）
    if (formData.password.length < 8) {
      setError(copy.minLength)
      setLoading(false)
      return
    }

    const passwordErrors = []
    if (!/[a-z]/.test(formData.password)) passwordErrors.push(copy.lowercase)
    if (!/[A-Z]/.test(formData.password)) passwordErrors.push(copy.uppercase)
    if (!/\d/.test(formData.password)) passwordErrors.push(copy.number)

    if (passwordErrors.length > 0) {
      setError(`${copy.passwordMustContain}${passwordErrors.join(locale === 'en' ? ', ' : '、')}`)
      setLoading(false)
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError(copy.invalidEmail)
      setLoading(false)
      return
    }

    try {
      const result = await register(formData)

      if (result.success) {
        // 检查是否需要邮箱验证
        if (result.data?.requireVerification) {
          // 跳转到邮箱验证页面
          router.push(href(`/verify-email?email=${encodeURIComponent(formData.email)}`));
        } else {
          // 不需要验证，直接跳转首页
          router.push(href('/'));
        }
      } else {
        setError(result.error || copy.failed)
      }
    } catch (err) {
      setError(copy.retry)
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
              {copy.title}
            </CardTitle>
            <p className="text-gray-600 mt-2">
              {copy.subtitle}
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
                  {copy.username}
                </label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder={copy.usernamePlaceholder}
                  disabled={loading}
                  required
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  {copy.email}
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder={copy.emailPlaceholder}
                  disabled={loading}
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  {copy.password}
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder={copy.passwordPlaceholder}
                  disabled={loading}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  {copy.passwordHint}
                </p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  {copy.confirmPassword}
                </label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={handleChange}
                  placeholder={copy.confirmPasswordPlaceholder}
                  disabled={loading}
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={loading}
              >
                {loading ? copy.submitting : copy.submit}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                {copy.hasAccount}{' '}
                <Link
                  href={href('/login')}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  {copy.login}
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

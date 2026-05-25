'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, User, CheckCircle } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { LoginRequest } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Locale, withLocaleHref } from '@/lib/i18n';

const loginCopy = {
  zh: {
    verifiedTitle: '邮箱验证成功',
    verifiedDesc: '请使用您的账户信息登录',
    inputError: '输入错误',
    fillAll: '请填写所有字段',
    unverifiedTitle: '邮箱未验证',
    unverifiedDesc: '请先完成邮箱验证后再登录',
    failed: '登录失败',
    wrongCredentials: '用户名或密码错误',
    retry: '登录失败，请稍后重试',
    title: '登录 Note Prompt',
    subtitle: '欢迎回来，请输入您的账户信息',
    verifiedInline: '邮箱验证成功！请使用您的账户信息登录。',
    userLogin: '用户登录',
    adminLogin: '管理员登录',
    username: '用户名',
    usernamePlaceholder: '请输入用户名',
    password: '密码',
    passwordPlaceholder: '请输入密码',
    submitting: '登录中...',
    submit: '登录',
    forgot: '忘记密码？',
    noAccount: '还没有账户？',
    register: '立即注册',
    loading: '加载中...',
  },
  en: {
    verifiedTitle: 'Email verified',
    verifiedDesc: 'Sign in with your account details.',
    inputError: 'Missing fields',
    fillAll: 'Please fill in all fields.',
    unverifiedTitle: 'Email not verified',
    unverifiedDesc: 'Please verify your email before signing in.',
    failed: 'Sign-in failed',
    wrongCredentials: 'Incorrect username or password.',
    retry: 'Sign-in failed. Please try again later.',
    title: 'Log in to Note Prompt',
    subtitle: 'Welcome back. Enter your account details to continue.',
    verifiedInline: 'Email verified. You can now sign in.',
    userLogin: 'User Login',
    adminLogin: 'Admin Login',
    username: 'Username',
    usernamePlaceholder: 'Enter your username',
    password: 'Password',
    passwordPlaceholder: 'Enter your password',
    submitting: 'Signing in...',
    submit: 'Log in',
    forgot: 'Forgot password?',
    noAccount: 'No account yet?',
    register: 'Create one',
    loading: 'Loading...',
  },
}

function LoginContent() {
  const [formData, setFormData] = useState<LoginRequest>({
    username: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('user');
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const verified = searchParams.get('verified');
  const locale: Locale = searchParams.get('lang') === 'en' ? 'en' : 'zh';
  const copy = loginCopy[locale];
  const href = (path: string) => withLocaleHref(path, locale);

  const { login } = useAuth();
  const router = useRouter();

  // 显示邮箱验证成功提示
  useEffect(() => {
    if (verified === 'true') {
      toast({
        title: copy.verifiedTitle,
        description: copy.verifiedDesc,
      });
    }
  }, [verified, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.username || !formData.password) {
      toast({
        title: copy.inputError,
        description: copy.fillAll,
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    try {
      const result = await login(formData);

      if (result.success) {
        // 如果是管理员登录，跳转到管理员页面
        if (activeTab === 'admin') {
          router.push(href('/admin'));
        } else {
          router.push(href('/public-prompts'));
        }
      } else {
        // 如果邮箱未验证，跳转到验证页面
        if (result.data?.requireVerification && result.data?.user?.email) {
          toast({
            title: copy.unverifiedTitle,
            description: copy.unverifiedDesc,
          });
          router.push(href(`/verify-email?email=${encodeURIComponent(result.data.user.email as string)}`));
          return;
        }
        toast({
          title: copy.failed,
          description: result.error || copy.wrongCredentials,
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: copy.failed,
        description: copy.retry,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
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
            {/* 邮箱验证成功提示 */}
            {verified === 'true' && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <p className="text-green-700 text-sm">{copy.verifiedInline}</p>
              </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="user" className="flex items-center space-x-2">
                  <User className="h-4 w-4" />
                  <span>{copy.userLogin}</span>
                </TabsTrigger>
                <TabsTrigger value="admin" className="flex items-center space-x-2">
                  <Shield className="h-4 w-4" />
                  <span>{copy.adminLogin}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <form onSubmit={handleSubmit} className="space-y-4">
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
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={loading}
              >
                {loading ? copy.submitting : copy.submit}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <Link
                href={href('/forgot-password')}
                className="text-sm text-gray-500 hover:text-blue-600"
              >
                {copy.forgot}
              </Link>
            </div>

            <div className="mt-4 text-center">
              <p className="text-sm text-gray-600">
                {copy.noAccount}{' '}
                <Link
                  href={href('/register')}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  {copy.register}
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, User } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { LoginRequest } from '@/types';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [formData, setFormData] = useState<LoginRequest>({
    username: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('user');
  const { toast } = useToast();

  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.username || !formData.password) {
      toast({
        title: '输入错误',
        description: '请填写所有字段',
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
          router.push('/admin');
        } else {
          router.push('/');
        }
      } else {
        toast({
          title: '登录失败',
          description: result.error || '用户名或密码错误',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: '登录失败',
        description: '登录失败，请稍后重试',
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
              登录 Note Prompt
            </CardTitle>
            <p className="text-gray-600 mt-2">
              欢迎回来，请输入您的账户信息
            </p>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="user" className="flex items-center space-x-2">
                  <User className="h-4 w-4" />
                  <span>用户登录</span>
                </TabsTrigger>
                <TabsTrigger value="admin" className="flex items-center space-x-2">
                  <Shield className="h-4 w-4" />
                  <span>管理员登录</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  用户名
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
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  密码
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
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={loading}
              >
                {loading ? '登录中...' : '登录'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                还没有账户？{' '}
                <Link
                  href="/register"
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  立即注册
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

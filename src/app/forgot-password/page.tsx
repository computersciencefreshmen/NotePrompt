'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, KeyRound, ArrowLeft, CheckCircle, Clock, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Step = 'email' | 'code' | 'success';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');

  // 发送验证码
  const sendResetCode = async () => {
    if (countdown > 0 || sending) return;

    if (!email) {
      setMessageType('error');
      setMessage('请输入邮箱地址');
      return;
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      setMessageType('error');
      setMessage('邮箱格式不正确');
      return;
    }

    setSending(true);
    setMessage('');

    try {
      const response = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.success) {
        setMessageType('success');
        setMessage('验证码已发送，请查收邮箱');
        setStep('code');
        startCountdown();
      } else {
        setMessageType('error');
        setMessage(data.error || '发送失败，请稍后重试');
        if (data.remainingSeconds) {
          startCountdown(data.remainingSeconds);
        }
      }
    } catch {
      setMessageType('error');
      setMessage('网络错误，请检查连接');
    } finally {
      setSending(false);
    }
  };

  // 重置密码
  const resetPassword = async () => {
    if (loading) return;

    if (!code || code.length !== 6) {
      setMessageType('error');
      setMessage('请输入6位验证码');
      return;
    }

    if (!newPassword) {
      setMessageType('error');
      setMessage('请输入新密码');
      return;
    }

    if (newPassword.length < 6) {
      setMessageType('error');
      setMessage('密码长度不能少于6位');
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessageType('error');
      setMessage('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword }),
      });

      const data = await response.json();

      if (data.success) {
        setStep('success');
        toast({
          title: '密码重置成功',
          description: '请使用新密码登录',
        });
        // 3秒后跳转到登录页
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      } else {
        setMessageType('error');
        setMessage(data.error || '密码重置失败，请重试');
      }
    } catch {
      setMessageType('error');
      setMessage('网络错误，请检查连接');
    } finally {
      setLoading(false);
    }
  };

  // 倒计时
  const startCountdown = (seconds = 60) => {
    setCountdown(seconds);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // 处理验证码输入
  const handleCodeChange = (value: string) => {
    const numericValue = value.replace(/\D/g, '').slice(0, 6);
    setCode(numericValue);
  };

  // 成功状态
  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 py-12 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-green-600 dark:text-green-400 mb-2">密码重置成功！</h3>
              <p className="text-gray-600 dark:text-gray-400 text-center">正在跳转到登录页面...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-center mb-2">
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
              {step === 'email' ? (
                <Mail className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              ) : (
                <KeyRound className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              )}
            </div>
          </div>
          <CardTitle className="text-center">
            {step === 'email' ? '找回密码' : '重置密码'}
          </CardTitle>
          <CardDescription className="text-center">
            {step === 'email'
              ? '请输入您注册时使用的邮箱地址，我们将发送验证码'
              : (
                <>
                  验证码已发送到 <strong>{email}</strong>
                </>
              )
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {step === 'email' ? (
              <>
                {/* 邮箱输入 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    邮箱地址
                  </label>
                  <Input
                    type="email"
                    placeholder="请输入注册邮箱"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={sending}
                    onKeyDown={(e) => e.key === 'Enter' && sendResetCode()}
                  />
                </div>

                {/* 消息提示 */}
                {message && (
                  <div className={`p-3 rounded-lg text-sm ${
                    messageType === 'success'
                      ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                      : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                  }`}>
                    {message}
                  </div>
                )}

                {/* 发送按钮 */}
                <Button
                  onClick={sendResetCode}
                  disabled={sending || !email}
                  className="w-full"
                >
                  {sending ? '发送中...' : '发送验证码'}
                </Button>
              </>
            ) : (
              <>
                {/* 验证码输入 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    验证码
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="请输入6位验证码"
                    value={code}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    maxLength={6}
                    className="text-center text-2xl tracking-widest h-14"
                    disabled={loading}
                  />
                </div>

                {/* 新密码输入 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    新密码
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="请输入新密码（至少6位）"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* 确认密码 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    确认新密码
                  </label>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="请再次输入新密码"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={loading}
                      onKeyDown={(e) => e.key === 'Enter' && resetPassword()}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* 重新发送验证码 */}
                <div className="flex items-center justify-between text-sm">
                  <button
                    onClick={() => { setStep('email'); setMessage(''); setCode(''); }}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    更换邮箱
                  </button>
                  {countdown === 0 ? (
                    <button
                      onClick={sendResetCode}
                      disabled={sending}
                      className="text-orange-600 hover:text-orange-700 dark:text-orange-400 disabled:text-gray-400 font-medium"
                    >
                      {sending ? '发送中...' : '重新发送验证码'}
                    </button>
                  ) : (
                    <span className="text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {countdown}s 后可重新发送
                    </span>
                  )}
                </div>

                {/* 消息提示 */}
                {message && (
                  <div className={`p-3 rounded-lg text-sm ${
                    messageType === 'success'
                      ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                      : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                  }`}>
                    {message}
                  </div>
                )}

                {/* 重置按钮 */}
                <Button
                  onClick={resetPassword}
                  disabled={loading || code.length !== 6 || !newPassword || !confirmPassword}
                  className="w-full"
                >
                  {loading ? '重置中...' : '重置密码'}
                </Button>
              </>
            )}

            {/* 返回登录 */}
            <div className="text-center pt-2">
              <Link
                href="/login"
                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                返回登录
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

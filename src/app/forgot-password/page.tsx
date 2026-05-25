'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, KeyRound, ArrowLeft, CheckCircle, Clock, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { detectLocaleFromSearch, Locale, withLocaleHref } from '@/lib/i18n';

type Step = 'email' | 'code' | 'success';

const forgotPasswordCopy = {
  zh: {
    emailRequired: '请输入邮箱地址',
    emailInvalid: '邮箱格式不正确',
    codeSent: '验证码已发送，请查收邮箱',
    sendFailed: '发送失败，请稍后重试',
    network: '网络错误，请检查连接',
    codeRequired: '请输入6位验证码',
    newPasswordRequired: '请输入新密码',
    passwordMin: '密码长度不能少于6位',
    mismatch: '两次输入的密码不一致',
    resetSuccessTitle: '密码重置成功',
    resetSuccessDesc: '请使用新密码登录',
    resetFailed: '密码重置失败，请重试',
    successTitle: '密码重置成功！',
    redirecting: '正在跳转到登录页面...',
    titleEmail: '找回密码',
    titleCode: '重置密码',
    descEmail: '请输入您注册时使用的邮箱地址，我们将发送验证码',
    descCode: (email: string) => <>验证码已发送到 <strong>{email}</strong></>,
    email: '邮箱地址',
    emailPlaceholder: '请输入注册邮箱',
    sending: '发送中...',
    sendCode: '发送验证码',
    code: '验证码',
    codePlaceholder: '请输入6位验证码',
    newPassword: '新密码',
    newPasswordPlaceholder: '请输入新密码（至少6位）',
    confirmPassword: '确认新密码',
    confirmPasswordPlaceholder: '请再次输入新密码',
    changeEmail: '更换邮箱',
    resend: '重新发送验证码',
    resendIn: (countdown: number) => `${countdown}s 后可重新发送`,
    resetting: '重置中...',
    reset: '重置密码',
    backToLogin: '返回登录',
  },
  en: {
    emailRequired: 'Enter your email address.',
    emailInvalid: 'Enter a valid email address.',
    codeSent: 'Verification code sent. Please check your email.',
    sendFailed: 'Could not send the code. Please try again later.',
    network: 'Network error. Please check your connection.',
    codeRequired: 'Enter the 6-digit verification code.',
    newPasswordRequired: 'Enter a new password.',
    passwordMin: 'Password must be at least 6 characters.',
    mismatch: 'The two passwords do not match.',
    resetSuccessTitle: 'Password reset',
    resetSuccessDesc: 'Sign in with your new password.',
    resetFailed: 'Password reset failed. Please try again.',
    successTitle: 'Password reset successful',
    redirecting: 'Redirecting to the login page...',
    titleEmail: 'Recover password',
    titleCode: 'Reset password',
    descEmail: 'Enter your account email and we will send a verification code.',
    descCode: (email: string) => <>A verification code was sent to <strong>{email}</strong>.</>,
    email: 'Email address',
    emailPlaceholder: 'Enter your account email',
    sending: 'Sending...',
    sendCode: 'Send code',
    code: 'Verification code',
    codePlaceholder: 'Enter the 6-digit code',
    newPassword: 'New password',
    newPasswordPlaceholder: 'Enter a new password (min. 6 characters)',
    confirmPassword: 'Confirm new password',
    confirmPasswordPlaceholder: 'Enter the new password again',
    changeEmail: 'Change email',
    resend: 'Resend code',
    resendIn: (countdown: number) => `Resend available in ${countdown}s`,
    resetting: 'Resetting...',
    reset: 'Reset password',
    backToLogin: 'Back to login',
  },
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [locale, setLocale] = useState<Locale>('zh');
  const copy = forgotPasswordCopy[locale];
  const href = (path: string) => withLocaleHref(path, locale);

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

  useEffect(() => {
    setLocale(detectLocaleFromSearch());
  }, []);

  // 发送验证码
  const sendResetCode = async () => {
    if (countdown > 0 || sending) return;

    if (!email) {
      setMessageType('error');
      setMessage(copy.emailRequired);
      return;
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      setMessageType('error');
      setMessage(copy.emailInvalid);
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
        setMessage(copy.codeSent);
        setStep('code');
        startCountdown();
      } else {
        setMessageType('error');
        setMessage(data.error || copy.sendFailed);
        if (data.remainingSeconds) {
          startCountdown(data.remainingSeconds);
        }
      }
    } catch {
      setMessageType('error');
      setMessage(copy.network);
    } finally {
      setSending(false);
    }
  };

  // 重置密码
  const resetPassword = async () => {
    if (loading) return;

    if (!code || code.length !== 6) {
      setMessageType('error');
      setMessage(copy.codeRequired);
      return;
    }

    if (!newPassword) {
      setMessageType('error');
      setMessage(copy.newPasswordRequired);
      return;
    }

    if (newPassword.length < 6) {
      setMessageType('error');
      setMessage(copy.passwordMin);
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessageType('error');
      setMessage(copy.mismatch);
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
          title: copy.resetSuccessTitle,
          description: copy.resetSuccessDesc,
        });
        // 3秒后跳转到登录页
        setTimeout(() => {
          router.push(href('/login'));
        }, 3000);
      } else {
        setMessageType('error');
        setMessage(data.error || copy.resetFailed);
      }
    } catch {
      setMessageType('error');
      setMessage(copy.network);
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
              <h3 className="text-xl font-semibold text-green-600 dark:text-green-400 mb-2">{copy.successTitle}</h3>
              <p className="text-gray-600 dark:text-gray-400 text-center">{copy.redirecting}</p>
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
            {step === 'email' ? copy.titleEmail : copy.titleCode}
          </CardTitle>
          <CardDescription className="text-center">
            {step === 'email'
              ? copy.descEmail
              : copy.descCode(email)
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
                    {copy.email}
                  </label>
                  <Input
                    type="email"
                    placeholder={copy.emailPlaceholder}
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
                  {sending ? copy.sending : copy.sendCode}
                </Button>
              </>
            ) : (
              <>
                {/* 验证码输入 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {copy.code}
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder={copy.codePlaceholder}
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
                    {copy.newPassword}
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder={copy.newPasswordPlaceholder}
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
                    {copy.confirmPassword}
                  </label>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder={copy.confirmPasswordPlaceholder}
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
                    {copy.changeEmail}
                  </button>
                  {countdown === 0 ? (
                    <button
                      onClick={sendResetCode}
                      disabled={sending}
                      className="text-orange-600 hover:text-orange-700 dark:text-orange-400 disabled:text-gray-400 font-medium"
                    >
                      {sending ? copy.sending : copy.resend}
                    </button>
                  ) : (
                    <span className="text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {copy.resendIn(countdown)}
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
                  {loading ? copy.resetting : copy.reset}
                </Button>
              </>
            )}

            {/* 返回登录 */}
            <div className="text-center pt-2">
              <Link
                href={href('/login')}
                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                {copy.backToLogin}
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

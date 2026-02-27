'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, CheckCircle, Clock } from 'lucide-react';

interface EmailVerificationProps {
  email: string;
  onVerified: () => void;
  onBack?: () => void;
}

/**
 * 邮箱验证组件
 * 用于注册后验证用户邮箱
 */
export function EmailVerification({ email, onVerified, onBack }: EmailVerificationProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');
  const [countdown, setCountdown] = useState(0);
  const [isVerified, setIsVerified] = useState(false);

  // 发送验证码
  const sendVerificationCode = async () => {
    if (countdown > 0) return;

    setSending(true);
    setMessage('');

    try {
      const response = await fetch('/api/v1/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.success) {
        setMessageType('success');
        setMessage('验证码已发送到您的邮箱');
        // 开始倒计时
        setCountdown(60);
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setMessageType('error');
        setMessage(data.error || '发送失败，请稍后重试');
        // 如果返回了剩余秒数，设置倒计时
        if (data.remainingSeconds) {
          setCountdown(data.remainingSeconds);
          const timer = setInterval(() => {
            setCountdown((prev) => {
              if (prev <= 1) {
                clearInterval(timer);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        }
      }
    } catch (err) {
      setMessageType('error');
      setMessage('网络错误，请检查连接');
    } finally {
      setSending(false);
    }
  };

  // 验证邮箱
  const verifyEmail = async () => {
    if (!code || code.length !== 6) {
      setMessageType('error');
      setMessage('请输入6位验证码');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/v1/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });

      const data = await response.json();

      if (data.success) {
        setMessageType('success');
        setMessage('邮箱验证成功！');
        setIsVerified(true);
        //2秒后自动跳转
        setTimeout(() => {
          onVerified();
        }, 2000);
      } else {
        setMessageType('error');
        setMessage(data.error || '验证失败，请检查验证码');
      }
    } catch (err) {
      setMessageType('error');
      setMessage('网络错误，请检查连接');
    } finally {
      setLoading(false);
    }
  };

  // 自动发送验证码（组件加载时）
  useState(() => {
    sendVerificationCode();
  });

  // 处理验证码输入（只允许数字）
  const handleCodeChange = (value: string) => {
    const numericValue = value.replace(/\D/g, '').slice(0, 6);
    setCode(numericValue);
  };

  if (isVerified) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-green-600 mb-2">验证成功！</h3>
            <p className="text-gray-600 text-center">正在跳转到登录页面...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center justify-center mb-2">
          <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
            <Mail className="w-6 h-6 text-purple-600" />
          </div>
        </div>
        <CardTitle>验证您的邮箱</CardTitle>
        <CardDescription>
          我们已向 <strong>{email}</strong> 发送了6位验证码
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* 验证码输入 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">验证码</label>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="请输入6位验证码"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              maxLength={6}
              className="text-center text-2xl tracking-widest h-14"
              disabled={loading || isVerified}
            />
          </div>

          {/* 消息提示 */}
          {message && (
            <div className={`p-3 rounded-lg ${
              messageType === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {message}
            </div>
          )}

          {/* 倒计时提示 */}
          {countdown > 0 && !message && (
            <div className="p-3 bg-gray-50 rounded-lg text-gray-600 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>{countdown} 秒后可以重新发送验证码</span>
            </div>
          )}

          {/* 重新发送按钮 */}
          <div className="text-center">
            {countdown === 0 ? (
              <button
                onClick={sendVerificationCode}
                disabled={sending}
                className="text-sm text-purple-600 hover:text-purple-700 disabled:text-gray-400 disabled:cursor-not-allowed font-medium"
              >
                {sending ? '发送中...' : '重新发送验证码'}
              </button>
            ) : (
              <span className="text-sm text-gray-500">等待 {countdown} 秒后可重新发送</span>
            )}
          </div>

          {/* 验证按钮 */}
          <Button
            onClick={verifyEmail}
            disabled={loading || code.length !== 6 || isVerified}
            className="w-full"
          >
            {loading ? '验证中...' : '验证邮箱'}
          </Button>

          {/* 返回按钮 */}
          {onBack && (
            <Button
              variant="ghost"
              onClick={onBack}
              className="w-full"
              disabled={loading || isVerified}
            >
              返回上一步
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

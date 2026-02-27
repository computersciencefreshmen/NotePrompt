'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EmailVerification } from '@/components/auth/EmailVerification';

/**
 * 邮箱验证页面
 * 用于用户验证注册邮箱
 */
export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');

  useEffect(() => {
    // 从URL参数获取邮箱
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    } else {
      // 如果没有邮箱参数，重定向到注册页面
      router.push('/register');
    }
  }, [searchParams, router]);

  const handleVerified = () => {
    // 验证成功，跳转到登录页面
    router.push('/login?verified=true');
  };

  const handleBack = () => {
    // 返回注册页面
    router.push('/register');
  };

  if (!email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <EmailVerification
        email={email}
        onVerified={handleVerified}
        onBack={handleBack}
      />
    </div>
  );
}

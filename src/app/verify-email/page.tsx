'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EmailVerification } from '@/components/auth/EmailVerification';
import { Locale, withLocaleHref } from '@/lib/i18n';

/**
 * 邮箱验证页面
 * 用于用户验证注册邮箱
 */
function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const locale: Locale = searchParams.get('lang') === 'en' ? 'en' : 'zh';
  const href = (path: string) => withLocaleHref(path, locale);

  useEffect(() => {
    // 从URL参数获取邮箱
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    } else {
      // 如果没有邮箱参数，重定向到注册页面
      router.push(href('/register'));
    }
  }, [searchParams, router]);

  const handleVerified = () => {
    // 验证成功，跳转到登录页面
    router.push(href('/login?verified=true'));
  };

  const handleBack = () => {
    // 返回注册页面
    router.push(href('/register'));
  };

  if (!email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">{locale === 'en' ? 'Loading...' : '加载中...'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <EmailVerification
        email={email}
        onVerified={handleVerified}
        onBack={handleBack}
        locale={locale}
      />
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}

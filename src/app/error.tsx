'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Page error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-4 text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">页面出现了问题</h2>
          <p className="text-sm text-muted-foreground">
            {error.message || '发生了意外错误，请稍后重试'}
          </p>
        </div>

        <div className="flex gap-3 justify-center">
          <Button onClick={reset} variant="default" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            重试
          </Button>
          <Button
            onClick={() => window.location.href = '/prompts'}
            variant="outline"
            className="gap-2"
          >
            <Home className="w-4 h-4" />
            返回首页
          </Button>
        </div>
      </div>
    </div>
  )
}

import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-4 text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <FileQuestion className="w-8 h-8 text-muted-foreground" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-4xl font-bold text-foreground">404</h2>
          <p className="text-muted-foreground">页面不存在或已被移除</p>
        </div>

        <Button asChild>
          <Link href="/prompts">返回首页</Link>
        </Button>
      </div>
    </div>
  )
}

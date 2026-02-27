import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import ClientBody from './ClientBody'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Note Prompt - AI提示词优化平台',
  description: '专业的AI提示词优化和管理平台，支持提示词创建、优化、收藏和分享功能',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <AuthProvider>
            <ClientBody>{children}</ClientBody>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

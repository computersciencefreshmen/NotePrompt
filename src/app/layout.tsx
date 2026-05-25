import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { UISettingsProvider } from '@/contexts/UISettingsContext'
import ClientBody from './ClientBody'

export const metadata: Metadata = {
  title: 'Note Prompt - AI Prompt Optimization Platform',
  description: 'A professional platform for creating, optimizing, managing, saving, and sharing AI prompts.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans">
        <ThemeProvider>
          <UISettingsProvider>
            <AuthProvider>
              <ClientBody>{children}</ClientBody>
            </AuthProvider>
          </UISettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

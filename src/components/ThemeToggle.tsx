'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import { detectLocaleFromSearch, Locale } from '@/lib/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [locale, setLocale] = useState<Locale>('zh')
  const copy = locale === 'en'
    ? { toggle: 'Toggle theme', light: 'Light', dark: 'Dark', system: 'System' }
    : { toggle: '切换主题', light: '浅色', dark: '深色', system: '跟随系统' }

  useEffect(() => {
    setLocale(detectLocaleFromSearch())
  }, [])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          {resolvedTheme === 'dark' ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
          <span className="sr-only">{copy.toggle}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')} className="cursor-pointer">
          <Sun className="mr-2 h-4 w-4" />
          <span>{copy.light}</span>
          {theme === 'light' && <span className="ml-auto text-teal-600">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')} className="cursor-pointer">
          <Moon className="mr-2 h-4 w-4" />
          <span>{copy.dark}</span>
          {theme === 'dark' && <span className="ml-auto text-teal-600">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')} className="cursor-pointer">
          <Monitor className="mr-2 h-4 w-4" />
          <span>{copy.system}</span>
          {theme === 'system' && <span className="ml-auto text-teal-600">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

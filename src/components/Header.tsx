'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { User, Settings, LogOut, Star, FileText, Shield, Palette, Wand2, Menu, X } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import GlobalSearch from '@/components/GlobalSearch'
import { visualStyleOptions, VisualStyle } from '@/config/visual-styles'
import { featureFlags } from '@/config/features'
import { useUISettings } from '@/contexts/UISettingsContext'
import { detectLocaleFromSearch, Locale, updateLocaleInAddressBar, withLocaleHref } from '@/lib/i18n'

const styleAccentClass: Record<VisualStyle, string> = {
  workbench: 'text-gray-950 dark:text-gray-50 hover:text-gray-700 dark:hover:text-gray-200',
  editorial: 'text-black dark:text-white hover:text-gray-700 dark:hover:text-gray-200',
  dashboard: 'text-cyan-700 dark:text-cyan-300 hover:text-cyan-800 dark:hover:text-cyan-200',
  lightweight: 'text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200',
}

const headerCopy = {
  zh: {
    publicPrompts: '公共提示词',
    publicFolders: '公共文件夹',
    myPrompts: '我的提示词',
    optimizer: '优化工作台',
    favorites: '收藏夹',
    published: '我发布的内容',
    profile: '个人资料',
    settings: '设置',
    visualStyle: '界面风格',
    admin: '管理后台',
    logout: '退出登录',
    login: '登录',
    register: '注册',
    primaryNavigation: '主导航',
    openNavigation: '打开导航菜单',
    closeNavigation: '关闭导航菜单',
    accountMenu: '账户菜单',
    language: '语言',
    chinese: '切换为中文',
    english: 'Switch to English',
    roles: { admin: '管理员', pro: '专业版', free: '免费版' },
  },
  en: {
    publicPrompts: 'Prompt Library',
    publicFolders: 'Public Folders',
    myPrompts: 'My Prompts',
    optimizer: 'Optimizer',
    favorites: 'Favorites',
    published: 'Published',
    profile: 'Profile',
    settings: 'Settings',
    visualStyle: 'Interface Style',
    admin: 'Admin Console',
    logout: 'Sign out',
    login: 'Log in',
    register: 'Sign up',
    primaryNavigation: 'Primary navigation',
    openNavigation: 'Open navigation menu',
    closeNavigation: 'Close navigation menu',
    accountMenu: 'Account menu',
    language: 'Language',
    chinese: '切换为中文',
    english: 'Switch to English',
    roles: { admin: 'Admin', pro: 'Pro', free: 'Free' },
  },
}

export default function Header() {
  const { user, logout, loading } = useAuth()
  const { visualStyle, setVisualStyle } = useUISettings()
  const router = useRouter()
  const pathname = usePathname()
  const [locale, setLocale] = useState<Locale>('zh')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const copy = headerCopy[locale]

  useEffect(() => {
    setLocale(detectLocaleFromSearch())
  }, [])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileMenuOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false)
        mobileMenuButtonRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [mobileMenuOpen])

  useEffect(() => {
    if (!mobileMenuOpen) return

    const frame = window.requestAnimationFrame(() => {
      const currentLink = mobileMenuRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
      const firstControl = mobileMenuRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')
      const focusTarget = currentLink ?? firstControl
      focusTarget?.focus()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [mobileMenuOpen])

  const href = (path: string) => withLocaleHref(path, locale)

  const handleLocaleChange = (nextLocale: Locale) => {
    setLocale(nextLocale)
    updateLocaleInAddressBar(nextLocale)
  }

  const handleLogout = async () => {
    await logout()
    router.push(href('/'))
  }

  const getUserDisplayName = () => {
    if (!user) return ''
    return user.username
  }

  const getUserInitials = () => {
    if (!user) return ''
    return user.username.charAt(0).toUpperCase()
  }

  const navLinkClass = `text-gray-700 dark:text-gray-300 transition-colors ${styleAccentClass[visualStyle]}`
  const navigationItems = [
    { path: '/public-prompts', label: copy.publicPrompts },
    { path: '/public-folders', label: copy.publicFolders },
    ...(featureFlags.promptOptimizerV2 ? [{ path: '/optimizer', label: copy.optimizer }] : []),
    ...(user ? [
      { path: '/prompts', label: copy.myPrompts },
      { path: '/favorites', label: copy.favorites },
    ] : []),
  ]
  const isCurrentPath = (path: string) => pathname === path || pathname.startsWith(`${path}/`)

  return (
    <header className="relative z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Navigation */}
          <div className="flex items-center space-x-8">
            <Link href={href('/')} className="flex items-center">
              <span className="note-prompt-brand text-xl font-bold text-teal-600 dark:text-teal-400">Note Prompt</span>
            </Link>

            <nav aria-label={copy.primaryNavigation} className="hidden md:flex space-x-6">
              {navigationItems.map(item => (
                <Link
                  key={item.path}
                  href={href(item.path)}
                  aria-current={isCurrentPath(item.path) ? 'page' : undefined}
                  className={`${navLinkClass} ${isCurrentPath(item.path) ? 'font-semibold' : ''}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* User Actions */}
          <div className="flex items-center space-x-2">
            <button
              ref={mobileMenuButtonRef}
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 md:hidden"
              aria-label={mobileMenuOpen ? copy.closeNavigation : copy.openNavigation}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-primary-navigation"
              onClick={() => setMobileMenuOpen(open => !open)}
            >
              {mobileMenuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
            </button>
            <GlobalSearch locale={locale} />
            <ThemeToggle />
            <div
              className="hidden items-center rounded-full border border-gray-200 bg-gray-50 p-0.5 text-xs dark:border-gray-700 dark:bg-gray-800 md:flex"
              role="group"
              aria-label={copy.language}
            >
              {(['zh', 'en'] as Locale[]).map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleLocaleChange(item)}
                  aria-label={item === 'zh' ? copy.chinese : copy.english}
                  aria-pressed={locale === item}
                  className={`rounded-full px-2 py-1 font-medium transition-colors ${locale === item ? 'bg-teal-600 text-white dark:bg-teal-400 dark:text-gray-950' : 'text-gray-500 hover:text-teal-700 dark:text-gray-400 dark:hover:text-teal-200'}`}
                >
                  {item === 'zh' ? 'ZH' : 'EN'}
                </button>
              ))}
            </div>
            {loading ? (
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" aria-hidden="true" />
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-8 w-8 rounded-full"
                    aria-label={`${copy.accountMenu}: ${getUserDisplayName()}`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-blue-100 text-blue-600">
                        {getUserInitials()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {getUserDisplayName()}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge
                          variant={user.user_type === 'admin' ? 'destructive' : user.user_type === 'pro' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {user.user_type === 'admin' ? copy.roles.admin : user.user_type === 'pro' ? copy.roles.pro : copy.roles.free}
                        </Badge>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  <DropdownMenuItem asChild>
                    <Link href={href('/prompts')} className="cursor-pointer">
                      <FileText className="mr-2 h-4 w-4" />
                      <span>{copy.myPrompts}</span>
                    </Link>
                  </DropdownMenuItem>

                  {featureFlags.promptOptimizerV2 && (
                    <DropdownMenuItem asChild>
                      <Link href={href('/optimizer')} className="cursor-pointer">
                        <Wand2 className="mr-2 h-4 w-4" />
                        <span>{copy.optimizer}</span>
                      </Link>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuItem asChild>
                    <Link href={href('/favorites')} className="cursor-pointer">
                      <Star className="mr-2 h-4 w-4" />
                      <span>{copy.favorites}</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild>
                    <Link href={href('/published')} className="cursor-pointer">
                      <FileText className="mr-2 h-4 w-4" />
                      <span>{copy.published}</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild>
                    <Link href={href('/profile')} className="cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      <span>{copy.profile}</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild>
                    <Link href={href('/settings')} className="cursor-pointer">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>{copy.settings}</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer">
                      <Palette className="mr-2 h-4 w-4" />
                      <span>{copy.visualStyle}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-44">
                      <DropdownMenuRadioGroup value={visualStyle} onValueChange={value => setVisualStyle(value as VisualStyle)}>
                        {visualStyleOptions.map(option => (
                          <DropdownMenuRadioItem key={option.value} value={option.value} className="cursor-pointer">
                            {option.label}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSeparator />

                  {(user.user_type === 'admin' || user.is_admin) && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href={href('/admin')} className="cursor-pointer text-orange-600 dark:text-orange-400">
                          <Shield className="mr-2 h-4 w-4" />
                          <span>{copy.admin}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}

                  <DropdownMenuItem
                    className="cursor-pointer text-red-600"
                    onClick={handleLogout}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>{copy.logout}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="hidden items-center space-x-3 md:flex">
                <Button variant="ghost" asChild>
                  <Link href={href('/login')}>{copy.login}</Link>
                </Button>
                <Button asChild>
                  <Link href={href('/register')}>{copy.register}</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div
        ref={mobileMenuRef}
        id="mobile-primary-navigation"
        className={`${mobileMenuOpen ? 'block' : 'hidden'} border-t border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900 md:hidden`}
      >
        <nav aria-label={copy.primaryNavigation} className="mx-auto max-w-7xl space-y-1">
          {navigationItems.map(item => (
            <Link
              key={item.path}
              href={href(item.path)}
              aria-current={isCurrentPath(item.path) ? 'page' : undefined}
              className={`block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 ${isCurrentPath(item.path) ? 'bg-gray-100 font-semibold dark:bg-gray-800' : ''}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}

          <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-800">
            <div className="mb-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">{copy.language}</div>
            <div className="flex gap-2 px-3" role="group" aria-label={copy.language}>
              {(['zh', 'en'] as Locale[]).map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleLocaleChange(item)}
                  aria-label={item === 'zh' ? copy.chinese : copy.english}
                  aria-pressed={locale === item}
                  className={`min-h-9 rounded-md px-3 text-sm font-medium ${locale === item ? 'bg-teal-600 text-white dark:bg-teal-400 dark:text-gray-950' : 'border border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300'}`}
                >
                  {item === 'zh' ? 'ZH' : 'EN'}
                </button>
              ))}
            </div>
          </div>

          {!user && !loading && (
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-200 pt-3 dark:border-gray-800">
              <Button variant="outline" asChild>
                <Link href={href('/login')} onClick={() => setMobileMenuOpen(false)}>{copy.login}</Link>
              </Button>
              <Button asChild>
                <Link href={href('/register')} onClick={() => setMobileMenuOpen(false)}>{copy.register}</Link>
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  )
}

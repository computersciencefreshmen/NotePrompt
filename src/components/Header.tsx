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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { User, Settings, LogOut, Star, FileText, Shield, Wand2, Menu, X } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import GlobalSearch from '@/components/GlobalSearch'
import { featureFlags } from '@/config/features'
import { detectLocaleFromSearch, Locale, updateLocaleInAddressBar, withLocaleHref } from '@/lib/i18n'

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
    admin: '管理后台',
    logout: '退出登录',
    login: '登录',
    register: '注册',
    primaryNavigation: '主导航',
    openNavigation: '打开导航菜单',
    closeNavigation: '关闭导航菜单',
    accountMenu: '账户菜单',
    language: '语言',
    theme: '主题',
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
    admin: 'Admin Console',
    logout: 'Sign out',
    login: 'Log in',
    register: 'Sign up',
    primaryNavigation: 'Primary navigation',
    openNavigation: 'Open navigation menu',
    closeNavigation: 'Close navigation menu',
    accountMenu: 'Account menu',
    language: 'Language',
    theme: 'Theme',
    chinese: '切换为中文',
    english: 'Switch to English',
    roles: { admin: 'Admin', pro: 'Pro', free: 'Free' },
  },
}

export default function Header() {
  const { user, logout, loading } = useAuth()
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

  const navLinkClass = 'text-[var(--np-ink-muted)] transition-colors hover:text-[var(--np-ink)]'
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
    <header className="relative z-40 border-b border-[var(--np-rule)] bg-[color-mix(in_srgb,var(--np-surface)_94%,transparent)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          {/* Logo and Navigation */}
          <div className="flex min-w-0 items-center gap-7">
            <Link href={href('/')} className="flex shrink-0 items-center">
              <span className="note-prompt-brand text-xl font-semibold tracking-[-0.02em] text-[var(--np-ink)]">Note Prompt</span>
            </Link>

            <nav aria-label={copy.primaryNavigation} className="hidden items-center gap-5 text-sm lg:flex">
              {navigationItems.map(item => (
                <Link
                  key={item.path}
                  href={href(item.path)}
                  aria-current={isCurrentPath(item.path) ? 'page' : undefined}
                  className={`${navLinkClass} inline-flex min-h-11 items-center whitespace-nowrap ${isCurrentPath(item.path) ? 'font-semibold' : ''}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* User Actions */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              ref={mobileMenuButtonRef}
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--np-ink-muted)] hover:bg-[var(--np-surface-soft)] hover:text-[var(--np-ink)] lg:hidden"
              aria-label={mobileMenuOpen ? copy.closeNavigation : copy.openNavigation}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-primary-navigation"
              onClick={() => setMobileMenuOpen(open => !open)}
            >
              {mobileMenuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
            </button>
            <GlobalSearch locale={locale} />
            <div className="max-[359px]:hidden">
              <ThemeToggle />
            </div>
            <div
              className="hidden items-center rounded-full border border-[var(--np-rule)] bg-[var(--np-surface-soft)] p-0.5 text-xs lg:flex"
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
                  className={`rounded-full px-2 py-1 font-medium transition-colors ${locale === item ? 'bg-[var(--np-accent)] text-[var(--np-ink)]' : 'text-[var(--np-ink-muted)] hover:text-[var(--np-ink)]'}`}
                >
                  {item === 'zh' ? 'ZH' : 'EN'}
                </button>
              ))}
            </div>
            {loading ? (
              <div className="h-11 w-11 animate-pulse rounded-full bg-[var(--np-surface-soft)] motion-reduce:animate-none" aria-hidden="true" />
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-11 w-11 rounded-full p-0"
                    aria-label={`${copy.accountMenu}: ${getUserDisplayName()}`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-[var(--np-accent-soft)] text-[var(--np-accent-strong)]">
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
              <div className="hidden items-center gap-2 lg:flex">
                <Button variant="ghost" className="min-h-11" asChild>
                  <Link href={href('/login')}>{copy.login}</Link>
                </Button>
                <Button className="min-h-11 bg-[var(--np-accent)] text-[var(--np-ink)] hover:bg-[var(--np-accent-hover)]" asChild>
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
        className={`${mobileMenuOpen ? 'block' : 'hidden'} border-t border-[var(--np-rule)] bg-[var(--np-surface)] px-4 py-4 lg:hidden`}
      >
        <nav aria-label={copy.primaryNavigation} className="mx-auto max-w-7xl space-y-1">
          <div className="mb-3 flex min-h-11 items-center justify-between border-b border-[var(--np-rule)] px-3 pb-3 min-[360px]:hidden">
            <span className="text-xs font-medium text-[var(--np-ink-muted)]">{copy.theme}</span>
            <ThemeToggle />
          </div>
          {navigationItems.map(item => (
            <Link
              key={item.path}
              href={href(item.path)}
              aria-current={isCurrentPath(item.path) ? 'page' : undefined}
              className={`block min-h-11 rounded-md px-3 py-3 text-sm text-[var(--np-ink-muted)] hover:bg-[var(--np-surface-soft)] hover:text-[var(--np-ink)] ${isCurrentPath(item.path) ? 'bg-[var(--np-accent-soft)] font-semibold text-[var(--np-ink)]' : ''}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}

          <div className="mt-3 border-t border-[var(--np-rule)] pt-3">
            <div className="mb-2 px-3 text-xs font-medium text-[var(--np-ink-muted)]">{copy.language}</div>
            <div className="flex gap-2 px-3" role="group" aria-label={copy.language}>
              {(['zh', 'en'] as Locale[]).map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleLocaleChange(item)}
                  aria-label={item === 'zh' ? copy.chinese : copy.english}
                  aria-pressed={locale === item}
                  className={`min-h-11 rounded-md px-3 text-sm font-medium ${locale === item ? 'bg-[var(--np-accent)] text-[var(--np-ink)]' : 'border border-[var(--np-rule)] text-[var(--np-ink-muted)]'}`}
                >
                  {item === 'zh' ? 'ZH' : 'EN'}
                </button>
              ))}
            </div>
          </div>

          {!user && !loading && (
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--np-rule)] pt-3">
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

'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Header from '@/components/Header'

const ROUTES_WITH_OWN_CHROME = new Set([
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/verify-email',
])

function usesAppHeader(pathname: string) {
  if (pathname === '/') return false

  return !Array.from(ROUTES_WITH_OWN_CHROME).some(
    route => route !== '/' && (pathname === route || pathname.startsWith(`${route}/`))
  )
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const contentRef = useRef<HTMLDivElement>(null)
  const previousPath = useRef(pathname)

  useEffect(() => {
    if (previousPath.current === pathname) return
    previousPath.current = pathname

    const frame = window.requestAnimationFrame(() => {
      const content = contentRef.current
      if (!content) return

      const target = content.querySelector<HTMLElement>('main h1, [role="main"] h1')
        ?? content.querySelector<HTMLElement>('h1')
        ?? content.querySelector<HTMLElement>('main, [role="main"]')
        ?? content
      const needsTemporaryTabIndex = target !== content && !target.hasAttribute('tabindex')

      if (needsTemporaryTabIndex) target.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })

      if (needsTemporaryTabIndex) {
        target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true })
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [pathname])

  return (
    <>
      <a className="skip-link" href="#main-content">
        跳到主内容 / Skip to content
      </a>
      {usesAppHeader(pathname) && <Header />}
      <div id="main-content" ref={contentRef} tabIndex={-1}>
        {children}
      </div>
    </>
  )
}

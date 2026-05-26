export type Locale = 'zh' | 'en'

export function detectLocaleFromSearch(search?: string | null): Locale {
  const query = search ?? (typeof window !== 'undefined' ? window.location.search : '')
  return new URLSearchParams(query).get('lang') === 'en' ? 'en' : 'zh'
}

export function withLocaleHref(href: string, locale: Locale): string {
  if (locale !== 'en') return href
  if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) return href

  const [pathWithQuery, hash] = href.split('#')
  const [path, query = ''] = pathWithQuery.split('?')
  const params = new URLSearchParams(query)
  params.set('lang', 'en')
  const nextQuery = params.toString()
  return `${path}${nextQuery ? `?${nextQuery}` : ''}${hash ? `#${hash}` : ''}`
}

export function updateLocaleInAddressBar(locale: Locale) {
  if (typeof window === 'undefined') return

  const params = new URLSearchParams(window.location.search)
  if (locale === 'en') {
    params.set('lang', 'en')
  } else {
    params.delete('lang')
  }

  const nextQuery = params.toString()
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN'
  window.location.assign(nextUrl)
}
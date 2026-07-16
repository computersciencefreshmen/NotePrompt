export const SESSION_COOKIE_NAME = 'np_session'
export const SESSION_COOKIE_MAX_AGE_SECONDS = 2 * 60 * 60

export type SessionCredential = {
  token: string
  source: 'bearer' | 'cookie'
}

type HeaderReader = {
  get(name: string): string | null
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function getSessionCookieOptions(isProduction = process.env.NODE_ENV === 'production') {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  }
}

export function selectSessionCredential(
  authorizationHeader: string | null,
  cookieToken: string | null,
): SessionCredential | null {
  const bearerMatch = authorizationHeader?.match(/^Bearer\s+(\S+)\s*$/i)
  if (bearerMatch) {
    return { token: bearerMatch[1], source: 'bearer' }
  }

  const normalizedCookie = cookieToken?.trim()
  return normalizedCookie ? { token: normalizedCookie, source: 'cookie' } : null
}

function originMatchesRequestHost(origin: string, host: string | null): boolean {
  if (!host || origin === 'null') return false

  const normalizedHost = host.trim()
  if (!normalizedHost || /[\s,\/@?#]/.test(normalizedHost)) return false

  try {
    const originUrl = new URL(origin)
    if (!['http:', 'https:'].includes(originUrl.protocol)) return false
    if (
      originUrl.username ||
      originUrl.password ||
      originUrl.pathname !== '/' ||
      originUrl.search ||
      originUrl.hash
    ) {
      return false
    }

    const requestUrl = new URL(`${originUrl.protocol}//${normalizedHost}`)
    return originUrl.host.toLowerCase() === requestUrl.host.toLowerCase()
  } catch {
    return false
  }
}

function hasSameOriginBrowserProof(headers: HeaderReader): boolean {
  const origin = headers.get('origin')
  if (origin !== null) {
    // Origin is the stronger signal. Contradictory Fetch Metadata must not override it.
    return originMatchesRequestHost(origin, headers.get('host'))
  }

  return headers.get('sec-fetch-site')?.trim().toLowerCase() === 'same-origin'
}

export function isCookieAuthenticatedRequestAllowed(method: string, headers: HeaderReader): boolean {
  if (SAFE_METHODS.has(method.trim().toUpperCase())) return true
  return hasSameOriginBrowserProof(headers)
}

export function isBrowserCredentialMutationAllowed(headers: HeaderReader): boolean {
  const origin = headers.get('origin')
  const fetchSite = headers.get('sec-fetch-site')?.trim().toLowerCase() || null

  // CLI/mobile clients normally send neither browser-only signal and remain compatible.
  if (origin === null && fetchSite === null) return true
  return hasSameOriginBrowserProof(headers)
}

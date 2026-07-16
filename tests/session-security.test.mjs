import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  isBrowserCredentialMutationAllowed,
  isCookieAuthenticatedRequestAllowed,
  selectSessionCredential,
} from '../src/lib/session-security.ts'

function headers(values = {}) {
  const normalized = new Map(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]),
  )
  return {
    get(name) {
      return normalized.get(name.toLowerCase()) ?? null
    },
  }
}

test('session cookie is HttpOnly, Lax, host-only, two hours, and secure only in production', () => {
  assert.equal(SESSION_COOKIE_NAME, 'np_session')
  assert.equal(SESSION_COOKIE_MAX_AGE_SECONDS, 2 * 60 * 60)
  assert.deepEqual(getSessionCookieOptions(false), {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 2 * 60 * 60,
  })
  assert.equal(getSessionCookieOptions(true).secure, true)
  assert.equal('domain' in getSessionCookieOptions(true), false)
})

test('Bearer credentials take priority and cookies are the fallback', () => {
  assert.deepEqual(selectSessionCredential('Bearer header-token', 'cookie-token'), {
    token: 'header-token',
    source: 'bearer',
  })
  assert.deepEqual(selectSessionCredential(null, 'cookie-token'), {
    token: 'cookie-token',
    source: 'cookie',
  })
  assert.equal(selectSessionCredential('Basic abc', null), null)
  assert.equal(selectSessionCredential('Bearer   ', 'cookie-token')?.source, 'cookie')
})

test('cookie authentication requires a same-origin browser signal for state changes', () => {
  const sameOrigin = headers({ host: 'example.com', origin: 'https://example.com' })
  const fetchMetadata = headers({ host: 'example.com', 'sec-fetch-site': 'same-origin' })
  const crossOrigin = headers({ host: 'example.com', origin: 'https://evil.example' })
  const noBrowserSignal = headers({ host: 'example.com' })

  assert.equal(isCookieAuthenticatedRequestAllowed('GET', crossOrigin), true)
  assert.equal(isCookieAuthenticatedRequestAllowed('HEAD', noBrowserSignal), true)
  assert.equal(isCookieAuthenticatedRequestAllowed('POST', sameOrigin), true)
  assert.equal(isCookieAuthenticatedRequestAllowed('DELETE', fetchMetadata), true)
  assert.equal(isCookieAuthenticatedRequestAllowed('POST', crossOrigin), false)
  assert.equal(isCookieAuthenticatedRequestAllowed('PATCH', noBrowserSignal), false)
  assert.equal(
    isCookieAuthenticatedRequestAllowed(
      'POST',
      headers({ host: 'example.com', origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' }),
    ),
    false,
  )
})

test('login and registration allow headerless API clients but reject explicit cross-site browsers', () => {
  assert.equal(isBrowserCredentialMutationAllowed(headers({ host: 'example.com' })), true)
  assert.equal(
    isBrowserCredentialMutationAllowed(headers({ host: 'example.com', origin: 'https://example.com' })),
    true,
  )
  assert.equal(
    isBrowserCredentialMutationAllowed(headers({ host: 'example.com', 'sec-fetch-site': 'same-origin' })),
    true,
  )
  assert.equal(
    isBrowserCredentialMutationAllowed(headers({ host: 'example.com', origin: 'https://evil.example' })),
    false,
  )
  assert.equal(
    isBrowserCredentialMutationAllowed(headers({ host: 'example.com', 'sec-fetch-site': 'cross-site' })),
    false,
  )
  assert.equal(
    isBrowserCredentialMutationAllowed(headers({ host: 'example.com', 'sec-fetch-site': 'same-site' })),
    false,
  )
})

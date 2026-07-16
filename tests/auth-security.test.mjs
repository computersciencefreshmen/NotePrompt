import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'

import {
  DEFAULT_SESSION_TTL,
  SESSION_TOKEN_AUDIENCE,
  SESSION_TOKEN_ISSUER,
  createApiKeyMaterial,
  getJwtSecret,
  hashApiKey,
  isSessionVersionCurrent,
  signSessionToken,
  toSafeUserDto,
  verifySessionToken,
} from '../src/lib/auth-security.ts'

const secret = 'test-session-secret-that-is-at-least-32-bytes'

test('JWT secrets are resolved at runtime and missing configuration fails closed', () => {
  assert.equal(getJwtSecret({ JWT_SECRET: secret }), secret)
  assert.throws(() => getJwtSecret({}), /JWT_SECRET environment variable is required at runtime/)
  assert.throws(
    () => getJwtSecret({ JWT_SECRET: '   ' }),
    /JWT_SECRET environment variable is required at runtime/,
  )
})

test('the default JWT secret source is evaluated after module import', () => {
  const originalSecret = process.env.JWT_SECRET

  try {
    delete process.env.JWT_SECRET
    assert.throws(() => getJwtSecret(), /JWT_SECRET environment variable is required at runtime/)

    process.env.JWT_SECRET = secret
    assert.equal(getJwtSecret(), secret)
  } finally {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET
    } else {
      process.env.JWT_SECRET = originalSecret
    }
  }
})

test('session tokens use fixed HS256 issuer/audience and a short default lifetime', () => {
  const token = signSessionToken({
    userId: 7,
    username: 'alice',
    userType: 'pro',
    sessionVersion: 3,
  }, secret)

  const decoded = jwt.decode(token, { complete: true })
  assert.equal(decoded?.header.alg, 'HS256')

  const payload = verifySessionToken(token, secret)
  assert.equal(payload?.userId, 7)
  assert.equal(payload?.sessionVersion, 3)
  assert.equal(payload?.iss, SESSION_TOKEN_ISSUER)
  assert.equal(payload?.aud, SESSION_TOKEN_AUDIENCE)
  assert.equal(DEFAULT_SESSION_TTL, '2h')
  assert.ok(payload?.iat && payload?.exp)
  assert.ok(payload.exp - payload.iat <= 2 * 60 * 60)
})

test('session verification rejects the wrong issuer, audience, and algorithm', () => {
  const wrongIssuer = jwt.sign(
    { userId: 7, username: 'alice', userType: 'free', sessionVersion: 1 },
    secret,
    { algorithm: 'HS256', issuer: 'another-app', audience: SESSION_TOKEN_AUDIENCE, expiresIn: '2h' },
  )
  const wrongAudience = jwt.sign(
    { userId: 7, username: 'alice', userType: 'free', sessionVersion: 1 },
    secret,
    { algorithm: 'HS256', issuer: SESSION_TOKEN_ISSUER, audience: 'another-app', expiresIn: '2h' },
  )
  const wrongAlgorithm = jwt.sign(
    { userId: 7, username: 'alice', userType: 'free', sessionVersion: 1 },
    secret,
    { algorithm: 'HS384', issuer: SESSION_TOKEN_ISSUER, audience: SESSION_TOKEN_AUDIENCE, expiresIn: '2h' },
  )

  assert.equal(verifySessionToken(wrongIssuer, secret), null)
  assert.equal(verifySessionToken(wrongAudience, secret), null)
  assert.equal(verifySessionToken(wrongAlgorithm, secret), null)
})

test('session version comparison revokes stale tokens and supports legacy version one', () => {
  assert.equal(isSessionVersionCurrent({ sessionVersion: 2 }, { session_version: 2 }), true)
  assert.equal(isSessionVersionCurrent({ sessionVersion: 1 }, {}), true)
  assert.equal(isSessionVersionCurrent({ sessionVersion: 1 }, { session_version: 2 }), false)
  assert.equal(isSessionVersionCurrent({ sessionVersion: 2 }, { session_version: 'invalid' }), false)
})

test('safe user DTO is an explicit whitelist and normalizes database values', () => {
  const dto = toSafeUserDto({
    id: 9,
    username: 'bob',
    email: 'bob@example.com',
    user_type: 'pro',
    is_admin: 0,
    is_active: 1,
    email_verified: 1,
    permissions: '["create_prompt"]',
    avatar_url: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
    password_hash: 'must-not-leak',
    verification_code: '123456',
    reset_token: 'must-not-leak',
    session_version: 8,
  })

  assert.deepEqual(Object.keys(dto).sort(), [
    'avatar_url',
    'created_at',
    'email',
    'email_verified',
    'id',
    'is_active',
    'is_admin',
    'permissions',
    'updated_at',
    'user_type',
    'username',
  ])
  assert.equal(dto.is_admin, false)
  assert.equal(dto.is_active, true)
  assert.deepEqual(dto.permissions, ['create_prompt'])
  assert.equal('password_hash' in dto, false)
  assert.equal('verification_code' in dto, false)
  assert.equal('session_version' in dto, false)
})

test('API keys use random material and only expose a display prefix plus deterministic hash', () => {
  const first = createApiKeyMaterial()
  const second = createApiKeyMaterial()

  assert.match(first.apiKey, /^np_[A-Za-z0-9_-]{40,}$/)
  assert.notEqual(first.apiKey, second.apiKey)
  assert.equal(first.keyHash, hashApiKey(first.apiKey))
  assert.equal(first.keyPrefix, first.apiKey.slice(0, 12))
  assert.match(first.keyHash, /^[a-f0-9]{64}$/)
  assert.notEqual(first.keyHash, first.apiKey)
})

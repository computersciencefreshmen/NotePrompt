import crypto from 'node:crypto'
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken'

export const SESSION_TOKEN_ISSUER = 'note-prompt'
export const SESSION_TOKEN_AUDIENCE = 'note-prompt-api'
export const DEFAULT_SESSION_TTL: SignOptions['expiresIn'] = '2h'

export type SafeUserType = 'free' | 'pro' | 'admin'

export type SessionTokenPayload = JwtPayload & {
  userId: number
  username: string
  userType: SafeUserType
  sessionVersion: number
}

export type SafeUserDto = {
  id: number
  username: string
  email: string
  user_type: SafeUserType
  is_admin: boolean
  permissions: string[]
  avatar_url: string
  is_active: boolean
  email_verified: boolean
  created_at: string
  updated_at: string
}

type SessionPrincipal = {
  userId: number
  username: string
  userType: SafeUserType
  sessionVersion: number
}

export function normalizeUserType(value: unknown): SafeUserType {
  return value === 'pro' || value === 'admin' ? value : 'free'
}

export function databaseBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

export function getSessionVersion(user: { session_version?: unknown }): number | null {
  if (user.session_version == null) return 1
  const version = Number(user.session_version)
  return Number.isSafeInteger(version) && version >= 1 ? version : null
}

export function signSessionToken(
  principal: SessionPrincipal,
  secret: string,
  expiresIn: SignOptions['expiresIn'] = DEFAULT_SESSION_TTL,
): string {
  if (!secret) throw new Error('JWT secret is required')
  if (!Number.isSafeInteger(principal.userId) || principal.userId <= 0) {
    throw new Error('A valid user ID is required')
  }
  if (!Number.isSafeInteger(principal.sessionVersion) || principal.sessionVersion < 1) {
    throw new Error('A valid session version is required')
  }

  return jwt.sign(
    {
      userId: principal.userId,
      username: principal.username,
      userType: principal.userType,
      sessionVersion: principal.sessionVersion,
    },
    secret,
    {
      algorithm: 'HS256',
      issuer: SESSION_TOKEN_ISSUER,
      audience: SESSION_TOKEN_AUDIENCE,
      expiresIn,
    },
  )
}

export function verifySessionToken(token: string, secret: string): SessionTokenPayload | null {
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: SESSION_TOKEN_ISSUER,
      audience: SESSION_TOKEN_AUDIENCE,
    })

    if (typeof payload === 'string') return null
    const userId = Number(payload.userId)
    const sessionVersion = Number(payload.sessionVersion)
    if (
      !Number.isSafeInteger(userId) ||
      userId <= 0 ||
      typeof payload.username !== 'string' ||
      !['free', 'pro', 'admin'].includes(String(payload.userType)) ||
      !Number.isSafeInteger(sessionVersion) ||
      sessionVersion < 1
    ) {
      return null
    }

    return {
      ...payload,
      userId,
      username: payload.username,
      userType: payload.userType as SafeUserType,
      sessionVersion,
    }
  } catch {
    return null
  }
}

export function isSessionVersionCurrent(
  payload: { sessionVersion?: unknown },
  user: { session_version?: unknown },
): boolean {
  const tokenVersion = Number(payload.sessionVersion)
  const currentVersion = getSessionVersion(user)
  return currentVersion != null && Number.isSafeInteger(tokenVersion) && tokenVersion === currentVersion
}

function parsePermissions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((permission): permission is string => typeof permission === 'string')
  }

  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.filter((permission): permission is string => typeof permission === 'string')
      }
    } catch {
      // Fall through to the least-privilege defaults below.
    }
  }

  return ['create_prompt', 'favorite_prompt']
}

function publicDate(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value || '')
}

export function toSafeUserDto(user: Record<string, unknown>): SafeUserDto {
  const id = Number(user.id)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('User record has an invalid ID')
  }

  return {
    id,
    username: String(user.username || ''),
    email: String(user.email || ''),
    user_type: normalizeUserType(user.user_type),
    is_admin: databaseBoolean(user.is_admin),
    permissions: parsePermissions(user.permissions),
    avatar_url: String(user.avatar_url || ''),
    is_active: databaseBoolean(user.is_active),
    email_verified: databaseBoolean(user.email_verified),
    created_at: publicDate(user.created_at),
    updated_at: publicDate(user.updated_at),
  }
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey, 'utf8').digest('hex')
}

export function createApiKeyMaterial(): {
  apiKey: string
  keyHash: string
  keyPrefix: string
} {
  const apiKey = `np_${crypto.randomBytes(32).toString('base64url')}`
  return {
    apiKey,
    keyHash: hashApiKey(apiKey),
    keyPrefix: apiKey.slice(0, 12),
  }
}

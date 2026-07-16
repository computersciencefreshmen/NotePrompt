import type { SignOptions } from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'
import { User } from '@/types'
import db from './mysql-database'
import {
  DEFAULT_SESSION_TTL,
  type SessionTokenPayload,
  createApiKeyMaterial,
  databaseBoolean,
  getSessionVersion,
  hashApiKey,
  isSessionVersionCurrent,
  normalizeUserType,
  signSessionToken,
  toSafeUserDto,
  verifySessionToken,
} from './auth-security'
import {
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  isCookieAuthenticatedRequestAllowed,
  selectSessionCredential,
  type SessionCredential,
} from './session-security'
export {
  ADMIN_USER_LIMITS,
  FREE_USER_LIMITS,
  PRO_USER_LIMITS,
  getUserLimits,
} from './entitlement-policy'

// JWT密钥必须在环境变量中配置，否则应用启动失败
const configuredJwtSecret = process.env.JWT_SECRET
if (!configuredJwtSecret) {
  throw new Error('FATAL: JWT_SECRET environment variable is required. Please set it in your .env file.')
}
const JWT_SECRET: string = configuredJwtSecret
export function verifyToken(token: string): SessionTokenPayload | null {
  return verifySessionToken(token, JWT_SECRET)
}

export function createSessionToken(user: Record<string, unknown>): string {
  const sessionVersion = getSessionVersion(user)
  if (sessionVersion == null) {
    throw new Error('用户会话版本无效')
  }

  return signSessionToken(
    {
      userId: Number(user.id),
      username: String(user.username || ''),
      userType: normalizeUserType(user.user_type),
      sessionVersion,
    },
    JWT_SECRET,
    (process.env.JWT_EXPIRES_IN || DEFAULT_SESSION_TTL) as SignOptions['expiresIn'],
  )
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions())
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    ...getSessionCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  })
}

export function getSessionCredentialFromRequest(request: NextRequest): SessionCredential | null {
  return selectSessionCredential(
    request.headers.get('authorization'),
    request.cookies.get(SESSION_COOKIE_NAME)?.value || null,
  )
}

export function getTokenFromRequest(request: NextRequest): string | null {
  return getSessionCredentialFromRequest(request)?.token || null
}

export async function getUserFromToken(token: string): Promise<User | null> {
  const payload = verifyToken(token)
  if (!payload) return null

  try {
    const currentUser = await db.getUserById(payload.userId)
    if (
      !currentUser ||
      !databaseBoolean(currentUser.is_active) ||
      !isSessionVersionCurrent(payload, currentUser)
    ) {
      return null
    }

    // 角色、管理员状态、权限和资料始终以数据库当前值为准，不信任旧 JWT 声明。
    return toSafeUserDto(currentUser)
  } catch (error) {
    console.error('会话用户复核失败:', error)
    return null
  }
}

export async function requireAuth(request: NextRequest): Promise<
  { user: User; token: string; authSource: SessionCredential['source'] } |
  { error: string; status: number }
> {
  const credential = getSessionCredentialFromRequest(request)

  if (!credential) {
    return { error: '未提供认证令牌', status: 401 }
  }

  if (
    credential.source === 'cookie' &&
    !isCookieAuthenticatedRequestAllowed(request.method, request.headers)
  ) {
    return { error: '跨站请求已拒绝', status: 403 }
  }

  const user = await getUserFromToken(credential.token)
  
  if (!user) {
    return { error: '无效的认证令牌', status: 401 }
  }

  return { user, token: credential.token, authSource: credential.source }
}

export function checkPermission(user: User, permission: string): boolean {
  switch (permission) {
    case 'ai_optimize':
      return user.user_type === 'pro'
    case 'unlimited_prompts':
      return user.user_type === 'pro'
    case 'favorite':
      return true // 所有用户都可以收藏
    case 'create_prompt':
      return true // 所有用户都可以创建提示词
    default:
      return false
  }
}

// 管理员权限检查
export function requireAdmin(user: User): boolean {
  return user.is_admin || user.user_type === 'admin'
}

// 检查特定权限
export function hasPermission(user: User, permission: string): boolean {
  if (user.is_admin || user.user_type === 'admin') {
    return true
  }
  return user.permissions.includes(permission)
}

// 管理员权限中间件
export async function requireAdminAuth(request: NextRequest) {
  const auth = await requireAuth(request)
  if ('error' in auth) {
    return { error: '需要管理员权限', status: auth.status }
  }
  
  if (!requireAdmin(auth.user)) {
    return { error: '权限不足，需要管理员权限', status: 403 }
  }
  
  return auth
}

export type ApiKeyPrincipal = { userId: number; keyId: number }

// API 密钥认证：数据库仅按 SHA-256 摘要查询，不保存或查询明文密钥。
export async function authenticateApiKey(apiKey: string): Promise<ApiKeyPrincipal | null> {
  if (!/^np_[A-Za-z0-9_-]{40,}$/.test(apiKey)) return null

  try {
    const apiKeyHash = hashApiKey(apiKey)
    const [result] = await db.execute(
      `SELECT ak.id, ak.user_id, ak.is_active, ak.expires_at, u.is_active AS user_is_active
       FROM api_keys ak
       JOIN users u ON ak.user_id = u.id
       WHERE ak.api_key_hash = ?`,
      [apiKeyHash]
    )
    
    const keyData = (result as Record<string, unknown>[])[0]
    if (!keyData) {
      return null
    }

    // 密钥和所属用户都必须处于启用状态。
    if (!databaseBoolean(keyData.is_active) || !databaseBoolean(keyData.user_is_active)) {
      return null
    }

    // 检查是否过期
    if (keyData.expires_at && new Date(String(keyData.expires_at)) < new Date()) {
      return null
    }

    const keyId = Number(keyData.id)
    const userId = Number(keyData.user_id)
    if (!Number.isSafeInteger(keyId) || keyId <= 0 || !Number.isSafeInteger(userId) || userId <= 0) {
      return null
    }
    await db.execute('UPDATE api_keys SET last_used_at = NOW() WHERE id = ?', [keyData.id])

    return { userId, keyId }
  } catch (error) {
    console.error('API密钥验证错误:', error)
    return null
  }
}

export async function verifyApiKey(apiKey: string): Promise<boolean> {
  return (await authenticateApiKey(apiKey)) != null
}

// 生成API密钥
export async function generateApiKey(userId: number, name?: string): Promise<string> {
  const { apiKey, keyHash, keyPrefix } = createApiKeyMaterial()
  
  try {
    await db.execute(
      `INSERT INTO api_keys (api_key_hash, key_prefix, user_id, name, is_active, created_at, expires_at)
       VALUES (?, ?, ?, ?, 1, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR))`,
      [keyHash, keyPrefix, userId, name || '默认API密钥']
    )
    
    return apiKey
  } catch (error) {
    console.error('生成API密钥错误:', error)
    throw new Error('生成API密钥失败')
  }
}

// 获取用户的API密钥列表
export async function getUserApiKeys(userId: number) {
  try {
    const [result] = await db.execute(
      `SELECT id, key_prefix, name, is_active, created_at, expires_at, last_used_at
       FROM api_keys 
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    )
    
    return result
  } catch (error) {
    console.error('获取API密钥列表错误:', error)
    throw new Error('获取API密钥列表失败')
  }
}

// 删除API密钥
export async function deleteApiKey(userId: number, keyId: number): Promise<boolean> {
  try {
    const [result] = await db.execute(
      'DELETE FROM api_keys WHERE id = ? AND user_id = ?',
      [keyId, userId]
    )
    
    return Number((result as { affectedRows?: number }).affectedRows) > 0
  } catch (error) {
    console.error('删除API密钥错误:', error)
    return false
  }
}

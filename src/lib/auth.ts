import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { User } from '@/types'
import db from './mysql-database'

// JWT密钥必须在环境变量中配置，否则应用启动失败
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required. Please set it in your .env file.')
}
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000'

interface TokenPayload {
  userId: number
  username: string
  userType: 'free' | 'pro' | 'admin'
  iat: number
  exp: number
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload
  } catch (error) {
    return null
  }
}

export function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }
  return null
}

export async function getUserFromToken(token: string): Promise<User | null> {
  const payload = verifyToken(token)
  if (!payload) return null
  // 直接用payload构造User对象
  return {
    id: payload.userId,
    username: payload.username,
    user_type: payload.userType,
    is_active: true,
    is_admin: payload.userType === 'admin',
    permissions: [],
    created_at: '',
    updated_at: '',
    email: '',
    avatar_url: ''
  }
}

export async function requireAuth(request: NextRequest): Promise<{ user: User; token: string } | { error: string; status: number }> {
  const token = getTokenFromRequest(request)

  if (!token) {
    return { error: '未提供认证令牌', status: 401 }
  }

  const user = await getUserFromToken(token)
  
  if (!user) {
    return { error: '无效的认证令牌', status: 401 }
  }

  return { user, token }
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

export const FREE_USER_LIMITS = {
  max_prompts: 50,
  max_ai_usage_per_month: 10,
  max_folders: 10
}

export const PRO_USER_LIMITS = {
  max_prompts: -1, // 无限制
  max_ai_usage_per_month: -1, // 无限制
  max_folders: -1 // 无限制
}

export function getUserLimits(userType: 'free' | 'pro') {
  return userType === 'pro' ? PRO_USER_LIMITS : FREE_USER_LIMITS
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
    return { error: '需要管理员权限' }
  }
  
  if (!requireAdmin(auth.user)) {
    return { error: '权限不足，需要管理员权限' }
  }
  
  return auth
}

// API密钥验证
export async function verifyApiKey(apiKey: string): Promise<boolean> {
  try {
    const [result] = await db.execute(
      'SELECT id, user_id, is_active, expires_at FROM api_keys WHERE api_key = ?',
      [apiKey]
    )
    
    const keyData = (result as any)[0]
    if (!keyData) {
      return false
    }

    // 检查密钥是否激活
    if (!keyData.is_active) {
      return false
    }

    // 检查是否过期
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return false
    }

    return true
  } catch (error) {
    console.error('API密钥验证错误:', error)
    return false
  }
}

// 生成API密钥
export async function generateApiKey(userId: number, name?: string): Promise<string> {
  const apiKey = `np_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`
  
  try {
    await db.execute(
      `INSERT INTO api_keys (api_key, user_id, name, is_active, created_at, expires_at)
       VALUES (?, ?, ?, 1, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR))`,
      [apiKey, userId, name || '默认API密钥']
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
      `SELECT id, api_key, name, is_active, created_at, expires_at, last_used_at
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
    
    return (result as any).affectedRows > 0
  } catch (error) {
    console.error('删除API密钥错误:', error)
    return false
  }
}

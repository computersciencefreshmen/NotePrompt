import 'server-only'
import crypto from 'crypto'
import { AI_MODELS } from '@/config/ai'
import db from '@/lib/mysql-database'
import { maskSecret } from '@/lib/provider-runtime-config'
import { normalizeProviderBaseURL } from '@/lib/ai-runtime-policy'

type AIProviderKey = keyof typeof AI_MODELS

type UserProviderRow = {
  provider: string
  encrypted_api_key: string
  base_url: string | null
  is_active: number | boolean
  updated_at: string
}

export type UserProviderRuntimeConfig = {
  apiKey: string
  baseURL?: string
  source: 'user'
}

function assertProvider(provider: string): provider is AIProviderKey {
  return Object.prototype.hasOwnProperty.call(AI_MODELS, provider)
}

function getEncryptionKey() {
  const secret = process.env.PROVIDER_KEY_ENCRYPTION_SECRET || (process.env.NODE_ENV === 'production' ? '' : process.env.JWT_SECRET)
  if (!secret) {
    throw new Error('PROVIDER_KEY_ENCRYPTION_SECRET is required for provider key encryption')
  }
  return crypto.createHash('sha256').update(secret).digest()
}

function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':')
}

function decryptSecret(value: string) {
  const [version, ivText, tagText, encryptedText] = value.split(':')
  if (version !== 'v1' || !ivText || !tagText || !encryptedText) {
    throw new Error('Invalid encrypted provider key format')
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivText, 'base64'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

async function assertUserProviderSchemaReady() {
  await db.assertSchemaReady()
}

async function getStoredConfig(userId: number, provider: string): Promise<UserProviderRow | null> {
  await assertUserProviderSchemaReady()
  const result = await db.query(
    `SELECT provider, encrypted_api_key, base_url, is_active, updated_at
     FROM user_provider_configs
     WHERE user_id = ? AND provider = ? AND is_active = true
     LIMIT 1`,
    [userId, provider]
  )
  return (result.rows as UserProviderRow[])[0] || null
}

export async function listUserProviderConfigs(userId: number) {
  await assertUserProviderSchemaReady()
  const result = await db.query(
    `SELECT provider, encrypted_api_key, base_url, is_active, updated_at
     FROM user_provider_configs
     WHERE user_id = ?`,
    [userId]
  )
  const rowsByProvider = new Map((result.rows as UserProviderRow[]).map(row => [row.provider, row]))

  return Object.entries(AI_MODELS).map(([provider, config]) => {
    const row = rowsByProvider.get(provider)
    let keyPreview = ''
    if (row?.encrypted_api_key) {
      try {
        keyPreview = maskSecret(decryptSecret(row.encrypted_api_key))
      } catch {
        keyPreview = 'configured'
      }
    }

    return {
      provider,
      name: config.name,
      keyConfigured: Boolean(row?.encrypted_api_key && row.is_active),
      keyPreview,
      baseURL: (() => {
        try {
          return normalizeProviderBaseURL(provider, row?.base_url) || ''
        } catch {
          return ''
        }
      })(),
      defaultBaseURL: config.baseURL,
      modelCount: Object.keys(config.models).length,
      updatedAt: row?.updated_at || null,
    }
  })
}

export async function upsertUserProviderConfig(userId: number, provider: string, apiKey: string, baseURL?: string) {
  if (!assertProvider(provider)) {
    throw new Error('Unsupported AI provider')
  }

  const trimmedKey = apiKey.trim()
  if (!trimmedKey) {
    throw new Error('API Key is required')
  }

  await assertUserProviderSchemaReady()
  const trimmedBaseURL = normalizeProviderBaseURL(provider, baseURL) || null
  await db.query(
    `INSERT INTO user_provider_configs (user_id, provider, encrypted_api_key, base_url, is_active)
     VALUES (?, ?, ?, ?, true)
     ON DUPLICATE KEY UPDATE
       encrypted_api_key = VALUES(encrypted_api_key),
       base_url = VALUES(base_url),
       is_active = true,
       updated_at = CURRENT_TIMESTAMP`,
    [userId, provider, encryptSecret(trimmedKey), trimmedBaseURL]
  )
}

export async function deleteUserProviderConfig(userId: number, provider: string) {
  if (!assertProvider(provider)) {
    throw new Error('Unsupported AI provider')
  }

  await assertUserProviderSchemaReady()
  await db.query('DELETE FROM user_provider_configs WHERE user_id = ? AND provider = ?', [userId, provider])
}

export async function getUserProviderRuntimeConfig(userId: number | null | undefined, provider: string): Promise<UserProviderRuntimeConfig | null> {
  if (!userId || !assertProvider(provider)) return null

  const row = await getStoredConfig(userId, provider)
  if (!row?.encrypted_api_key) return null

  let baseURL: string | undefined
  try {
    baseURL = normalizeProviderBaseURL(provider, row.base_url)
  } catch {
    baseURL = undefined
  }

  return {
    apiKey: decryptSecret(row.encrypted_api_key),
    baseURL,
    source: 'user',
  }
}

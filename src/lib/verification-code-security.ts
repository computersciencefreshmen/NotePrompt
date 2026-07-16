import crypto from 'node:crypto'

export type VerificationCodePurpose = 'email-verification' | 'password-reset'

export const MAX_AUTH_JSON_BODY_BYTES = 8 * 1024
export const MAX_EMAIL_LENGTH = 254

type VerificationSecretEnvironment = Readonly<Record<string, string | undefined>> & {
  VERIFICATION_CODE_SECRET?: string
  JWT_SECRET?: string
}

const HASH_PATTERN = /^[a-f0-9]{64}$/i
const CODE_PATTERN = /^\d{6}$/
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

export function normalizeVerificationEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function parseVerificationEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = normalizeVerificationEmail(value)
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email) ? email : null
}

export function isSixDigitVerificationCode(value: unknown): value is string {
  return typeof value === 'string' && CODE_PATTERN.test(value)
}

export function getVerificationCodeSecret(
  environment: VerificationSecretEnvironment = process.env,
): string {
  if (environment.VERIFICATION_CODE_SECRET) return environment.VERIFICATION_CODE_SECRET
  if (environment.JWT_SECRET) return environment.JWT_SECRET
  throw new Error('VERIFICATION_CODE_SECRET or JWT_SECRET is required')
}

export function hashVerificationCode(
  email: string,
  purpose: VerificationCodePurpose,
  code: string,
  secret: string,
): string {
  const normalizedEmail = normalizeVerificationEmail(email)
  if (!normalizedEmail) throw new TypeError('A valid email is required')
  if (purpose !== 'email-verification' && purpose !== 'password-reset') {
    throw new TypeError('A valid verification purpose is required')
  }
  if (!CODE_PATTERN.test(code)) throw new TypeError('A six-digit verification code is required')
  if (!secret) throw new Error('A verification code secret is required')

  return crypto
    .createHmac('sha256', secret)
    .update(`${normalizedEmail}\0${purpose}\0${code}`, 'utf8')
    .digest('hex')
}

export function verifyVerificationCodeHash(
  storedHash: unknown,
  email: string,
  purpose: VerificationCodePurpose,
  code: string,
  secret: string,
): boolean {
  let candidateHash: string
  try {
    candidateHash = hashVerificationCode(email, purpose, code, secret)
  } catch {
    return false
  }

  const normalizedStoredHash = typeof storedHash === 'string' && HASH_PATTERN.test(storedHash)
    ? storedHash.toLowerCase()
    : '0'.repeat(64)
  const matches = crypto.timingSafeEqual(
    Buffer.from(normalizedStoredHash, 'hex'),
    Buffer.from(candidateHash, 'hex'),
  )

  return HASH_PATTERN.test(String(storedHash || '')) && matches
}

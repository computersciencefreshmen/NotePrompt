import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PASSWORD_POLICY_ERROR,
  getPasswordPolicyError,
  isPasswordPolicyCompliant,
} from '../src/lib/password-security.ts'
import {
  MAX_AUTH_JSON_BODY_BYTES,
  getVerificationCodeSecret,
  hashVerificationCode,
  isSixDigitVerificationCode,
  normalizeVerificationEmail,
  parseVerificationEmail,
  verifyVerificationCodeHash,
} from '../src/lib/verification-code-security.ts'

test('password policy consistently requires 8-128 chars with upper, lower, and digit', () => {
  assert.equal(isPasswordPolicyCompliant('Abcdefg1'), true)
  assert.equal(isPasswordPolicyCompliant(`Aa1${'x'.repeat(125)}`), true)

  for (const invalid of [
    'Abcdef1',
    `Aa1${'x'.repeat(126)}`,
    'abcdefgh1',
    'ABCDEFGH1',
    'Abcdefghi',
    null,
    12345678,
  ]) {
    assert.equal(isPasswordPolicyCompliant(invalid), false)
    assert.equal(getPasswordPolicyError(invalid), PASSWORD_POLICY_ERROR)
  }
  assert.equal(getPasswordPolicyError('Abcdefg1'), null)
})

test('verification hashes normalize email and bind the code to its purpose', () => {
  const secret = 'verification-secret-for-tests'
  const emailHash = hashVerificationCode(
    ' Alice@Example.COM ',
    'email-verification',
    '123456',
    secret,
  )
  const normalizedHash = hashVerificationCode(
    'alice@example.com',
    'email-verification',
    '123456',
    secret,
  )
  const resetHash = hashVerificationCode(
    'alice@example.com',
    'password-reset',
    '123456',
    secret,
  )

  assert.equal(normalizeVerificationEmail(' Alice@Example.COM '), 'alice@example.com')
  assert.equal(emailHash, normalizedHash)
  assert.notEqual(emailHash, resetHash)
  assert.notEqual(emailHash, hashVerificationCode(
    'alice@example.com',
    'email-verification',
    '654321',
    secret,
  ))
  assert.match(emailHash, /^[a-f0-9]{64}$/)
  assert.equal(emailHash.includes('123456'), false)
})

test('authentication field helpers reject wrong types and oversized email or code input', () => {
  assert.equal(MAX_AUTH_JSON_BODY_BYTES, 8 * 1024)
  assert.equal(parseVerificationEmail(' Alice@Example.COM '), 'alice@example.com')
  assert.equal(parseVerificationEmail('not-an-email'), null)
  assert.equal(parseVerificationEmail('a'.repeat(250) + '@x.io'), null)
  assert.equal(parseVerificationEmail(123), null)
  assert.equal(isSixDigitVerificationCode('123456'), true)
  assert.equal(isSixDigitVerificationCode('12345'), false)
  assert.equal(isSixDigitVerificationCode(123456), false)
})

test('verification hash comparison accepts only the correct email, purpose, code, and secret', () => {
  const secret = 'verification-secret-for-tests'
  const storedHash = hashVerificationCode(
    'alice@example.com',
    'password-reset',
    '123456',
    secret,
  )

  assert.equal(verifyVerificationCodeHash(
    storedHash,
    'ALICE@example.com',
    'password-reset',
    '123456',
    secret,
  ), true)
  assert.equal(verifyVerificationCodeHash(storedHash, 'bob@example.com', 'password-reset', '123456', secret), false)
  assert.equal(verifyVerificationCodeHash(storedHash, 'alice@example.com', 'email-verification', '123456', secret), false)
  assert.equal(verifyVerificationCodeHash(storedHash, 'alice@example.com', 'password-reset', '654321', secret), false)
  assert.equal(verifyVerificationCodeHash('not-a-hash', 'alice@example.com', 'password-reset', '123456', secret), false)
})

test('verification secret prefers its dedicated value and falls back to JWT secret', () => {
  assert.equal(getVerificationCodeSecret({
    VERIFICATION_CODE_SECRET: 'dedicated',
    JWT_SECRET: 'jwt-fallback',
  }), 'dedicated')
  assert.equal(getVerificationCodeSecret({ JWT_SECRET: 'jwt-fallback' }), 'jwt-fallback')
  assert.throws(() => getVerificationCodeSecret({}), /VERIFICATION_CODE_SECRET or JWT_SECRET/)
})

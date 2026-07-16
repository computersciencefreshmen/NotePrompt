import assert from 'node:assert/strict'
import test from 'node:test'

import { formatSafeAIError } from '../src/lib/ai-error-sanitizer.ts'

test('AI errors are mapped to fixed user-facing categories', () => {
  assert.equal(
    formatSafeAIError(new Error('upstream request timeout after 60s')),
    'AI 服务响应超时，请稍后重试',
  )
  assert.equal(
    formatSafeAIError(new Error('401 authentication failed')),
    'AI 服务认证失败，请检查模型供应商配置',
  )
  assert.equal(
    formatSafeAIError(new Error('429 rate limit exceeded')),
    'AI 服务请求过于频繁，请稍后重试',
  )
})

test('AI errors never reflect provider or infrastructure details', () => {
  const rawMessage = 'unexpected failure at http://mysql.internal:3306 for user root'
  const safeMessage = formatSafeAIError(new Error(rawMessage))

  assert.equal(safeMessage, 'AI 服务请求失败，请稍后重试')
  assert.equal(safeMessage.includes('mysql.internal'), false)
  assert.equal(safeMessage.includes('root'), false)
})

import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { EmailService } from '../src/lib/email-service.ts'

const mockCredential = 'x'.repeat(32)
const validEnvironment = {
  EMAIL_HOST: 'smtp.example.test',
  EMAIL_PORT: '465',
  EMAIL_SECURE: 'true',
  EMAIL_USER: 'mailer@example.test',
  EMAIL_PASS: mockCredential,
  EMAIL_FROM: 'hello@example.test',
  EMAIL_FROM_NAME: 'Note Prompt Test',
}

test('constructing and importing the email service has no transport or network side effects', () => {
  let environmentReads = 0
  let factoryCalls = 0
  const service = new EmailService(
    () => {
      environmentReads += 1
      return validEnvironment
    },
    () => {
      factoryCalls += 1
      throw new Error('the transport factory must stay lazy')
    },
  )

  assert.equal(environmentReads, 0)
  assert.equal(factoryCalls, 0)
  assert.match(service.generateVerificationCode(), /^\d{6}$/)
  assert.equal(environmentReads, 0)
  assert.equal(factoryCalls, 0)

  const source = fs.readFileSync(new URL('../src/lib/email-service.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\.verify\s*\(/)
})

test('SMTP configuration is read on first delivery and the transporter is reused', async () => {
  let environment = {}
  let environmentReads = 0
  let factoryCalls = 0
  const configs = []
  const messages = []

  const service = new EmailService(
    () => {
      environmentReads += 1
      return environment
    },
    config => {
      factoryCalls += 1
      configs.push(config)
      return {
        async sendMail(message) {
          messages.push(message)
          return { messageId: 'test-message' }
        },
      }
    },
  )

  assert.equal(factoryCalls, 0)
  environment = validEnvironment

  assert.equal(await service.sendVerificationEmail({
    to: 'reader@example.test',
    username: 'Reader',
    code: '123456',
  }), true)

  assert.equal(environmentReads, 1)
  assert.equal(factoryCalls, 1)
  assert.equal(messages.length, 1)

  assert.equal(await service.sendPasswordResetCodeEmail({
    to: 'reader@example.test',
    username: 'Reader',
    code: '654321',
  }), true)

  assert.equal(environmentReads, 1)
  assert.equal(factoryCalls, 1)
  assert.deepEqual(configs[0], {
    host: 'smtp.example.test',
    port: 465,
    secure: true,
    auth: {
      user: 'mailer@example.test',
      pass: mockCredential,
    },
  })
  assert.equal(messages.length, 2)
  assert.equal(messages[0].from, '"Note Prompt Test" <hello@example.test>')
})

test('missing or malformed SMTP configuration fails before a transport is created', async () => {
  const invalidEnvironments = [
    {},
    { ...validEnvironment, EMAIL_USER: '' },
    { ...validEnvironment, EMAIL_PASS: '' },
    { ...validEnvironment, EMAIL_PORT: 'not-a-port' },
    { ...validEnvironment, EMAIL_PORT: '70000' },
    { ...validEnvironment, EMAIL_SECURE: 'sometimes' },
  ]

  for (const environment of invalidEnvironments) {
    let factoryCalls = 0
    const service = new EmailService(
      () => environment,
      () => {
        factoryCalls += 1
        throw new Error('invalid configuration reached the transport factory')
      },
    )

    await assert.rejects(
      service.sendVerificationEmail({
        to: 'reader@example.test',
        username: 'Reader',
        code: '123456',
      }),
      /邮件发送失败，请稍后重试/,
    )
    assert.equal(factoryCalls, 0)
  }
})

test('transport errors are reduced to a stable public category', async () => {
  const service = new EmailService(
    () => validEnvironment,
    () => ({
      async sendMail() {
        throw new Error('provider host and account details must not escape')
      },
    }),
  )

  await assert.rejects(
    service.sendVerificationEmail({
      to: 'reader@example.test',
      username: 'Reader',
      code: '123456',
    }),
    error => {
      assert.equal(error.message, '邮件发送失败，请稍后重试')
      assert.doesNotMatch(error.message, /provider|host|account/i)
      return true
    },
  )
})

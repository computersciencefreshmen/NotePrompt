import test from 'node:test'
import assert from 'node:assert/strict'
import nodemailer from 'nodemailer'

test('updated mail transport formats verification mail without an SMTP connection', async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
  const result = await transport.sendMail({
    from: 'NotePrompt <sender@example.org>',
    to: 'recipient@example.net',
    subject: 'Verify your email',
    text: 'Your verification code is 123456.',
    html: '<p>Your verification code is <strong>123456</strong>.</p>',
  })
  const message = result.message.toString('utf8')
  assert.match(message, /Subject: Verify your email/)
  assert.match(message, /multipart\/alternative/)
  assert.match(message, /123456/)
  assert.deepEqual(result.envelope.to, ['recipient@example.net'])
})

import assert from 'node:assert/strict'
import test from 'node:test'

import { AttachmentParseAdmissionError } from '../src/lib/attachment-parse-scheduler.ts'
import {
  AttachmentParseClientAbortedError,
  AttachmentParseDeadlineError,
  parseAttachmentRequest,
} from '../src/lib/attachment-parse-service.ts'
import { RequestPolicyError } from '../src/lib/ai-runtime-policy.ts'

const inlineScheduler = {
  async run(_accountId, work) {
    return work()
  },
}

test('the attachment service parses a valid bounded multipart request after admission', async () => {
  const formData = new FormData()
  formData.append('files', new File(['hello'], 'note.txt', { type: 'text/plain' }))
  const request = new Request('http://localhost/api/v1/attachments/parse', {
    method: 'POST',
    body: formData,
  })
  let parsedFiles = 0

  const result = await parseAttachmentRequest(request, 42, {
    scheduler: inlineScheduler,
    parseFile: async file => {
      parsedFiles += 1
      return {
        id: 'parsed-1',
        name: file.name,
        type: file.type,
        size: file.size,
        textPreview: await file.text(),
        parseStatus: 'parsed',
      }
    },
  })

  assert.equal(parsedFiles, 1)
  assert.equal(result[0].name, 'note.txt')
  assert.equal(result[0].textPreview, 'hello')
})

test('admission failure occurs before request work or file parsing starts', async () => {
  const formData = new FormData()
  formData.append('files', new File(['hello'], 'note.txt', { type: 'text/plain' }))
  const request = new Request('http://localhost/api/v1/attachments/parse', {
    method: 'POST',
    body: formData,
  })
  let workStarted = false
  let parserCalls = 0
  const rejectingScheduler = {
    async run() {
      throw new AttachmentParseAdmissionError('global', 'capacity')
    },
  }

  await assert.rejects(
    parseAttachmentRequest(request, 42, {
      scheduler: rejectingScheduler,
      parseFile: async () => {
        parserCalls += 1
        return null
      },
    }),
    error => {
      workStarted = parserCalls > 0
      return error instanceof AttachmentParseAdmissionError && error.scope === 'global'
    },
  )
  assert.equal(workStarted, false)
  assert.equal(parserCalls, 0)
})

test('malformed multipart input is a stable client error', async () => {
  const request = new Request('http://localhost/api/v1/attachments/parse', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=broken' },
    body: 'not-a-valid-multipart-body',
  })

  await assert.rejects(
    parseAttachmentRequest(request, 42, { scheduler: inlineScheduler }),
    error => error instanceof RequestPolicyError
      && error.status === 400
      && error.message === 'multipart/form-data 请求格式无效',
  )
})

test('a pre-aborted request never reaches the attachment parser', async () => {
  const controller = new AbortController()
  controller.abort()
  const formData = new FormData()
  formData.append('files', new File(['hello'], 'note.txt', { type: 'text/plain' }))
  const request = new Request('http://localhost/api/v1/attachments/parse', {
    method: 'POST',
    body: formData,
    signal: controller.signal,
  })
  let parserCalls = 0

  await assert.rejects(
    parseAttachmentRequest(request, 42, {
      scheduler: inlineScheduler,
      parseFile: async () => {
        parserCalls += 1
        return null
      },
    }),
    AttachmentParseClientAbortedError,
  )
  assert.equal(parserCalls, 0)
})

test('the hard deadline waits for parser cancellation before releasing admission', async () => {
  const formData = new FormData()
  formData.append('files', new File(['hello'], 'note.txt', { type: 'text/plain' }))
  const request = new Request('http://localhost/api/v1/attachments/parse', {
    method: 'POST',
    body: formData,
  })
  let abortObserved = false
  let parserStopped = false

  const parsing = parseAttachmentRequest(request, 42, {
    scheduler: inlineScheduler,
    deadlineMs: 100,
    parseFile: async (_file, options) => new Promise((_resolve, reject) => {
      const keepAlive = setInterval(() => undefined, 10)
      const signal = options?.signal
      assert.ok(signal)
      signal.addEventListener('abort', () => {
        abortObserved = true
        clearInterval(keepAlive)
        setTimeout(() => {
          parserStopped = true
          reject(new Error('parser stopped'))
        }, 20)
      }, { once: true })
    }),
  })

  await assert.rejects(parsing, AttachmentParseDeadlineError)
  assert.equal(abortObserved, true)
  assert.equal(parserStopped, true)
})

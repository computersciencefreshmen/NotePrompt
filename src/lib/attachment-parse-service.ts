import {
  parseAttachmentFile,
  type AttachmentParseOptions,
} from './attachment-parser.ts'
import {
  MAX_AI_ATTACHMENTS,
  MAX_AI_ATTACHMENT_FILE_BYTES,
  MAX_AI_ATTACHMENT_FILES_TOTAL_BYTES,
  MAX_ATTACHMENT_UPLOAD_BODY_BYTES,
  readLimitedBody,
  RequestPolicyError,
} from './ai-runtime-policy.ts'
import { attachmentParseScheduler } from './attachment-parse-scheduler.ts'

export const ATTACHMENT_PARSE_REQUEST_TIMEOUT_MS = 80_000

export class AttachmentParseClientAbortedError extends Error {
  constructor() {
    super('Attachment parse request aborted')
    this.name = 'AttachmentParseClientAbortedError'
  }
}

export class AttachmentParseDeadlineError extends Error {
  constructor() {
    super('Attachment parse request deadline exceeded')
    this.name = 'AttachmentParseDeadlineError'
  }
}

type AttachmentParseResult = Awaited<ReturnType<typeof parseAttachmentFile>>
type AttachmentParseFunction = (
  file: File,
  options?: AttachmentParseOptions,
) => Promise<AttachmentParseResult>

type AttachmentParseSchedulerLike = {
  run<T>(accountId: number, work: () => Promise<T>, signal?: AbortSignal): Promise<T>
}

type AttachmentParseServiceOptions = {
  parseFile?: AttachmentParseFunction
  scheduler?: AttachmentParseSchedulerLike
  deadlineMs?: number
}

type CancellationSource = 'client' | 'deadline'

function throwIfOperationCancelled(
  signal: AbortSignal,
  deadlineAt: number,
  onDeadline: () => void,
) {
  if (!signal.aborted && Date.now() >= deadlineAt) onDeadline()
  if (signal.aborted) throw new Error('Attachment parse operation cancelled')
}

function validateDeadlineMs(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError('deadlineMs must be a positive safe integer')
  }
}

function validateFiles(files: File[]) {
  if (files.length === 0) {
    throw new RequestPolicyError('请选择需要解析的附件', 400)
  }
  if (files.length > MAX_AI_ATTACHMENTS) {
    throw new RequestPolicyError(`一次最多解析 ${MAX_AI_ATTACHMENTS} 个附件`, 413)
  }

  const oversizedFile = files.find(file => file.size > MAX_AI_ATTACHMENT_FILE_BYTES)
  if (oversizedFile) {
    throw new RequestPolicyError(`${oversizedFile.name} 超过 5MB，暂不支持解析。`, 413)
  }
  const totalFileBytes = files.reduce((total, file) => total + file.size, 0)
  if (totalFileBytes > MAX_AI_ATTACHMENT_FILES_TOTAL_BYTES) {
    throw new RequestPolicyError('附件总大小不能超过 15MB', 413)
  }
}

export async function parseAttachmentRequest(
  request: Request,
  accountId: number,
  options: AttachmentParseServiceOptions = {},
): Promise<AttachmentParseResult[]> {
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
    throw new RequestPolicyError('请求必须使用 multipart/form-data', 415)
  }

  const scheduler = options.scheduler ?? attachmentParseScheduler
  const parseFile = options.parseFile ?? parseAttachmentFile
  const deadlineMs = options.deadlineMs ?? ATTACHMENT_PARSE_REQUEST_TIMEOUT_MS
  validateDeadlineMs(deadlineMs)
  const deadlineAt = Date.now() + deadlineMs

  const operationController = new AbortController()
  let cancellationSource: CancellationSource | null = null
  const cancel = (source: CancellationSource) => {
    if (cancellationSource !== null) return
    cancellationSource = source
    operationController.abort()
  }
  const onClientAbort = () => cancel('client')
  request.signal.addEventListener('abort', onClientAbort, { once: true })
  if (request.signal.aborted) onClientAbort()

  const deadlineTimer = setTimeout(
    () => cancel('deadline'),
    Math.max(1, deadlineAt - Date.now()),
  )
  deadlineTimer.unref?.()
  const signal = operationController.signal

  try {
    const attachments = await scheduler.run(accountId, async () => {
      throwIfOperationCancelled(signal, deadlineAt, () => cancel('deadline'))
      const rawBody = await readLimitedBody(request, MAX_ATTACHMENT_UPLOAD_BODY_BYTES, { signal })
      throwIfOperationCancelled(signal, deadlineAt, () => cancel('deadline'))

      const boundedRequest = new Request(request.url, {
        method: 'POST',
        headers: { 'content-type': contentType },
        body: rawBody.buffer.slice(
          rawBody.byteOffset,
          rawBody.byteOffset + rawBody.byteLength,
        ) as ArrayBuffer,
        signal,
      })
      let formData: FormData
      try {
        formData = await boundedRequest.formData()
      } catch {
        throwIfOperationCancelled(signal, deadlineAt, () => cancel('deadline'))
        throw new RequestPolicyError('multipart/form-data 请求格式无效', 400)
      }
      throwIfOperationCancelled(signal, deadlineAt, () => cancel('deadline'))
      const files = formData
        .getAll('files')
        .filter((item): item is File => item instanceof File)
      validateFiles(files)

      const parsed: AttachmentParseResult[] = []
      for (const file of files) {
        throwIfOperationCancelled(signal, deadlineAt, () => cancel('deadline'))
        parsed.push(await parseFile(file, { signal, deadlineAt }))
        throwIfOperationCancelled(signal, deadlineAt, () => cancel('deadline'))
      }
      return parsed
    }, signal)
    throwIfOperationCancelled(signal, deadlineAt, () => cancel('deadline'))
    return attachments
  } catch (error) {
    if (cancellationSource === null && Date.now() >= deadlineAt) cancel('deadline')
    if (cancellationSource === 'client') throw new AttachmentParseClientAbortedError()
    if (cancellationSource === 'deadline') throw new AttachmentParseDeadlineError()
    throw error
  } finally {
    clearTimeout(deadlineTimer)
    request.signal.removeEventListener('abort', onClientAbort)
  }
}

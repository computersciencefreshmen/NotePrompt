import { parseAttachmentFile } from './attachment-parser.ts'
import {
  MAX_AI_ATTACHMENTS,
  MAX_AI_ATTACHMENT_FILE_BYTES,
  MAX_AI_ATTACHMENT_FILES_TOTAL_BYTES,
  MAX_ATTACHMENT_UPLOAD_BODY_BYTES,
  readLimitedBody,
  RequestPolicyError,
} from './ai-runtime-policy.ts'
import { attachmentParseScheduler } from './attachment-parse-scheduler.ts'

export class AttachmentParseClientAbortedError extends Error {
  constructor() {
    super('Attachment parse request aborted')
    this.name = 'AttachmentParseClientAbortedError'
  }
}

type AttachmentParseResult = Awaited<ReturnType<typeof parseAttachmentFile>>

type AttachmentParseSchedulerLike = {
  run<T>(accountId: number, work: () => Promise<T>, signal?: AbortSignal): Promise<T>
}

type AttachmentParseServiceOptions = {
  parseFile?: typeof parseAttachmentFile
  scheduler?: AttachmentParseSchedulerLike
}

function throwIfClientAborted(signal: AbortSignal) {
  if (signal.aborted) throw new AttachmentParseClientAbortedError()
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
  const signal = request.signal

  try {
    const attachments = await scheduler.run(accountId, async () => {
      throwIfClientAborted(signal)
      const rawBody = await readLimitedBody(request, MAX_ATTACHMENT_UPLOAD_BODY_BYTES, { signal })
      throwIfClientAborted(signal)

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
        throwIfClientAborted(signal)
        throw new RequestPolicyError('multipart/form-data 请求格式无效', 400)
      }
      throwIfClientAborted(signal)
      const files = formData
        .getAll('files')
        .filter((item): item is File => item instanceof File)
      validateFiles(files)

      const parsed: AttachmentParseResult[] = []
      for (const file of files) {
        throwIfClientAborted(signal)
        // Batch A prevents dispatching another file after disconnect. Hard
        // cancellation of an in-flight parser belongs to the child/Worker layer.
        parsed.push(await parseFile(file))
        throwIfClientAborted(signal)
      }
      return parsed
    }, signal)
    throwIfClientAborted(signal)
    return attachments
  } catch (error) {
    if (signal.aborted) throw new AttachmentParseClientAbortedError()
    throw error
  }
}
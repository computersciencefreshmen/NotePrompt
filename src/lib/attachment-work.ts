// One multipart parse/OCR batch per Node process. Reject competing work before
// reading its body, rather than keeping large files in an unbounded queue.
let busy = false

export class AttachmentBusyError extends Error {
  constructor() {
    super('附件解析正在进行，请稍后重试。')
    this.name = 'AttachmentBusyError'
  }
}

export async function withAttachmentSlot<T>(work: () => Promise<T>): Promise<T> {
  if (busy) throw new AttachmentBusyError()
  busy = true
  try {
    return await work()
  } finally {
    busy = false
  }
}

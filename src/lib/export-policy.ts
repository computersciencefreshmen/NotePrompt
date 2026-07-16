export const MAX_EXPORT_RECORDS = 5_000
export const MAX_EXPORT_SOURCE_BYTES = 16 * 1024 * 1024
export const MAX_EXPORT_RESPONSE_BYTES = 20 * 1024 * 1024

export class ExportSizeError extends Error {
  readonly code = 'EXPORT_TOO_LARGE'
  readonly status = 413

  constructor(message = '账户数据量过大，无法通过在线接口导出，请联系管理员') {
    super(message)
    this.name = 'ExportSizeError'
  }
}

export function assertExportBudget(recordCount: number, sourceBytes: number): void {
  if (
    !Number.isSafeInteger(recordCount)
    || recordCount < 0
    || !Number.isSafeInteger(sourceBytes)
    || sourceBytes < 0
    || recordCount > MAX_EXPORT_RECORDS
    || sourceBytes > MAX_EXPORT_SOURCE_BYTES
  ) {
    throw new ExportSizeError()
  }
}

export function measureJsonUtf8Bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

export function assertExportResponseSize(value: unknown): void {
  if (measureJsonUtf8Bytes(value) > MAX_EXPORT_RESPONSE_BYTES) {
    throw new ExportSizeError()
  }
}

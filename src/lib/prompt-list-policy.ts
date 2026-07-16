export const PROMPT_LIST_PREVIEW_CHARS = 2_000
export const PROMPT_LIST_DESCRIPTION_CHARS = 500
export const FOLDER_PROMPT_PAGE_SIZE = 20
export const MAX_FOLDER_PROMPT_PAGE_SIZE = 50
export const MAX_FOLDER_PROMPT_CONTENT_CHARS = 100_000

export function contentWasTruncated(length: unknown, limit = PROMPT_LIST_PREVIEW_CHARS) {
  const parsed = Number(length)
  return Number.isFinite(parsed) && parsed > limit
}

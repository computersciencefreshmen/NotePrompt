export const DEFAULT_QUERY_WINDOW = 10_000

export interface PaginationPolicy {
  defaultLimit: number
  maxLimit: number
  maxWindow?: number
}

export interface ParsedPagination {
  page: number
  limit: number
  offset: number
}

export type PaginationParseResult =
  | { ok: true; value: ParsedPagination }
  | { ok: false; error: string }

export interface PaginationMetadata extends ParsedPagination {
  total: number
  totalPages: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}

function parseStrictPositiveInteger(value: string | null, fallback: number): number | null {
  if (value == null) return fallback
  if (!/^[1-9]\d*$/.test(value)) return null

  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function parseBoundedPagination(
  searchParams: Pick<URLSearchParams, 'get'>,
  policy: PaginationPolicy,
): PaginationParseResult {
  const maxWindow = policy.maxWindow ?? DEFAULT_QUERY_WINDOW
  const page = parseStrictPositiveInteger(searchParams.get('page'), 1)
  const limit = parseStrictPositiveInteger(searchParams.get('limit'), policy.defaultLimit)

  if (page == null) {
    return { ok: false, error: 'page 必须是正整数' }
  }
  if (limit == null) {
    return { ok: false, error: 'limit 必须是正整数' }
  }
  if (limit > policy.maxLimit) {
    return { ok: false, error: `limit 不能超过 ${policy.maxLimit}` }
  }

  const offset = (page - 1) * limit
  if (!Number.isSafeInteger(offset) || offset + limit > maxWindow) {
    return { ok: false, error: `分页查询窗口不能超过 ${maxWindow} 条记录` }
  }

  return { ok: true, value: { page, limit, offset } }
}

export function readBoundedSearchParam(
  searchParams: Pick<URLSearchParams, 'get'>,
  maxChars = 200,
): { ok: true; value: string } | { ok: false; error: string } {
  return readBoundedQueryParam(searchParams, 'search', maxChars)
}

export function readBoundedQueryParam(
  searchParams: Pick<URLSearchParams, 'get'>,
  name: string,
  maxChars: number,
): { ok: true; value: string } | { ok: false; error: string } {
  const raw = searchParams.get(name)
  if (raw == null) return { ok: true, value: '' }
  if (raw.length > maxChars) {
    return { ok: false, error: `${name} 不能超过 ${maxChars} 个字符` }
  }
  return { ok: true, value: raw.trim() }
}

export function createPaginationMetadata(
  totalValue: number | string | null | undefined,
  pagination: ParsedPagination,
): PaginationMetadata {
  const parsedTotal = Number(totalValue)
  const total = Number.isFinite(parsedTotal) && parsedTotal > 0 ? Math.floor(parsedTotal) : 0
  const totalPages = Math.ceil(total / pagination.limit)

  return {
    ...pagination,
    total,
    totalPages,
    hasPreviousPage: pagination.page > 1,
    hasNextPage: pagination.page < totalPages,
  }
}

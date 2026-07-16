const RETRYABLE_READ_KEYWORDS = new Set(['SELECT', 'SHOW', 'DESCRIBE', 'DESC'])
const UNSAFE_SELECT_PATTERN = /(?:\bFOR\s+(?:UPDATE|SHARE)\b|\bGET_LOCK\s*\(|\bRELEASE_LOCK\s*\(|\bINTO\s+(?:OUTFILE|DUMPFILE)\b)/i

function stripLeadingSqlTrivia(sql: string) {
  let remaining = sql
  while (remaining.length > 0) {
    const trimmed = remaining.trimStart()
    if (trimmed.startsWith('--') || trimmed.startsWith('#')) {
      const newline = trimmed.indexOf('\n')
      if (newline < 0) return ''
      remaining = trimmed.slice(newline + 1)
      continue
    }
    if (trimmed.startsWith('/*')) {
      const end = trimmed.indexOf('*/', 2)
      if (end < 0) return ''
      remaining = trimmed.slice(end + 2)
      continue
    }
    return trimmed
  }
  return ''
}

export function isRetryableMySQLRead(sql: string) {
  const statement = stripLeadingSqlTrivia(sql)
  const keyword = statement.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase()
  if (!keyword) return false

  if (keyword === 'EXPLAIN') {
    return !/\bANALYZE\b/i.test(statement) && /\bSELECT\b/i.test(statement)
  }
  if (!RETRYABLE_READ_KEYWORDS.has(keyword)) return false
  if (keyword === 'SELECT' && UNSAFE_SELECT_PATTERN.test(statement)) return false
  return true
}

export function mysqlQueryAttemptLimit(sql: string) {
  return isRetryableMySQLRead(sql) ? 3 : 1
}

export function mysqlErrorMetadata(error: unknown) {
  const candidate = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : {}
  const code = typeof candidate.code === 'string' ? candidate.code.slice(0, 64) : 'UNKNOWN'
  const errno = typeof candidate.errno === 'number' && Number.isSafeInteger(candidate.errno)
    ? candidate.errno
    : undefined
  const sqlState = typeof candidate.sqlState === 'string'
    ? candidate.sqlState.slice(0, 16)
    : undefined

  return { code, errno, sqlState }
}

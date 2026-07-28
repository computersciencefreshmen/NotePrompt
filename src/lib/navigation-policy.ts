const DEFAULT_INTERNAL_RETURN_PATH = '/prompts'
const INTERNAL_NAVIGATION_ORIGIN = 'https://noteprompt.invalid'
const MAX_INTERNAL_RETURN_PATH_LENGTH = 2_048
const MAX_DECODE_PASSES = 4

const CONTROL_OR_DIRECTIONAL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/
const MALFORMED_PERCENT_ESCAPE = /%(?![0-9A-Fa-f]{2})/
const ENCODED_PATH_SEPARATOR = /%(?:25)*(?:2f|5c)/i
const ENCODED_ASCII_CONTROL = /%(?:25)*(?:0[0-9a-f]|1[0-9a-f]|7f)/i
const ENCODED_C1_CONTROL = /%(?:25)*c2%(?:25)*[89][0-9a-f]/i
const ENCODED_UNICODE_CONTROL = /%(?:25)*e2%(?:25)*(?:80%(?:25)*a[89a-e]|81%(?:25)*a[6-9])/i

function hasUnsafeEncodedPath(rawPath: string) {
  if (
    MALFORMED_PERCENT_ESCAPE.test(rawPath)
    || ENCODED_PATH_SEPARATOR.test(rawPath)
    || ENCODED_ASCII_CONTROL.test(rawPath)
    || ENCODED_C1_CONTROL.test(rawPath)
    || ENCODED_UNICODE_CONTROL.test(rawPath)
  ) return true

  let decodedPath = rawPath
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    let nextPath: string
    try {
      nextPath = decodeURIComponent(decodedPath)
    } catch {
      return true
    }

    if (
      CONTROL_OR_DIRECTIONAL_CHARACTERS.test(nextPath)
      || nextPath.includes('\\')
      || ENCODED_PATH_SEPARATOR.test(nextPath)
      || ENCODED_ASCII_CONTROL.test(nextPath)
      || ENCODED_C1_CONTROL.test(nextPath)
      || ENCODED_UNICODE_CONTROL.test(nextPath)
    ) return true

    if (nextPath === decodedPath) return false
    decodedPath = nextPath
  }

  // Deep recursive encoding has no valid navigation use in NotePrompt. Failing
  // closed avoids a future decoder turning a reviewed path into a separator.
  return /%[0-9A-Fa-f]{2}/.test(decodedPath)
}

/**
 * Accepts only a normalized, same-origin application path for client-side
 * navigation. Invalid or ambiguous values collapse to one fixed safe route.
 */
export function normalizeInternalReturnPath(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_INTERNAL_RETURN_PATH
  if (
    value.length === 0
    || value.length > MAX_INTERNAL_RETURN_PATH_LENGTH
    || value.trim() !== value
    || value[0] !== '/'
    || value[1] === '/'
    || value.includes('\\')
    || CONTROL_OR_DIRECTIONAL_CHARACTERS.test(value)
    || ENCODED_ASCII_CONTROL.test(value)
    || ENCODED_C1_CONTROL.test(value)
    || ENCODED_UNICODE_CONTROL.test(value)
  ) return DEFAULT_INTERNAL_RETURN_PATH

  const pathEnd = value.search(/[?#]/)
  const rawPath = pathEnd === -1 ? value : value.slice(0, pathEnd)
  if (hasUnsafeEncodedPath(rawPath)) return DEFAULT_INTERNAL_RETURN_PATH

  try {
    const parsed = new URL(value, INTERNAL_NAVIGATION_ORIGIN)
    const normalizedPath = parsed.pathname
    if (
      parsed.origin !== INTERNAL_NAVIGATION_ORIGIN
      || normalizedPath[0] !== '/'
      || normalizedPath[1] === '/'
      || normalizedPath.includes('\\')
      || CONTROL_OR_DIRECTIONAL_CHARACTERS.test(normalizedPath)
    ) return DEFAULT_INTERNAL_RETURN_PATH

    return `${normalizedPath}${parsed.search}${parsed.hash}`
  } catch {
    return DEFAULT_INTERNAL_RETURN_PATH
  }
}

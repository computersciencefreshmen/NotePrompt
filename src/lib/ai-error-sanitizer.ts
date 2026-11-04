export function sanitizeAIProviderError(errorText: string): string {
  return errorText
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [redacted]')
    .replace(/(?:sk|ak|rk|pk)-[A-Za-z0-9_\-]{8,}/g, '[redacted-key]')
    .replace(/\borg-[A-Za-z0-9_\-]{8,}\b/g, '[redacted-org]')
    .replace(/"api[_-]?key"\s*:\s*"[^"]+"/gi, '"api_key":"[redacted]"')
}
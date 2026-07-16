export function sanitizeAIProviderError(errorText: string): string {
  return errorText
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [redacted]')
    .replace(/(?:sk|ak|rk|pk)-[A-Za-z0-9_\-]{8,}/g, '[redacted-key]')
    .replace(/\borg-[A-Za-z0-9_\-]{8,}\b/g, '[redacted-org]')
    .replace(/"api[_-]?key"\s*:\s*"[^"]+"/gi, '"api_key":"[redacted]"')
}

// 面向最终用户的错误必须来自固定分类，不能直接回显供应商响应、内部 URL 或运行时异常。
export function formatSafeAIError(error: unknown): string {
  const message = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : ''
  const normalized = message.toLowerCase()

  if (/abort|timeout|timed out|超时/.test(normalized)) {
    return 'AI 服务响应超时，请稍后重试'
  }
  if (/model not exist|model.*not found|模型.*(?:不可用|不存在)|unsupported model/.test(normalized)) {
    return '所选 AI 模型不可用，请更换模型'
  }
  if (/authentication|unauthori[sz]ed|forbidden|api.?key|密钥|\b40[13]\b/.test(normalized)) {
    return 'AI 服务认证失败，请检查模型供应商配置'
  }
  if (/quota|balance|billing|insufficient|额度|余额|\b402\b/.test(normalized)) {
    return 'AI 服务额度不足，请检查模型供应商账户'
  }
  if (/rate.?limit|too many requests|请求过于频繁|\b429\b/.test(normalized)) {
    return 'AI 服务请求过于频繁，请稍后重试'
  }
  if (/failed to fetch|fetch failed|econn|enotfound|无法连接|connection|\b50[23]\b/.test(normalized)) {
    return 'AI 服务暂时不可用，请稍后重试'
  }
  if (/invalid_request|invalid request|参数错误|bad request|\b400\b/.test(normalized)) {
    return 'AI 服务拒绝了请求参数，请调整后重试'
  }

  return 'AI 服务请求失败，请稍后重试'
}

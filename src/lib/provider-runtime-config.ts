export type ProviderRuntimeConfig = {
  apiKey?: string
  baseURL?: string
}

export function getProviderRuntimeConfig(_provider: string, defaults: ProviderRuntimeConfig): Required<ProviderRuntimeConfig> {
  return {
    apiKey: (defaults.apiKey || '').trim(),
    baseURL: (defaults.baseURL || '').trim(),
  }
}

export function maskSecret(value?: string) {
  if (!value) return ''
  if (value.length <= 10) return '********'
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

export type ProviderRuntimeConfig = {
  apiKey?: string
  baseURL?: string
}

export type ProviderRuntimeConfigMap = Record<string, ProviderRuntimeConfig>

const CONFIG_FILE_NAME = '.provider-config.local.json'

export function getProviderConfigPath() {
  return path.resolve(process.cwd(), CONFIG_FILE_NAME)
}

export function readProviderConfig(): ProviderRuntimeConfigMap {
  const filePath = getProviderConfigPath()
  if (!existsSync(filePath)) return {}

  try {
    const rawConfig = JSON.parse(readFileSync(filePath, 'utf8')) as ProviderRuntimeConfigMap
    return Object.fromEntries(
      Object.entries(rawConfig).map(([provider, config]) => [
        provider,
        {
          apiKey: typeof config.apiKey === 'string' ? config.apiKey : undefined,
          baseURL: typeof config.baseURL === 'string' ? config.baseURL : undefined,
        },
      ])
    )
  } catch {
    return {}
  }
}

export function writeProviderConfig(config: ProviderRuntimeConfigMap) {
  writeFileSync(getProviderConfigPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

export function getProviderRuntimeConfig(provider: string, defaults: ProviderRuntimeConfig): Required<ProviderRuntimeConfig> {
  const localConfig = readProviderConfig()[provider] || {}

  return {
    apiKey: (localConfig.apiKey || defaults.apiKey || '').trim(),
    baseURL: (localConfig.baseURL || defaults.baseURL || '').trim(),
  }
}

export function maskSecret(value?: string) {
  if (!value) return ''
  if (value.length <= 10) return '********'
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}
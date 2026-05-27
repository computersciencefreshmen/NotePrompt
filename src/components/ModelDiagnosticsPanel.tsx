'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Activity, AlertTriangle, CheckCircle2, Loader2, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { auth } from '@/lib/api'
import { Locale, withLocaleHref } from '@/lib/i18n'

type DiagnosticProvider = {
  provider: string
  name: string
  model: string
  keyConfigured: boolean
  callable: boolean
  status: 'ready' | 'configured' | 'missing-key' | 'missing-base-url' | 'rate-limited' | 'billing' | 'error'
  message: string
  latencyMs: number | null
  cached?: boolean
}

const diagnosticsCopy = {
  zh: {
    statusLabel: {
      ready: '可用',
      configured: '配置就绪',
      'missing-key': '缺少 Key',
      'missing-base-url': '缺少地址',
      'rate-limited': '限流',
      billing: '余额/配额',
      error: '异常',
    } as Record<DiagnosticProvider['status'], string>,
    failed: '模型检测失败',
    title: '模型可用性检测',
    description: '不会自动检测。需要确认模型状态时，手动刷新配置；实际调用探针会消耗极少额度。',
    checking: '检测中',
    configCheck: '配置检查',
    probe: '低成本调用测试',
    probeConfirm: '这会发起一次真实模型调用来测试 Key，可能消耗少量额度。确定继续吗？',
    config: '配置',
    keyConfigured: '已配置',
    keyMissing: '未配置',
    cached: '缓存',
    checkedAt: '最近检测',
    probeMode: '实际调用探针',
  },
  en: {
    statusLabel: {
      ready: 'Ready',
      configured: 'Configured',
      'missing-key': 'Missing key',
      'missing-base-url': 'Missing URL',
      'rate-limited': 'Rate limited',
      billing: 'Quota/Billing',
      error: 'Error',
    } as Record<DiagnosticProvider['status'], string>,
    failed: 'Model diagnostics failed',
    title: 'Model diagnostics',
    description: 'No checks run automatically. Refresh configuration when needed; the probe makes a tiny paid model call.',
    checking: 'Checking',
    configCheck: 'Config check',
    probe: 'Low-cost probe',
    probeConfirm: 'This will make a real model call to test the key and may consume a tiny amount of quota. Continue?',
    config: 'Configure',
    keyConfigured: 'configured',
    keyMissing: 'missing',
    cached: 'cached',
    checkedAt: 'Last checked',
    probeMode: 'probe call',
  },
}

const englishProviderNames: Record<string, string> = {
  zhipu: 'Zhipu GLM',
  xiaomi: 'Xiaomi MiMo',
}

const englishMessages: Record<string, string> = {
  '配置已就绪，未发起真实模型调用': 'Configuration is ready. No real model call was made.',
  '配置不可用': 'Configuration is unavailable.',
  '低成本探针调用成功': 'Low-cost probe succeeded.',
  '检测失败': 'Diagnostics failed.',
}

function localizedProviderName(provider: DiagnosticProvider, locale: Locale) {
  if (locale !== 'en') return provider.name
  return englishProviderNames[provider.provider] || provider.name
}

function localizedDiagnosticMessage(message: string, locale: Locale) {
  if (locale !== 'en') return message
  const missingKeyMatch = message.match(/^未配置(.+)的API密钥/)
  if (missingKeyMatch) return `${missingKeyMatch[1]} API key is not configured. Set ${missingKeyMatch[1].toUpperCase()}_API_KEY in the environment.`
  const missingBaseUrlMatch = message.match(/^未配置(.+)的API地址/)
  if (missingBaseUrlMatch) return `${missingBaseUrlMatch[1]} API base URL is not configured.`
  return englishMessages[message] || message
}

function statusClass(status: DiagnosticProvider['status']) {
  if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
  if (status === 'configured') return 'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-200'
  if (status === 'rate-limited' || status === 'billing') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
  return 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300'
}

export function ModelDiagnosticsPanel({ locale = 'zh' }: { locale?: Locale }) {
  const copy = diagnosticsCopy[locale]
  const [providers, setProviders] = useState<DiagnosticProvider[]>([])
  const [checkedAt, setCheckedAt] = useState('')
  const [durationMs, setDurationMs] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'config' | 'probe'>('config')

  const runDiagnostics = async (nextMode: 'config' | 'probe', force = false) => {
    if (nextMode === 'probe' && !window.confirm(copy.probeConfirm)) return
    setRunning(true)
    setError('')
    try {
      const response = await fetch('/api/v1/ai/diagnostics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth.getToken() ? { Authorization: `Bearer ${auth.getToken()}` } : {}),
        },
        body: JSON.stringify({ mode: nextMode, force, confirmed: nextMode === 'probe' }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setError(payload.error || copy.failed)
        return
      }
      setProviders(payload.data.providers)
      setCheckedAt(payload.data.checkedAt)
      setDurationMs(payload.data.durationMs)
      setMode(payload.data.mode || nextMode)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : copy.failed)
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="rounded-[8px] border border-[#ded6c8] bg-[#fbfaf7] p-4 dark:border-[#3a342c] dark:bg-[#171410]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-teal-700 dark:text-teal-300" />
          <div>
            <h2 className="text-sm font-semibold text-gray-950 dark:text-gray-50">{copy.title}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{copy.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => runDiagnostics('config')} disabled={running} className="rounded-[8px]">
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
            {running ? copy.checking : copy.configCheck}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => runDiagnostics('probe')} disabled={running} className="rounded-[8px]">
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
            {copy.probe}
          </Button>
          <Button type="button" variant="outline" size="sm" asChild className="rounded-[8px]">
            <Link href={withLocaleHref('/settings/providers', locale)}><Settings className="mr-2 h-4 w-4" />{copy.config}</Link>
          </Button>
        </div>
      </div>

      {error && <p className="mb-3 rounded-[6px] bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
      {providers.length === 0 && !error && (
        <p className="rounded-[6px] bg-white/70 px-3 py-2 text-xs text-gray-500 dark:bg-black/20 dark:text-gray-400">
          {locale === 'en' ? 'Click config check only when you need to refresh provider status.' : '需要时点击配置检查刷新模型状态。'}
        </p>
      )}
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {providers.map(provider => (
          <div key={provider.provider} className={`rounded-[8px] border px-3 py-2 ${statusClass(provider.status)}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{localizedProviderName(provider, locale)}</p>
                <p className="truncate text-xs opacity-75">{provider.model}</p>
              </div>
              {provider.status === 'ready' || provider.status === 'configured' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            </div>
            <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
              <span className="rounded bg-white/60 px-1.5 py-0.5 dark:bg-black/20">{copy.statusLabel[provider.status]}</span>
              <span className="rounded bg-white/60 px-1.5 py-0.5 dark:bg-black/20">Key {provider.keyConfigured ? copy.keyConfigured : copy.keyMissing}</span>
              {provider.latencyMs !== null && <span className="rounded bg-white/60 px-1.5 py-0.5 dark:bg-black/20">{provider.latencyMs}ms</span>}
              {provider.cached && <span className="rounded bg-white/60 px-1.5 py-0.5 dark:bg-black/20">{copy.cached}</span>}
            </div>
            <p className="mt-2 line-clamp-2 text-xs opacity-80">{localizedDiagnosticMessage(provider.message, locale)}</p>
          </div>
        ))}
      </div>
      {checkedAt && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {copy.checkedAt}: {new Date(checkedAt).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false })}{durationMs !== null ? ` · ${durationMs}ms` : ''} · {mode === 'probe' ? copy.probeMode : copy.configCheck}
        </p>
      )}
    </section>
  )
}
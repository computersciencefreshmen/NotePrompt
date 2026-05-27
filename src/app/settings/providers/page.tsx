'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { auth } from '@/lib/api'
import { detectLocaleFromSearch, Locale, withLocaleHref } from '@/lib/i18n'

type ProviderConfigRow = {
  provider: string
  name: string
  keyConfigured: boolean
  keyPreview: string
  baseURL: string
  defaultBaseURL: string
  modelCount: number
  updatedAt: string | null
}

type ProviderFormState = Record<string, { apiKey: string; baseURL: string }>

const copy = {
  zh: {
    back: '返回优化器',
    title: '个人模型 API Keys',
    subtitle: '这里保存的是你账号自己的供应商 Key。只会用于你的 AI 请求，不会覆盖平台 Key，也不会被其他用户消耗。',
    refresh: '刷新',
    save: '保存',
    remove: '移除',
    models: '个模型',
    currentKey: '当前 Key',
    notConfigured: '未配置',
    keyPlaceholder: '输入或替换你的 API Key',
    baseURLPlaceholder: '留空使用平台默认地址',
    saved: '个人 API Key 已保存。之后你选择该供应商时，会优先使用你自己的 Key。',
    removed: '个人 API Key 已移除。之后会回到平台默认配置。',
    loadFailed: '读取个人模型配置失败',
    saveFailed: '保存失败',
    removeFailed: '删除失败',
    loginRequired: '请先登录后配置个人 API Keys。',
    defaultBaseURL: '默认地址',
  },
  en: {
    back: 'Back to Optimizer',
    title: 'Personal Model API Keys',
    subtitle: 'These keys belong only to your account. They are used only for your AI requests and never replace the platform key for other users.',
    refresh: 'Refresh',
    save: 'Save',
    remove: 'Remove',
    models: 'models',
    currentKey: 'Current key',
    notConfigured: 'Not configured',
    keyPlaceholder: 'Enter or replace your API key',
    baseURLPlaceholder: 'Leave empty to use the platform default URL',
    saved: 'Personal API key saved. This provider will use your key first on future requests.',
    removed: 'Personal API key removed. Future requests will use the platform default configuration.',
    loadFailed: 'Could not load personal model settings',
    saveFailed: 'Save failed',
    removeFailed: 'Remove failed',
    loginRequired: 'Log in before configuring personal API keys.',
    defaultBaseURL: 'Default URL',
  },
} satisfies Record<Locale, Record<string, string>>

export default function ProviderSettingsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [locale, setLocale] = useState<Locale>('zh')
  const text = copy[locale]
  const [providers, setProviders] = useState<ProviderConfigRow[]>([])
  const [formState, setFormState] = useState<ProviderFormState>({})
  const [loading, setLoading] = useState(true)
  const [savingProvider, setSavingProvider] = useState('')
  const [removingProvider, setRemovingProvider] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const authHeaders = (): Record<string, string> => {
    const token = auth.getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const applyRows = (rows: ProviderConfigRow[]) => {
    setProviders(rows)
    setFormState(Object.fromEntries(rows.map(row => [row.provider, { apiKey: '', baseURL: row.baseURL || '' }])))
  }

  const loadProviders = async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/v1/user/provider-config', { headers: authHeaders() })
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setError(payload.error || text.loadFailed)
        return
      }
      applyRows(payload.data.providers as ProviderConfigRow[])
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : text.loadFailed)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLocale(detectLocaleFromSearch())
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push(withLocaleHref('/login', locale))
      return
    }
    loadProviders()
  }, [authLoading, user, locale])

  const saveProvider = async (provider: string) => {
    setSavingProvider(provider)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/v1/user/provider-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ provider, ...formState[provider] }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setError(payload.error || text.saveFailed)
        return
      }
      applyRows(payload.data.providers as ProviderConfigRow[])
      setMessage(text.saved)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : text.saveFailed)
    } finally {
      setSavingProvider('')
    }
  }

  const removeProvider = async (provider: string) => {
    setRemovingProvider(provider)
    setMessage('')
    setError('')
    try {
      const response = await fetch(`/api/v1/user/provider-config?provider=${encodeURIComponent(provider)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setError(payload.error || text.removeFailed)
        return
      }
      applyRows(payload.data.providers as ProviderConfigRow[])
      setMessage(text.removed)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : text.removeFailed)
    } finally {
      setRemovingProvider('')
    }
  }

  if (!authLoading && !user) {
    return (
      <main className="min-h-screen bg-[#f7f3eb] px-4 py-8 text-gray-950 dark:bg-[#171410] dark:text-gray-50">
        <div className="mx-auto max-w-3xl rounded-[8px] border border-[#ded6c8] bg-[#fbfaf7] p-5 text-sm dark:border-[#3a342c] dark:bg-[#1d1a16]">
          {text.loginRequired}
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f7f3eb] px-4 py-8 text-gray-950 dark:bg-[#171410] dark:text-gray-50 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button variant="ghost" asChild className="mb-2 rounded-[8px] px-0">
              <Link href={withLocaleHref('/optimizer', locale)}><ArrowLeft className="mr-2 h-4 w-4" />{text.back}</Link>
            </Button>
            <h1 className="text-3xl font-semibold tracking-tight">{text.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">{text.subtitle}</p>
          </div>
          <Button type="button" variant="outline" onClick={loadProviders} disabled={loading} className="rounded-[8px]">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            {text.refresh}
          </Button>
        </div>

        {message && <p className="rounded-[8px] bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</p>}
        {error && <p className="rounded-[8px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

        <div className="grid gap-4">
          {providers.map(provider => (
            <Card key={provider.provider} className="rounded-[8px] border-[#ded6c8] bg-[#fbfaf7] dark:border-[#3a342c] dark:bg-[#1d1a16]">
              <CardContent className="grid gap-4 p-5 lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-end">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{provider.name}</h2>
                    {provider.keyConfigured && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{provider.provider} · {provider.modelCount} {text.models}</p>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{text.currentKey}: {provider.keyConfigured ? provider.keyPreview : text.notConfigured}</p>
                  <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{text.defaultBaseURL}: {provider.defaultBaseURL}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`${provider.provider}-key`}>API Key</Label>
                    <Input
                      id={`${provider.provider}-key`}
                      type="password"
                      value={formState[provider.provider]?.apiKey || ''}
                      placeholder={text.keyPlaceholder}
                      onChange={event => setFormState(current => ({ ...current, [provider.provider]: { ...current[provider.provider], apiKey: event.target.value } }))}
                      className="rounded-[8px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${provider.provider}-base-url`}>Base URL</Label>
                    <Input
                      id={`${provider.provider}-base-url`}
                      value={formState[provider.provider]?.baseURL || ''}
                      placeholder={text.baseURLPlaceholder}
                      onChange={event => setFormState(current => ({ ...current, [provider.provider]: { ...current[provider.provider], baseURL: event.target.value } }))}
                      className="rounded-[8px]"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button type="button" onClick={() => saveProvider(provider.provider)} disabled={savingProvider === provider.provider} className="rounded-[8px] bg-[#1f1a14] text-[#fffaf0] hover:bg-[#3b3329]">
                    {savingProvider === provider.provider ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {text.save}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => removeProvider(provider.provider)} disabled={!provider.keyConfigured || removingProvider === provider.provider} className="rounded-[8px]">
                    {removingProvider === provider.provider ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    {text.remove}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  )
}

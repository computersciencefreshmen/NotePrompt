'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'

type ProviderConfigRow = {
  provider: string
  name: string
  keyConfigured: boolean
  keyPreview: string
  baseURL: string
  modelCount: number
}

type ProviderFormState = Record<string, { apiKey: string; baseURL: string }>

export default function ProviderSettingsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [providers, setProviders] = useState<ProviderConfigRow[]>([])
  const [formState, setFormState] = useState<ProviderFormState>({})
  const [loading, setLoading] = useState(true)
  const [savingProvider, setSavingProvider] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const isAdmin = Boolean(user?.is_admin || user?.user_type === 'admin')

  const loadProviders = async () => {
    if (!isAdmin) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/v1/provider-config')
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setError(payload.error || '读取配置失败')
        return
      }

      const rows = payload.data.providers as ProviderConfigRow[]
      setProviders(rows)
      setFormState(Object.fromEntries(rows.map(row => [row.provider, { apiKey: '', baseURL: row.baseURL || '' }])))
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '读取配置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push('/login')
      return
    }
    if (!isAdmin) {
      setLoading(false)
      setError('只有管理员可以配置全局模型供应商 Key。普通用户不能覆盖平台 Key，也不会影响其他用户的 token 消耗。')
      return
    }
    loadProviders()
  }, [authLoading, user, isAdmin])

  const saveProvider = async (provider: string) => {
    if (!isAdmin) return
    setSavingProvider(provider)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/v1/provider-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, ...formState[provider] }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setError(payload.error || '保存失败')
        return
      }
      setMessage('配置已保存。该配置是管理员管理的全局模型供应商 Key，不是用户个人 Key。')
      await loadProviders()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '保存失败')
    } finally {
      setSavingProvider('')
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f3eb] px-4 py-8 text-gray-950 dark:bg-[#171410] dark:text-gray-50 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button variant="ghost" asChild className="mb-2 rounded-[8px] px-0">
              <Link href="/optimizer"><ArrowLeft className="mr-2 h-4 w-4" />返回优化器</Link>
            </Button>
            <h1 className="text-3xl font-semibold tracking-tight">模型供应商配置</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">仅管理员可配置全局模型供应商 Key。普通用户无法填写或覆盖这里的 Key，也不会把个人 Key 变成全站共享额度。</p>
          </div>
          <Button type="button" variant="outline" onClick={loadProviders} disabled={loading} className="rounded-[8px]">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            刷新
          </Button>
        </div>

        {message && <p className="rounded-[8px] bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</p>}
        {error && <p className="rounded-[8px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

        <div className="grid gap-4">
          {providers.map(provider => (
            <Card key={provider.provider} className="rounded-[8px] border-[#ded6c8] bg-[#fbfaf7] dark:border-[#3a342c] dark:bg-[#1d1a16]">
              <CardContent className="grid gap-4 p-5 lg:grid-cols-[220px_minmax(0,1fr)_140px] lg:items-end">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{provider.name}</h2>
                    {provider.keyConfigured && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{provider.provider} · {provider.modelCount} 个模型</p>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">当前 Key：{provider.keyConfigured ? provider.keyPreview : '未配置'}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`${provider.provider}-key`}>API Key</Label>
                    <Input
                      id={`${provider.provider}-key`}
                      type="password"
                      value={formState[provider.provider]?.apiKey || ''}
                      placeholder={provider.keyConfigured ? '留空保持当前 Key；输入新 Key 可替换' : '输入 API Key'}
                      onChange={event => setFormState(current => ({ ...current, [provider.provider]: { ...current[provider.provider], apiKey: event.target.value } }))}
                      className="rounded-[8px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${provider.provider}-base-url`}>Base URL</Label>
                    <Input
                      id={`${provider.provider}-base-url`}
                      value={formState[provider.provider]?.baseURL || ''}
                      placeholder="OpenAI-compatible base URL"
                      onChange={event => setFormState(current => ({ ...current, [provider.provider]: { ...current[provider.provider], baseURL: event.target.value } }))}
                      className="rounded-[8px]"
                    />
                  </div>
                </div>
                <Button type="button" onClick={() => saveProvider(provider.provider)} disabled={savingProvider === provider.provider} className="rounded-[8px] bg-[#1f1a14] text-[#fffaf0] hover:bg-[#3b3329]">
                  {savingProvider === provider.provider ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  保存
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  )
}
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

import PromptEditor from '@/components/PromptEditor'
import { Prompt } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export default function EditPromptPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const promptId = parseInt(params.id as string)
  const [returnPath, setReturnPath] = useState('/prompts')

  // 安全地获取URL参数
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search)
      setReturnPath(searchParams.get('return') || '/prompts')
    }
  }, [])

  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 检查登录状态
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
      return
    }
  }, [user, authLoading, router])

  // 获取提示词数据
  useEffect(() => {
    const fetchPrompt = async () => {
      if (!user || isNaN(promptId)) {
        setError('无效的提示词ID')
        setLoading(false)
        return
      }

      try {
        const response = await api.prompts.get(promptId)

        if (response.success && response.data) {
          setPrompt(response.data)
        } else {
          setError(response.error || '提示词不存在或无权访问')
        }
      } catch (err) {
        console.error('Failed to fetch prompt:', err)
        setError('获取提示词失败，请稍后重试')
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      fetchPrompt()
    }
  }, [user, promptId])

  // 保存提示词
  const handleSave = async (data: { title: string; content: string; mode: string; tags: string[]; is_public: boolean }) => {
    setSaving(true)
    setError('')

    try {
      const updateData = {
        title: data.title,
        content: data.content,
        tags: data.tags || [],
        is_public: data.is_public,
      }

      const response = await api.prompts.update(promptId, updateData)

      if (response.success) {
        router.push(returnPath)
      } else {
        setError(response.error || '保存失败')
      }
    } catch (err) {
      console.error('Failed to save prompt:', err)
      setError('保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  // 版本恢复后刷新提示词数据
  const handleVersionRestore = async () => {
    try {
      const response = await api.prompts.get(promptId)
      if (response.success && response.data) {
        setPrompt(response.data)
      }
    } catch (err) {
      console.error('Failed to refresh prompt after restore:', err)
    }
  }

  // 取消编辑
  const handleCancel = () => {
    router.push(returnPath)
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-gray-600 mt-2">
            {authLoading ? '验证用户...' : '加载提示词...'}
          </p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null // 会重定向到登录页
  }

  if (error) {
    toast({ description: error, variant: 'destructive' })
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full">
          <div className="mt-4 text-center">
            <button
              onClick={() => router.push(returnPath)}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              返回提示词列表
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!prompt) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">提示词不存在</p>
          <button
            onClick={() => router.push(returnPath)}
            className="text-blue-600 hover:text-blue-700 font-medium mt-2"
          >
            返回提示词列表
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <PromptEditor
        prompt={prompt}
        onSave={handleSave}
        onCancel={handleCancel}
        onVersionRestore={handleVersionRestore}
        loading={saving}
      />
    </div>
  )
}

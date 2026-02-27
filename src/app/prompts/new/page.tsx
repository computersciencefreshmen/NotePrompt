'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

import PromptEditor from '@/components/PromptEditor'
import ProtectedRoute from '@/components/ProtectedRoute'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { Folder } from '@/types'
import { toast } from '@/hooks/use-toast'

export default function NewPromptPage() {
  const { user } = useAuth()
  const router = useRouter()

  const [saving, setSaving] = useState(false)
  const [folders, setFolders] = useState<Folder[]>([])
  const [defaultFolderId, setDefaultFolderId] = useState<number | undefined>()

  // 获取当前用户的文件夹列表，自动选第一个
  useEffect(() => {
    if (user) {
      api.folders.list().then(res => {
        if (res.success && res.data && res.data.length > 0) {
          setFolders(res.data)
          setDefaultFolderId(res.data[0].id)
        }
      })
    }
  }, [user])

  // 保存新提示词
  const handleSave = async (data: { title: string; content: string; mode: string; tags: string[]; is_public: boolean }) => {
    setSaving(true)

    try {
      const createData = {
        title: data.title,
        content: data.content,
        folder_id: defaultFolderId || null,
        tags: data.tags || [],
        is_public: data.is_public,
        mode: data.mode
      }
      const response = await api.prompts.create(createData)
      if (response.success) {
        router.push('/prompts')
      } else {
        toast({ description: response.error || '创建失败', variant: 'destructive' })
      }
    } catch (err) {
      console.error('Failed to create prompt:', err)
      toast({ description: '创建失败，请稍后重试', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // 取消创建
  const handleCancel = () => {
    router.push('/prompts')
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">


        <PromptEditor
          onSave={handleSave}
          onCancel={handleCancel}
          loading={saving}
        />
      </div>
    </ProtectedRoute>
  )
}

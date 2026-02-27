"use client"

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import PromptCard from '@/components/PromptCard'
import { Folder, Prompt } from '@/types'
import { api } from '@/lib/api'
import { ArrowLeft, Folder as FolderIcon, FileText, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function FolderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const folderId = parseInt(params.id as string)

  const [folder, setFolder] = useState<Folder | null>(null)
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (folderId) {
      fetchFolderData()
      fetchFolderPrompts()
    }
  }, [folderId])

  const fetchFolderData = async () => {
    try {
      const response = await api.folders.get(folderId)
      if (response.success && response.data) {
        setFolder(response.data)
      }
    } catch (error) {
      console.error('Failed to fetch folder data:', error)
    }
  }

  const fetchFolderPrompts = async () => {
    setLoading(true)
    try {
      // 使用apiRequest函数来确保添加认证头
      const response = await api.folders.getPrompts(folderId)
      if (response.success && response.data) {
        setPrompts(response.data)
      } else {
        console.error('获取文件夹提示词失败:', response.error)
        setPrompts([])
      }
    } catch (error) {
      console.error('Failed to fetch folder prompts:', error)
      setPrompts([])
    } finally {
      setLoading(false)
    }
  }

  const handlePromptClick = (prompt: Prompt) => {
    const currentPath = `/folders/${folderId}`
    router.push(`/prompts/edit/${prompt.id}?return=${encodeURIComponent(currentPath)}`)
  }

  const handleRemoveFromFolder = async (promptId: number) => {
    try {
      const response = await api.folders.removePromptFromFolder(folderId, promptId)
      if (response.success) {
        toast({
          title: '移除成功',
          description: '已从文件夹中移除提示词',
          variant: 'success',
        })
        // 刷新提示词列表
        fetchFolderPrompts()
      } else {
        toast({
          title: '移除失败',
          description: response.error || '从文件夹移除失败',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('移除提示词失败:', error)
      toast({
        title: '操作失败',
        description: '移除提示词失败',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Button
            onClick={() => router.push('/prompts')}
            variant="outline"
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
        </div>
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <FolderIcon className="h-8 w-8 text-blue-600" />
              <div>
                <CardTitle className="text-2xl font-bold">
                  {folder ? folder.name : '文件夹'}
                </CardTitle>
                <div className="flex items-center space-x-4 text-sm text-gray-500 mt-2">
                  <div className="flex items-center space-x-1">
                    <FileText className="h-4 w-4" />
                    <span>{prompts.length} 个提示词</span>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent />
        </Card>
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            包含的提示词 ({prompts.length})
          </h2>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-600">正在加载提示词...</span>
            </div>
          ) : prompts.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-16 w-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                暂无提示词
              </h3>
              <p className="text-gray-600">
                这个文件夹中还没有提示词
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {prompts.map((prompt) => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  type="user"
                  onClick={() => handlePromptClick(prompt)}
                  onDelete={() => handleRemoveFromFolder(prompt.id)}
                  showCopy={true}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
} 
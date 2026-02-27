'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { History, RotateCcw, Eye, Clock, ChevronRight } from 'lucide-react'
import { PromptVersion } from '@/types'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'

interface VersionHistoryProps {
  promptId: number
  onRestore?: () => void
}

export default function VersionHistory({ promptId, onRestore }: VersionHistoryProps) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null)
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const fetchVersions = async () => {
    setLoading(true)
    try {
      const response = await api.prompts.getVersions(promptId)
      if (response.success && response.data) {
        setVersions(response.data)
      }
    } catch (error) {
      console.error('Failed to fetch versions:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      fetchVersions()
      setSelectedVersion(null)
    }
  }, [open, promptId])

  const handleSelectVersion = async (version: PromptVersion) => {
    if (version.content) {
      setSelectedVersion(version)
      return
    }
    try {
      const response = await api.prompts.getVersion(promptId, version.id)
      if (response.success && response.data) {
        setSelectedVersion(response.data)
      }
    } catch (error) {
      console.error('Failed to fetch version detail:', error)
    }
  }

  const handleRestore = async (versionId: number) => {
    setRestoring(true)
    try {
      const response = await api.prompts.restoreVersion(promptId, versionId)
      if (response.success) {
        toast({
          title: '恢复成功',
          description: '提示词已恢复到选定版本',
        })
        setOpen(false)
        onRestore?.()
      } else {
        toast({
          title: '恢复失败',
          description: response.error || '操作失败',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Failed to restore version:', error)
      toast({
        title: '恢复失败',
        description: '网络错误，请稍后重试',
        variant: 'destructive',
      })
    } finally {
      setRestoring(false)
    }
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHour = Math.floor(diffMs / 3600000)
    const diffDay = Math.floor(diffMs / 86400000)

    if (diffMin < 1) return '刚刚'
    if (diffMin < 60) return `${diffMin} 分钟前`
    if (diffHour < 24) return `${diffHour} 小时前`
    if (diffDay < 7) return `${diffDay} 天前`
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <History className="h-4 w-4 mr-1.5" />
          版本历史
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl h-[70vh] flex flex-col dark:bg-gray-900 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-gray-100">
            <History className="h-5 w-5 text-teal-600" />
            版本历史
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-500 dark:text-gray-400">加载中...</div>
          </div>
        ) : versions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 space-y-2">
            <History className="h-12 w-12" />
            <p className="text-lg font-medium">暂无版本历史</p>
            <p className="text-sm">编辑保存后会自动记录版本</p>
          </div>
        ) : (
          <div className="flex-1 flex gap-4 overflow-hidden">
            {/* 版本列表 */}
            <ScrollArea className="w-72 flex-shrink-0 border rounded-lg dark:border-gray-700">
              <div className="p-2 space-y-1">
                {versions.map((version) => (
                  <button
                    key={version.id}
                    onClick={() => handleSelectVersion(version)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedVersion?.id === version.id
                        ? 'bg-teal-50 border border-teal-200 dark:bg-teal-900/30 dark:border-teal-700'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="secondary" className="text-xs">
                        v{version.version_number}
                      </Badge>
                      <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {version.title}
                    </p>
                    {version.change_summary && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                        {version.change_summary}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                      <Clock className="h-3 w-3" />
                      {formatTime(version.created_at)}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>

            {/* 版本详情 */}
            <div className="flex-1 flex flex-col border rounded-lg dark:border-gray-700 overflow-hidden">
              {selectedVersion ? (
                <>
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">
                        {selectedVersion.title}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        版本 {selectedVersion.version_number} · {formatTime(selectedVersion.created_at)}
                        {selectedVersion.change_summary && ` · ${selectedVersion.change_summary}`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleRestore(selectedVersion.id)}
                      disabled={restoring}
                      className="bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      {restoring ? '恢复中...' : '恢复此版本'}
                    </Button>
                  </div>
                  <ScrollArea className="flex-1 p-4">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-4 font-mono leading-relaxed">
                        {selectedVersion.content}
                      </pre>
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 space-y-2">
                  <Eye className="h-8 w-8" />
                  <p className="text-sm">选择左侧版本查看内容</p>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

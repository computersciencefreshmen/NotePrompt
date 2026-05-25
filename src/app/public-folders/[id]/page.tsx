'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Header from '@/components/Header'
import { PublicFolder, PublicPrompt } from '@/types'
import { api } from '@/lib/api'
import { 
  ArrowLeft, 
  Folder, 
  User, 
  Calendar, 
  FileText, 
  Download, 
  Copy, 
  Check,
  Eye,
  Loader2,
  ExternalLink
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { detectLocaleFromSearch, Locale, withLocaleHref } from '@/lib/i18n'

const folderDetailCopy = {
  zh: {
    promptImportSuccessTitle: '导入成功',
    promptImportSuccessDesc: '提示词已导入到您的个人提示词库',
    promptImportFailedTitle: '导入失败',
    promptImportFailedDesc: '导入提示词失败，请稍后重试',
    folderImportSuccessTitle: '导入成功',
    folderImportSuccessDesc: '文件夹已成功导入到您的个人文件夹',
    folderImportFailedTitle: '导入失败',
    folderImportFailedDesc: '导入失败，请稍后重试',
    copiedTitle: '复制成功',
    copiedDesc: '提示词内容已复制到剪贴板',
    loading: '正在加载文件夹详情...',
    notFound: '文件夹不存在',
    back: '返回文件夹列表',
    promptCount: (count: number) => `${count} 个提示词`,
    importing: '导入中...',
    importFolder: '导入文件夹',
    includedPrompts: (count: number) => `包含的提示词 (${count})`,
    emptyTitle: '暂无提示词',
    emptyText: '这个文件夹中还没有公开的提示词',
    viewDetail: '查看详情',
    copied: '已复制',
    copy: '复制',
    description: '描述',
    content: '提示词内容',
    dateLocale: 'zh-CN',
  },
  en: {
    promptImportSuccessTitle: 'Imported',
    promptImportSuccessDesc: 'Prompt imported to your library.',
    promptImportFailedTitle: 'Import failed',
    promptImportFailedDesc: 'Prompt import failed. Please try again later.',
    folderImportSuccessTitle: 'Imported',
    folderImportSuccessDesc: 'Folder imported to your workspace.',
    folderImportFailedTitle: 'Import failed',
    folderImportFailedDesc: 'Import failed. Please try again later.',
    copiedTitle: 'Copied',
    copiedDesc: 'Prompt content copied to clipboard.',
    loading: 'Loading folder details...',
    notFound: 'Folder not found',
    back: 'Back to folder library',
    promptCount: (count: number) => `${count} prompt${count === 1 ? '' : 's'}`,
    importing: 'Importing...',
    importFolder: 'Copy prompts',
    includedPrompts: (count: number) => `Included prompts (${count})`,
    emptyTitle: 'No prompts yet',
    emptyText: 'This collection does not contain public prompts yet.',
    viewDetail: 'View details',
    copied: 'Copied',
    copy: 'Copy',
    description: 'Description',
    content: 'Prompt content',
    dateLocale: 'en-US',
  },
}

export default function PublicFolderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const folderId = parseInt(params.id as string)
  const [locale, setLocale] = useState<Locale>('zh')
  const [localeReady, setLocaleReady] = useState(false)
  const copy = folderDetailCopy[locale]
  const href = (path: string) => withLocaleHref(path, locale)
  
  const [folder, setFolder] = useState<PublicFolder | null>(null)
  const [prompts, setPrompts] = useState<PublicPrompt[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedPromptId, setCopiedPromptId] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [selectedPrompt, setSelectedPrompt] = useState<PublicPrompt | null>(null)
  const [showPromptDialog, setShowPromptDialog] = useState(false)

  useEffect(() => {
    setLocale(detectLocaleFromSearch())
    setLocaleReady(true)
  }, [])

  useEffect(() => {
    if (folderId && localeReady) {
      fetchFolderDetail()
    }
  }, [folderId, locale, localeReady])

  useEffect(() => {
    if (folder) {
      fetchFolderPrompts()
    }
  }, [folder])

  const fetchFolderDetail = async () => {
    setLoading(true)
    try {
      const response = await api.publicFolders.get(folderId, locale)
      if (response.success && response.data) {
        setFolder(response.data)
      }
    } catch (error) {
      console.error('Failed to fetch folder detail:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchFolderPrompts = async () => {
    try {
      // 使用apiRequest函数来确保添加认证头
      const response = await api.publicFolders.getPrompts(folderId, locale)
      if (response.success && response.data) {
        setPrompts(response.data)
      } else {
        console.error('Failed to fetch public folder prompts:', response.error)
      }
    } catch (error) {
      console.error('Failed to fetch folder prompts:', error)
    }
  }

  const handlePromptClick = (prompt: PublicPrompt) => {
    // 显示提示词详情对话框
    setSelectedPrompt(prompt)
    setShowPromptDialog(true)
  }

  const handleCopyPrompt = async (prompt: PublicPrompt) => {
    try {
      await navigator.clipboard.writeText(prompt.content)
      setCopiedPromptId(prompt.id)
      setTimeout(() => setCopiedPromptId(null), 2000)
    } catch (error) {
      console.error('Failed to copy prompt:', error)
    }
  }

  const handleImportPrompt = async (promptId: number) => {
    if (locale === 'en') {
      const prompt = prompts.find(item => item.id === promptId)
      if (prompt) await handleCopyPrompt(prompt)
      return
    }

    try {
      // 导入公共提示词到用户的个人提示词库
      const response = await api.publicPrompts.import(promptId)
      if (response.success) {
        toast({
          title: copy.promptImportSuccessTitle,
          description: copy.promptImportSuccessDesc,
          variant: 'success',
        })
      } else {
        console.error('导入提示词失败:', response.error)
        toast({
          title: copy.promptImportFailedTitle,
          description: response.error || copy.promptImportFailedDesc,
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Failed to import prompt:', error)
    }
  }

  const handleImportFolder = async () => {
    if (locale === 'en') {
      const content = prompts.map(prompt => `# ${prompt.title}\n\n${prompt.content}`).join('\n\n---\n\n')
      if (content) {
        await navigator.clipboard.writeText(content)
        toast({
          title: copy.copiedTitle,
          description: copy.copiedDesc,
          variant: 'success',
        })
      }
      return
    }

    setImporting(true)
    try {
      const response = await api.publicFolders.import(folderId)
      if (response.success) {
        toast({
          title: copy.folderImportSuccessTitle,
          description: (response as any).message || copy.folderImportSuccessDesc,
          variant: 'success',
        })
        
        // 导入成功后跳转到用户的提示词页面
        setTimeout(() => {
          router.push(href('/prompts'))
        }, 1500)
      } else {
        toast({
          title: copy.folderImportFailedTitle,
          description: response.error || copy.folderImportFailedDesc,
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Failed to import folder:', error)
      toast({
        title: copy.folderImportFailedTitle,
        description: copy.folderImportFailedDesc,
        variant: 'destructive',
      })
    } finally {
      setImporting(false)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString(copy.dateLocale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return ''
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <Header />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">{copy.loading}</span>
          </div>
        </main>
      </div>
    )
  }

  if (!folder) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <Header />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">{copy.notFound}</h1>
            <Button onClick={() => router.push(href('/public-folders'))}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {copy.back}
            </Button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 返回按钮 */}
        <div className="mb-6">
          <Button
            onClick={() => router.push(href('/public-folders'))}
            variant="outline"
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {copy.back}
          </Button>
        </div>

        {/* 文件夹信息 */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <Folder className="h-8 w-8 text-blue-600" />
                <div>
                  <CardTitle className="text-2xl font-bold">{folder.name}</CardTitle>
                  <div className="flex items-center space-x-4 text-sm text-gray-500 mt-2">
                    <div className="flex items-center space-x-1">
                      <User className="h-4 w-4" />
                      <span>{folder.author}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <FileText className="h-4 w-4" />
                      <span>{copy.promptCount(prompts.length)}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-4 w-4" />
                      <span>{formatDate(folder.created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <Button
                onClick={handleImportFolder}
                disabled={importing}
                className="bg-teal-600 hover:bg-teal-700 text-white"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {importing ? copy.importing : copy.importFolder}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {folder.description && (
              <p className="text-gray-700 text-lg leading-relaxed">
                {folder.description}
              </p>
            )}
          </CardContent>
        </Card>

        {/* 提示词列表 */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            {copy.includedPrompts(prompts.length)}
          </h2>
          
          {prompts.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-16 w-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {copy.emptyTitle}
              </h3>
              <p className="text-gray-600">
                {copy.emptyText}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {prompts.map((prompt) => (
                <Card 
                  key={prompt.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handlePromptClick(prompt)}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-semibold line-clamp-2">
                      {prompt.title}
                    </CardTitle>
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-1">
                          <User className="h-3 w-3" />
                          <span>{prompt.author}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(prompt.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-4">
                      {/* 描述 */}
                      {prompt.description && (
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {prompt.description}
                        </p>
                      )}

                      {/* 操作按钮 */}
                      <div className="flex items-center justify-between pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePromptClick(prompt)
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          {copy.viewDetail}
                        </Button>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCopyPrompt(prompt)
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {copiedPromptId === prompt.id ? (
                            <Check className="h-4 w-4 mr-1" />
                          ) : (
                            <Copy className="h-4 w-4 mr-1" />
                          )}
                          {copiedPromptId === prompt.id ? copy.copied : copy.copy}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 提示词详情对话框 */}
      <Dialog open={showPromptDialog} onOpenChange={setShowPromptDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {selectedPrompt?.title}
            </DialogTitle>
          </DialogHeader>
          
          {selectedPrompt && (
            <div className="space-y-6">
              {/* 提示词信息 */}
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <div className="flex items-center space-x-1">
                  <User className="h-4 w-4" />
                  <span>{selectedPrompt.author}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Calendar className="h-4 w-4" />
                  <span>{formatDate(selectedPrompt.created_at)}</span>
                </div>
              </div>

              {/* 描述 */}
              {selectedPrompt.description && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">{copy.description}</h3>
                  <p className="text-gray-700 leading-relaxed">
                    {selectedPrompt.description}
                  </p>
                </div>
              )}

              {/* 提示词内容 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">{copy.content}</h3>
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedPrompt.content)
                      toast({
                        title: copy.copiedTitle,
                        description: copy.copiedDesc,
                        variant: 'success',
                      })
                    }}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    {copy.copy}
                  </Button>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg border">
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono leading-relaxed">
                    {selectedPrompt.content}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
} 
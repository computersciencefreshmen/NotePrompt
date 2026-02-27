'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { Star, Download, Edit, Trash2, User, Calendar, Upload, Folder, Eye, Heart, Copy } from 'lucide-react'
import { PublicPrompt, Prompt } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'

interface PromptCardProps {
  prompt: PublicPrompt | Prompt
  type: 'public' | 'user'
  onEdit?: (id: number) => void
  onDelete?: (id: number) => void
  onFavoriteChange?: () => void
  onClick?: (prompt: PublicPrompt | Prompt) => void
  onTagClick?: (tag: string) => void
  onPublish?: (prompt: Prompt) => void
  onSelect?: (id: number) => void
  isSelected?: boolean
  showCheckbox?: boolean
  draggable?: boolean
  onDragStart?: (e: React.DragEvent, prompt: PublicPrompt | Prompt) => void
  onAddToFolder?: (promptId: number) => void
  showAddToFolder?: boolean
  disableFavorite?: boolean // 新增：是否禁用收藏功能
  showCopy?: boolean // 新增：是否显示复制按钮
}

export default function PromptCard({
  prompt,
  type,
  onEdit,
  onDelete,
  onFavoriteChange,
  onClick,
  onTagClick,
  onPublish,
  onSelect,
  isSelected = false,
  showCheckbox = false,
  draggable = false,
  onDragStart,
  onAddToFolder,
  showAddToFolder = false,
  disableFavorite = false,
  showCopy = false
}: PromptCardProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  
  // 正确初始化收藏状态
  const [isFavorited, setIsFavorited] = useState(() => {
    if (type === 'public') {
      return (prompt as PublicPrompt).is_favorited || false
    } else {
      return (prompt as Prompt).is_favorited || false
    }
  })

  const isPublicPrompt = type === 'public'
  const publicPrompt = prompt as PublicPrompt
  const userPrompt = prompt as Prompt
  
  // 处理多文件夹信息
  const folderNames = Array.isArray(userPrompt.folder_names) ? userPrompt.folder_names : []
  const folderIds = Array.isArray(userPrompt.folder_ids) ? userPrompt.folder_ids : []
  const hasMultipleFolders = folderNames.length > 1

  // 当prompt的收藏状态变化时，更新本地状态
  useEffect(() => {
    if (type === 'public') {
      setIsFavorited((prompt as PublicPrompt).is_favorited || false)
    } else {
      setIsFavorited((prompt as Prompt).is_favorited || false)
    }
  }, [prompt, type])

  const handleFavorite = async () => {
    if (!user) {
      toast({
        title: '需要登录',
        description: '请先登录才能收藏',
        variant: 'warning',
      })
      return
    }

    try {
      if (isFavorited) {
        // 取消收藏
        const response = await api.favorites.remove(prompt.id)
        
        if (response.success) {
          setIsFavorited(false)
          // 更新prompt对象的收藏状态
          if (type === 'public') {
            (prompt as PublicPrompt).is_favorited = false
          } else {
            (prompt as Prompt).is_favorited = false
          }
          
          toast({
            title: '取消收藏成功',
            description: '已取消收藏该提示词',
            variant: 'success',
          })
          
          // 通知父组件收藏状态变化
          onFavoriteChange?.()
        }
      } else {
        // 添加收藏
        try {
          const response = await api.favorites.add(prompt.id)
          
          if (response.success) {
            setIsFavorited(true)
            // 更新prompt对象的收藏状态
            if (type === 'public') {
              (prompt as PublicPrompt).is_favorited = true
            } else {
              (prompt as Prompt).is_favorited = true
            }
            
            toast({
              title: '收藏成功',
              description: '已添加到收藏列表',
              variant: 'success',
            })
            
            // 通知父组件收藏状态变化
            onFavoriteChange?.()
          }
        } catch (addError) {
          console.error('添加收藏失败:', addError)
          toast({
            title: '收藏失败',
            description: '添加收藏失败，请稍后重试',
            variant: 'destructive',
          })
        }
      }
    } catch (error) {
      console.error('收藏操作失败:', error)
      toast({
        title: '操作失败',
        description: '收藏操作失败，请稍后重试',
        variant: 'destructive',
      })
    }
  }

  const handleImport = async () => {
    if (!user) {
      toast({
        title: '需要登录',
        description: '请先登录才能导入',
        variant: 'warning',
      })
      // 3秒后跳转到登录页
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.href = '/login'
        }
      }, 2000)
      return
    }

    setLoading(true)
    try {
      await api.publicPrompts.import(prompt.id)
      toast({
        title: '导入成功',
        description: '已添加到您的提示词库',
        variant: 'success',
      })
    } catch (error) {
      console.error('Import error:', error)
      let errorMessage = '导入失败，请稍后重试'
      if (error instanceof Error) {
        if (error.message.includes('提示词不存在')) {
          errorMessage = '该提示词已被删除或不存在'
        } else if (error.message.includes('不能导入自己的提示词')) {
          errorMessage = '不能导入自己的提示词'
        } else {
          errorMessage = error.message
        }
      }
      toast({
        title: '导入失败',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = () => {
    onEdit?.(prompt.id)
  }

  const handleCopy = async () => {
    try {
      // 复制提示词内容到剪贴板
      const contentToCopy = `${prompt.title}\n\n${prompt.content}`
      await navigator.clipboard.writeText(contentToCopy)
      
      toast({
        title: '复制成功',
        description: '提示词内容已复制到剪贴板',
        variant: 'success',
      })
    } catch (error) {
      console.error('复制失败:', error)
      toast({
        title: '复制失败',
        description: '无法复制到剪贴板，请手动复制',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    try {
      // 调用父组件的删除回调，让父组件处理具体的删除逻辑
      onDelete?.(prompt.id)
      setShowDeleteDialog(false)
    } catch (error) {
      toast({
        title: '删除失败',
        description: error instanceof Error ? error.message : '删除失败',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return ''
    }
  }

  return (
    <>
      <Card 
        className="hover:shadow-md transition-shadow cursor-pointer" 
        onClick={() => onClick?.(prompt)}
        draggable={draggable}
        onDragStart={(e) => onDragStart?.(e, prompt)}
      >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-2 flex-1">
            {showCheckbox && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation()
                  onSelect?.(prompt.id)
                }}
                className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
            )}
            <CardTitle className="text-lg font-semibold line-clamp-2">
              {prompt.title}
            </CardTitle>
            {isPublicPrompt && publicPrompt.is_featured && (
              <div className="flex items-center px-2 py-1 bg-gradient-to-r from-yellow-400 to-orange-400 text-white text-xs font-medium rounded-full">
                <Star className="h-3 w-3 mr-1 fill-current" />
                精选
              </div>
            )}
          </div>
          <div className="flex items-center space-x-1 ml-2">
            {isPublicPrompt && onDelete ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDeleteDialog(true)
                }}
                disabled={loading}
                className="p-1 text-gray-400 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>

        {isPublicPrompt && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1">
                <User className="h-3 w-3" />
                <span>{publicPrompt.author}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Star className="h-3 w-3" />
                <span>{publicPrompt.favorites_count || 0}</span>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <Calendar className="h-3 w-3" />
              <span>{formatDate(publicPrompt.created_at)}</span>
            </div>
          </div>
        )}

        {!isPublicPrompt && userPrompt.updated_at && (
          <div className="flex items-center space-x-1 text-sm text-gray-500">
            <Calendar className="h-3 w-3" />
            <span>更新于 {formatDate(userPrompt.updated_at)}</span>
          </div>
        )}

        {/* 多文件夹信息显示 */}
        {!isPublicPrompt && (folderNames.length > 0 || userPrompt.folder_id) && (
          <div className="flex items-center space-x-1 text-sm text-gray-500 mt-2">
            <Folder className="h-3 w-3" />
            <span>
              {hasMultipleFolders 
                ? `多个文件夹: ${folderNames.slice(0, 2).join(', ')}${folderNames.length > 2 ? ` +${folderNames.length - 2}` : ''}`
                : `文件夹: ${folderNames[0] || `ID: ${userPrompt.folder_id}`}`
              }
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-4">
          {/* 描述或内容预览 */}
          {isPublicPrompt && publicPrompt.description && (
            <p className="text-sm text-gray-600 line-clamp-2">
              {publicPrompt.description}
            </p>
          )}

          <div className="bg-gray-50 p-3 rounded-md">
            <p className="text-sm text-gray-700 line-clamp-3">
              {prompt.content}
            </p>
          </div>

          {/* 标签 */}
          <div className="flex flex-wrap gap-2 mb-3">
            {isPublicPrompt ? (
              publicPrompt.tags && Array.isArray(publicPrompt.tags) ? publicPrompt.tags.map((tag, index) => (
                <Badge
                  key={`public-tag-${prompt.id}-${index}`}
                  variant="secondary"
                  className="text-xs cursor-pointer hover:bg-blue-200"
                  onClick={(e) => {
                    e.stopPropagation()
                    onTagClick?.(tag)
                  }}
                >
                  {tag}
                </Badge>
              )) : null
            ) : (
              userPrompt.tags && Array.isArray(userPrompt.tags) ? userPrompt.tags.map((tag, index) => (
                <Badge
                  key={`user-tag-${prompt.id}-${tag.id || index}`}
                  variant="secondary"
                  className="text-xs cursor-pointer hover:bg-blue-200"
                  onClick={(e) => {
                    e.stopPropagation()
                    onTagClick?.(tag.name)
                  }}
                >
                  {tag.name}
                </Badge>
              )) : null
            )}

            {isPublicPrompt && publicPrompt.category && (
              <Badge
                variant="outline"
                className="text-xs cursor-pointer hover:bg-blue-100"
                onClick={(e) => {
                  e.stopPropagation()
                  onTagClick?.(publicPrompt.category)
                }}
              >
                {publicPrompt.category}
              </Badge>
            )}
          </div>



          {/* 操作按钮 */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex flex-wrap gap-2">
              {isPublicPrompt ? (
                <>
                  {!disableFavorite && (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleFavorite()
                      }}
                      disabled={loading}
                      variant={isFavorited ? "default" : "outline"}
                      className={isFavorited ? "bg-yellow-500 hover:bg-yellow-600" : "text-yellow-600 hover:text-yellow-700 hover:border-yellow-300"}
                    >
                      <Star className={`h-4 w-4 mr-1 ${isFavorited ? 'fill-current' : ''}`} />
                      {isFavorited ? '已收藏' : '收藏'}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleImport()
                    }}
                    disabled={loading}
                    className="bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    导入
                  </Button>
                </>
              ) : (
                <>
                  {showAddToFolder && onAddToFolder && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAddToFolder(prompt.id)
                      }}
                      disabled={loading}
                      className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
                    >
                      <Folder className="h-4 w-4 mr-1" />
                      添加
                    </Button>
                  )}
                  {showCopy && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCopy()
                      }}
                      disabled={loading}
                      className="text-gray-600 hover:text-gray-700 hover:border-gray-300"
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      复制
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit()
                    }}
                    disabled={loading}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation()
                      onPublish?.(userPrompt)
                    }}
                    disabled={loading}
                    className="text-teal-600 hover:text-teal-700 hover:border-teal-300"
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    发布
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowDeleteDialog(true)
                    }}
                    disabled={loading}
                    className="text-red-600 hover:text-red-700 hover:border-red-300"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    删除
                  </Button>
                </>
              )}
            </div>
          </div>


        </div>
      </CardContent>
    </Card>

    {/* 删除确认对话框 */}
    <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {type === 'public' ? '确认取消收藏' : '确认删除提示词'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-gray-600">
            {type === 'public' 
              ? `确定要取消收藏提示词 "${prompt.title}" 吗？`
              : `确定要删除提示词 "${prompt.title}" 吗？此操作不可撤销。`
            }
          </p>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
            >
              {loading 
                ? (type === 'public' ? '取消收藏中...' : '删除中...') 
                : (type === 'public' ? '确认取消收藏' : '确认删除')
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>
  )
}

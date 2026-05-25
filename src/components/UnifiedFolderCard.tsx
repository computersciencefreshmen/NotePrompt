'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Folder, Edit, Trash2, FileText, Plus, Upload, User, Calendar, ExternalLink, Download } from 'lucide-react'
import { Folder as FolderType, ImportedFolder } from '@/types'
import { api } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { Locale, withLocaleHref } from '@/lib/i18n'

interface UnifiedFolderCardProps {
  folder: FolderType | ImportedFolder
  promptCount?: number
  isDragOver?: boolean
  onEdit?: (folder: FolderType) => void
  onDelete?: (id: number) => void
  onDrop?: (e: React.DragEvent, folderId: number) => void
  onDragOver?: (e: React.DragEvent, folderId: number) => void
  onDragLeave?: () => void
  onPublish?: (folderId: number) => void
  onClick?: () => void
  type: 'user' | 'imported'
  locale?: Locale
}

const unifiedFolderCopy = {
  zh: {
    save: '保存',
    cancel: '取消',
    imported: '导入',
    prompts: '个提示词',
    publish: '发布',
    view: '查看',
    confirmDeleteTitle: '确认删除文件夹',
    deleteImportedDescription: (name: string) => `确定要删除文件夹 "${name}" 吗？这将从您的导入列表中移除该文件夹，但不会影响原始文件夹。`,
    deleteDescription: (name: string) => `确定要删除文件夹 "${name}" 吗？此操作不可撤销。`,
    deleting: '删除中...',
    confirmDelete: '确认删除',
    locale: 'zh-CN',
  },
  en: {
    save: 'Save',
    cancel: 'Cancel',
    imported: 'Imported',
    prompts: 'prompts',
    publish: 'Publish',
    view: 'View',
    confirmDeleteTitle: 'Delete folder?',
    deleteImportedDescription: (name: string) => `Remove "${name}" from your imported folders? The original public folder will not be affected.`,
    deleteDescription: (name: string) => `Delete "${name}"? This action cannot be undone.`,
    deleting: 'Deleting...',
    confirmDelete: 'Delete',
    locale: 'en-US',
  },
}

export default function UnifiedFolderCard({
  folder,
  promptCount = 0,
  isDragOver = false,
  onEdit,
  onDelete,
  onDrop,
  onDragOver,
  onDragLeave,
  onPublish,
  onClick,
  type,
  locale = 'zh',
}: UnifiedFolderCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(folder.name)
  const [loading, setLoading] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const router = useRouter()
  const copy = unifiedFolderCopy[locale]

  const isImported = type === 'imported'
  const importedFolder = isImported ? folder as ImportedFolder : null

  const handleEdit = async () => {
    if (!editName.trim() || isImported) return
    
    setLoading(true)
    try {
      await api.folders.update(folder.id, { name: editName.trim() })
      onEdit?.({ ...folder, name: editName.trim() } as FolderType)
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to update folder:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    try {
      if (isImported) {
        // 删除导入的文件夹
        await api.user.deleteImportedFolder(folder.id)
      } else {
        // 删除用户文件夹
        await api.folders.delete(folder.id)
      }
      onDelete?.(folder.id)
      setShowDeleteDialog(false)
    } catch (error) {
      console.error('Failed to delete folder:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    onDrop?.(e, folder.id)
  }

  const handleClick = () => {
    if (onClick) {
      onClick()
    } else {
      if (isImported) {
        router.push(withLocaleHref(`/imported-folders/${folder.id}`, locale))
      } else {
        router.push(withLocaleHref(`/folders/${folder.id}`, locale))
      }
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString(copy.locale, {
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
        className={`hover:shadow-md transition-all cursor-pointer ${
          isDragOver ? 'border-blue-500 bg-blue-50' : ''
        }`}
        onDrop={handleDrop}
        onDragOver={(e) => onDragOver?.(e, folder.id)}
        onDragLeave={onDragLeave}
        onClick={handleClick}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2 flex-1">
              <Folder className="h-5 w-5 text-blue-600" />
              {isEditing ? (
                <div className="flex items-center space-x-2 flex-1">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleEdit()
                      } else if (e.key === 'Escape') {
                        setIsEditing(false)
                        setEditName(folder.name)
                      }
                    }}
                    className="flex-1"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleEdit} disabled={loading}>
                    {copy.save}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => {
                      setIsEditing(false)
                      setEditName(folder.name)
                    }}
                  >
                    {copy.cancel}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center space-x-2 flex-1">
                  <CardTitle className="text-lg font-semibold line-clamp-1">
                    {folder.name}
                  </CardTitle>
                  {isImported && (
                    <Badge variant="secondary" className="text-xs">
                      {copy.imported}
                    </Badge>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex items-center space-x-1">
              {!isImported && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsEditing(true)
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <Edit className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDeleteDialog(true)
                }}
                className="p-1 text-gray-400 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {/* 导入文件夹的额外信息 */}
          {isImported && importedFolder && (
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-3">
              <div className="flex items-center space-x-2">
                <User className="h-3 w-3" />
                <span>{importedFolder.author}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar className="h-3 w-3" />
                <span>{formatDate(importedFolder.original_created_at)}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {promptCount} {copy.prompts}
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              {!isImported && promptCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPublish?.(folder.id)
                  }}
                  className="text-blue-600 border-blue-600 hover:bg-blue-50"
                >
                  <Upload className="h-3 w-3 mr-1" />
                  {copy.publish}
                </Button>
              )}
              {isImported && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleClick()
                  }}
                  className="text-teal-600 border-teal-600 hover:bg-teal-50"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  {copy.view}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.confirmDeleteTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-300">
              {isImported ? copy.deleteImportedDescription(folder.name) : copy.deleteDescription(folder.name)}
            </p>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(false)}
                disabled={loading}
              >
                {copy.cancel}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={loading}
              >
                {loading ? copy.deleting : copy.confirmDelete}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
} 
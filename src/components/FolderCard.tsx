'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Folder, Edit, Trash2, FileText, Plus, Upload } from 'lucide-react'
import { Folder as FolderType } from '@/types'
import { api } from '@/lib/api'
import { useRouter } from 'next/navigation'

interface FolderCardProps {
  folder: FolderType
  promptCount?: number
  isDragOver?: boolean
  onEdit?: (folder: FolderType) => void
  onDelete?: (id: number) => void
  onDrop?: (e: React.DragEvent, folderId: number) => void
  onDragOver?: (e: React.DragEvent, folderId: number) => void
  onDragLeave?: () => void
  onPublish?: (folderId: number) => void
  onClick?: () => void // 新增点击事件
}

export default function FolderCard({
  folder,
  promptCount = 0,
  isDragOver = false,
  onEdit,
  onDelete,
  onDrop,
  onDragOver,
  onDragLeave,
  onPublish,
  onClick // 新增
}: FolderCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(folder.name)
  const [loading, setLoading] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const router = useRouter(); // 新增

  const handleEdit = async () => {
    if (!editName.trim()) return
    
    setLoading(true)
    try {
      const response = await api.folders.update(folder.id, { name: editName.trim() })
      if (response.success) {
        onEdit?.({ ...folder, name: editName.trim() })
        setIsEditing(false)
      } else {
        console.error('Failed to update folder:', response.error)
      }
    } catch (error) {
      console.error('Failed to update folder:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    try {
      await api.folders.delete(folder.id)
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

  return (
    <>
      <Card 
        className={`hover:shadow-md transition-all cursor-pointer ${
          isDragOver ? 'border-blue-500 bg-blue-50' : ''
        }`}
        onDrop={(e) => onDrop?.(e, folder.id)}
        onDragOver={(e) => onDragOver?.(e, folder.id)}
        onDragLeave={onDragLeave}
        onClick={() => router.push(`/folders/${folder.id}`)} // 修改为跳转
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
                    保存
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => {
                      setIsEditing(false)
                      setEditName(folder.name)
                    }}
                  >
                    取消
                  </Button>
                </div>
              ) : (
                <CardTitle className="text-lg font-semibold line-clamp-1">
                  {folder.name}
                </CardTitle>
              )}
            </div>
            
            <div className="flex items-center space-x-1">
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
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600">
                {promptCount} 个提示词
              </span>
            </div>
            
            {promptCount > 0 && (
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
                发布文件夹
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除文件夹</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">
              确定要删除文件夹 "{folder.name}" 吗？此操作不可撤销。
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
                {loading ? '删除中...' : '确认删除'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
} 
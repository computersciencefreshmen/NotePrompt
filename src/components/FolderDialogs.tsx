'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { Folder } from '@/types'

interface NewFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folderName: string
  onFolderNameChange: (name: string) => void
  onSubmit: () => void
  loading: boolean
}

export function NewFolderDialog({
  open,
  onOpenChange,
  folderName,
  onFolderNameChange,
  onSubmit,
  loading,
}: NewFolderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建文件夹</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">文件夹名称</label>
            <Input
              value={folderName}
              onChange={(e) => onFolderNameChange(e.target.value)}
              placeholder="请输入文件夹名称"
              className="mt-1"
            />
          </div>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              取消
            </Button>
            <Button
              onClick={onSubmit}
              disabled={loading || !folderName.trim()}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  创建中...
                </>
              ) : (
                '创建文件夹'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface FolderSelectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folders: Folder[]
  onSelectFolder: (folderId: number) => void
}

export function FolderSelectDialog({
  open,
  onOpenChange,
  folders,
  onSelectFolder,
}: FolderSelectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>选择文件夹</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            您想要将提示词添加到哪个文件夹？
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {folders.map((folder) => (
              <Button
                key={folder.id}
                variant="outline"
                onClick={() => onSelectFolder(folder.id)}
                className="w-full"
              >
                {folder.name}
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

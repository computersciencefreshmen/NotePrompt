'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { AdminFolder } from '@/types'

interface AdminFolderEditDialogProps {
  folder: AdminFolder | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => void
}

export default function AdminFolderEditDialog({
  folder,
  open,
  onOpenChange,
  onSave
}: AdminFolderEditDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_featured: false
  })

  useEffect(() => {
    if (folder) {
      setFormData({
        name: folder.name,
        description: folder.description,
        is_featured: folder.is_featured
      })
    }
  }, [folder])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!folder) return

    setLoading(true)
    try {
      const response = await api.admin.updatePublicFolder(folder.id, formData)
      
      if (response.success) {
        toast({
          title: '更新成功',
          description: '公共文件夹已更新',
          variant: 'success',
        })
        onSave()
        onOpenChange(false)
      } else {
        toast({
          title: '更新失败',
          description: response.error || '更新失败',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Update folder error:', error)
      toast({
        title: '更新失败',
        description: '更新失败，请稍后重试',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>编辑公共文件夹</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">文件夹名称</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="输入文件夹名称"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">描述</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="输入文件夹描述"
                rows={4}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="featured"
                checked={formData.is_featured}
                onCheckedChange={(checked) => setFormData({ ...formData, is_featured: checked })}
              />
              <Label htmlFor="featured">设为精选</Label>
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
} 
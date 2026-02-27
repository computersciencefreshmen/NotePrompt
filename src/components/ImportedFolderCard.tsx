'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Folder, User, Calendar, FileText, ExternalLink } from 'lucide-react'
import { ImportedFolder } from '@/types'

interface ImportedFolderCardProps {
  folder: ImportedFolder
  onView: (folder: ImportedFolder) => void
}

export default function ImportedFolderCard({ folder, onView }: ImportedFolderCardProps) {
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
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2 flex-1">
            <Folder className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg font-semibold line-clamp-2">
              {folder.name}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              导入
            </Badge>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-gray-500">
          <div className="flex items-center space-x-2">
            <User className="h-3 w-3" />
            <span>{folder.author}</span>
          </div>
          <div className="flex items-center space-x-2">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(folder.original_created_at)}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {folder.description && (
          <p className="text-sm text-gray-600 mb-4 line-clamp-2">
            {folder.description}
          </p>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button
            size="sm"
            onClick={() => onView(folder)}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            <ExternalLink className="h-4 w-4 mr-1" />
            查看提示词
          </Button>
        </div>
      </CardContent>
    </Card>
  )
} 
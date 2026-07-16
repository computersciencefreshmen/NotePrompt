'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Folder as FolderIcon, FolderPlus } from 'lucide-react'
import UnifiedFolderCard from '@/components/UnifiedFolderCard'
import { Folder, ImportedFolder } from '@/types'
import { Locale } from '@/lib/i18n'

interface FolderSectionProps {
  folders: Folder[]
  importedFolders: ImportedFolder[]
  onCreateFolder: () => void
  onEditFolder: (folder: Folder) => void
  onDeleteFolder: (folderId: number) => void
  onPublishFolder: (folderId: number) => void
  onDrop: (e: React.DragEvent, folderId: number) => void
  onDragOver: (e: React.DragEvent, folderId: number) => void
  onDragLeave: () => void
  dragOverFolder: number | null
  locale?: Locale
}

const folderSectionCopy = {
  zh: {
    title: '我的文件夹',
    owned: '自建',
    imported: '导入',
    newFolder: '新建文件夹',
    empty: '暂无文件夹',
    firstFolder: '创建第一个文件夹',
  },
  en: {
    title: 'My folders',
    owned: 'Owned',
    imported: 'Imported',
    newFolder: 'New folder',
    empty: 'No folders yet',
    firstFolder: 'Create first folder',
  },
}

export default function FolderSection({
  folders,
  importedFolders,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onPublishFolder,
  onDrop,
  onDragOver,
  onDragLeave,
  dragOverFolder,
  locale = 'zh',
}: FolderSectionProps) {
  const totalFolders = folders.length + importedFolders.length
  const copy = folderSectionCopy[locale]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <h2 className="text-xl font-semibold">{copy.title}</h2>
          {folders.length > 0 && (
            <Badge variant="secondary" className="text-xs">{copy.owned} {folders.length}</Badge>
          )}
          {importedFolders.length > 0 && (
            <Badge variant="outline" className="text-xs border-blue-300 text-blue-600">{copy.imported} {importedFolders.length}</Badge>
          )}
        </div>
        <Button
          onClick={onCreateFolder}
          className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2"
        >
          <FolderPlus className="h-4 w-4 mr-2" />
          {copy.newFolder}
        </Button>
      </div>

      {totalFolders === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-gray-500">
              <FolderIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>{copy.empty}</p>
              <Button
                variant="outline"
                className="mt-4 border-teal-600 text-teal-600 hover:bg-teal-50"
                onClick={onCreateFolder}
              >
                {copy.firstFolder}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {folders.map((folder) => (
                <UnifiedFolderCard
                  key={`user-${folder.id}`}
                  folder={folder}
                  promptCount={folder.prompt_count || 0}
                  type="user"
                  isDragOver={dragOverFolder === folder.id}
                  onEdit={onEditFolder}
                  onDelete={onDeleteFolder}
                  onPublish={onPublishFolder}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  locale={locale}
                />
              ))}
              {importedFolders.map((folder) => (
                <UnifiedFolderCard
                  key={`imported-${folder.id}`}
                  folder={folder}
                  promptCount={folder.prompt_count || 0}
                  type="imported"
                  isDragOver={dragOverFolder === folder.id}
                  onDelete={onDeleteFolder}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  locale={locale}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

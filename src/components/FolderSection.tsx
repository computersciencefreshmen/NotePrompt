'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Folder as FolderIcon, FolderPlus } from 'lucide-react'
import UnifiedFolderCard from '@/components/UnifiedFolderCard'
import { Folder, ImportedFolder, Prompt, PublicPrompt } from '@/types'

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
}: FolderSectionProps) {
  return (
    <>
      {/* 我的文件夹 */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">我的文件夹</h2>
          <Button
            onClick={onCreateFolder}
            className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2"
          >
            <FolderPlus className="h-4 w-4 mr-2" />
            新建文件夹
          </Button>
        </div>

        {folders.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-gray-500">
                <FolderIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>暂无文件夹</p>
                <Button
                  variant="outline"
                  className="mt-4 border-teal-600 text-teal-600 hover:bg-teal-50"
                  onClick={onCreateFolder}
                >
                  创建第一个文件夹
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
                    key={folder.id}
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
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 导入的文件夹 */}
      {importedFolders.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-6">导入的文件夹</h2>
          <Card>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {importedFolders.map((folder) => (
                  <UnifiedFolderCard
                    key={folder.id}
                    folder={folder}
                    promptCount={folder.prompt_count || 0}
                    type="imported"
                    isDragOver={dragOverFolder === folder.id}
                    onDelete={onDeleteFolder}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}

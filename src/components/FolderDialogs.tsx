'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Locale } from '@/lib/i18n'
import type { Folder } from '@/types'

interface NewFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folderName: string
  onFolderNameChange: (name: string) => void
  onSubmit: () => Promise<void> | void
  loading: boolean
  locale?: Locale
}

const folderDialogCopy = {
  zh: {
    newFolderTitle: '新建收藏集',
    folderName: '收藏集名称',
    folderNamePlaceholder: '输入一个清晰、易检索的名称',
    cancel: '取消',
    creating: '创建中…',
    createFolder: '创建收藏集',
    selectTitle: '加入收藏集',
    selectDescription: '选择一个收藏集来组织这条提示词。',
    emptyCollections: '还没有可用的收藏集，请先在左侧新建。',
    adding: '添加中…',
  },
  en: {
    newFolderTitle: 'New collection',
    folderName: 'Collection name',
    folderNamePlaceholder: 'Enter a clear, searchable name',
    cancel: 'Cancel',
    creating: 'Creating…',
    createFolder: 'Create collection',
    selectTitle: 'Add to collection',
    selectDescription: 'Choose a collection to organize this prompt.',
    emptyCollections: 'No collections are available yet. Create one from the collection rail first.',
    adding: 'Adding…',
  },
} as const

export function NewFolderDialog({
  open,
  onOpenChange,
  folderName,
  onFolderNameChange,
  onSubmit,
  loading,
  locale = 'zh',
}: NewFolderDialogProps) {
  const copy = folderDialogCopy[locale]

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!loading) onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className="max-w-md rounded-[10px] border-[var(--np-rule)] bg-[var(--np-surface-raised)] text-[var(--np-ink)]"
        aria-busy={loading}
        onEscapeKeyDown={(event) => {
          if (loading) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (loading) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl tracking-[-0.02em]">{copy.newFolderTitle}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            void onSubmit()
          }}
        >
          <div className="space-y-2">
            <label htmlFor="new-collection-name" className="text-sm font-medium">
              {copy.folderName}
            </label>
            <Input
              id="new-collection-name"
              value={folderName}
              onChange={(event) => onFolderNameChange(event.target.value)}
              placeholder={copy.folderNamePlaceholder}
              maxLength={120}
              autoComplete="off"
              autoFocus
              disabled={loading}
              className="min-h-11 border-[var(--np-rule)] bg-[var(--np-surface)] text-[var(--np-ink)] placeholder:text-[var(--np-ink-muted)]"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="min-h-11 border-[var(--np-rule)] bg-transparent text-[var(--np-ink)] hover:bg-[var(--np-surface-soft)]"
            >
              {copy.cancel}
            </Button>
            <Button
              type="submit"
              disabled={loading || !folderName.trim()}
              className="min-h-11 bg-[var(--np-accent)] font-semibold text-[var(--np-ink)] hover:bg-[var(--np-accent-hover)]"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              {loading ? copy.creating : copy.createFolder}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface FolderSelectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folders: Folder[]
  onSelectFolder: (folderId: number) => Promise<void> | void
  locale?: Locale
}

export function FolderSelectDialog({
  open,
  onOpenChange,
  folders,
  onSelectFolder,
  locale = 'zh',
}: FolderSelectDialogProps) {
  const copy = folderDialogCopy[locale]
  const [pendingFolderId, setPendingFolderId] = useState<number | null>(null)

  const handleSelect = async (folderId: number) => {
    if (pendingFolderId !== null) return
    setPendingFolderId(folderId)
    try {
      await onSelectFolder(folderId)
    } finally {
      setPendingFolderId(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (pendingFolderId === null) onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className="max-w-md rounded-[10px] border-[var(--np-rule)] bg-[var(--np-surface-raised)] text-[var(--np-ink)]"
        aria-busy={pendingFolderId !== null}
        onEscapeKeyDown={(event) => {
          if (pendingFolderId !== null) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (pendingFolderId !== null) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl tracking-[-0.02em]">{copy.selectTitle}</DialogTitle>
          <DialogDescription className="leading-6 text-[var(--np-ink-muted)]">
            {copy.selectDescription}
          </DialogDescription>
        </DialogHeader>

        {folders.length === 0 ? (
          <p className="rounded-[8px] border border-[var(--np-rule)] bg-[var(--np-surface-soft)] px-4 py-5 text-sm leading-6 text-[var(--np-ink-muted)]">
            {copy.emptyCollections}
          </p>
        ) : (
          <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {folders.map((folder) => (
              <Button
                key={folder.id}
                type="button"
                variant="outline"
                disabled={pendingFolderId !== null}
                onClick={() => void handleSelect(folder.id)}
                className="min-h-11 min-w-0 justify-start border-[var(--np-rule)] bg-[var(--np-surface)] text-[var(--np-ink)] hover:bg-[var(--np-surface-soft)]"
              >
                {pendingFolderId === folder.id ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : null}
                <span className="truncate">
                  {pendingFolderId === folder.id ? copy.adding : folder.name}
                </span>
              </Button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useId, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import {
  Archive,
  ExternalLink,
  Folder as FolderIcon,
  Library,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Locale } from '@/lib/i18n'
import type { Folder, ImportedFolder } from '@/types'

type DeleteCollectionKind = 'owned' | 'imported'

export interface PromptCollectionRailProps {
  folders: Folder[]
  importedFolders: ImportedFolder[]
  selectedFolderId: number | null
  locale?: Locale
  dragOverFolder: number | null
  onSelectFolder: (id: number | null) => void
  onCreateCollection: () => void
  onRenameOwned: (folderId: number, name: string) => Promise<void> | void
  onDeleteCollection: (kind: DeleteCollectionKind, id: number) => Promise<void> | void
  onPublishFolder: (id: number) => Promise<void> | void
  onViewImported: (folder: ImportedFolder) => void
  onDrop: (event: DragEvent<HTMLElement>, folderId: number) => void
  onDragOver: (event: DragEvent<HTMLElement>, folderId: number) => void
  onDragLeave: () => void
}

type PendingAction =
  | { kind: 'rename'; folder: Folder }
  | { kind: 'publish'; folder: Folder }
  | { kind: 'delete-owned'; folder: Folder }
  | { kind: 'delete-imported'; folder: ImportedFolder }
  | null

const collectionRailCopy = {
  zh: {
    title: '收藏集',
    createCollection: '新建收藏集',
    allPrompts: '全部提示词',
    owned: '我的收藏集',
    imported: '导入收藏集',
    emptyOwned: '还没有自建收藏集',
    emptyImported: '还没有导入收藏集',
    collectionCount: (count: number) => `${count} 个收藏集`,
    importedCount: (count: number) => `${count} 个导入收藏集`,
    promptCount: (count: number) => `${count} 个提示词`,
    moreActions: (name: string) => `${name}的更多操作`,
    rename: '重命名',
    publish: '发布',
    delete: '删除',
    removeImported: '移除导入收藏集',
    viewImported: '查看导入内容',
    renameTitle: '重命名收藏集',
    renameDescription: '为这个收藏集设置一个清晰、易检索的名称。',
    collectionName: '收藏集名称',
    publishTitle: '发布收藏集',
    publishDescription: (name: string) => `“${name}”的当前内容将公开到发现页，其他用户可以查看。`,
    deleteOwnedTitle: '删除收藏集',
    deleteOwnedDescription: (name: string) => `确定删除“${name}”吗？此操作无法撤销。`,
    deleteImportedTitle: '移除导入收藏集',
    deleteImportedDescription: (name: string) => `确定移除“${name}”吗？原始公开内容不会受到影响。`,
    cancel: '取消',
    save: '保存名称',
    confirmPublish: '确认发布',
    confirmDelete: '确认删除',
    confirmRemove: '确认移除',
    working: '处理中',
    nameRequired: '请输入收藏集名称。',
    renameFailed: '重命名失败，请稍后重试。',
    publishFailed: '发布失败，请稍后重试。',
    deleteFailed: '删除失败，请稍后重试。',
    openCollection: (name: string) => `打开收藏集：${name}`,
    openImported: (name: string) => `查看导入收藏集：${name}`,
  },
  en: {
    title: 'Collections',
    createCollection: 'New collection',
    allPrompts: 'All prompts',
    owned: 'Your collections',
    imported: 'Imported collections',
    emptyOwned: 'No collections yet',
    emptyImported: 'No imported collections yet',
    collectionCount: (count: number) => `${count} ${count === 1 ? 'collection' : 'collections'}`,
    importedCount: (count: number) => `${count} imported ${count === 1 ? 'collection' : 'collections'}`,
    promptCount: (count: number) => `${count} ${count === 1 ? 'prompt' : 'prompts'}`,
    moreActions: (name: string) => `More actions for ${name}`,
    rename: 'Rename',
    publish: 'Publish',
    delete: 'Delete',
    removeImported: 'Remove imported collection',
    viewImported: 'View imported content',
    renameTitle: 'Rename collection',
    renameDescription: 'Give this collection a clear, searchable name.',
    collectionName: 'Collection name',
    publishTitle: 'Publish collection',
    publishDescription: (name: string) => `The current contents of “${name}” will become visible in Discover.`,
    deleteOwnedTitle: 'Delete collection',
    deleteOwnedDescription: (name: string) => `Delete “${name}”? This action cannot be undone.`,
    deleteImportedTitle: 'Remove imported collection',
    deleteImportedDescription: (name: string) => `Remove “${name}”? The original publication will not be affected.`,
    cancel: 'Cancel',
    save: 'Save name',
    confirmPublish: 'Publish',
    confirmDelete: 'Delete',
    confirmRemove: 'Remove',
    working: 'Working',
    nameRequired: 'Enter a collection name.',
    renameFailed: 'Could not rename the collection. Try again.',
    publishFailed: 'Could not publish the collection. Try again.',
    deleteFailed: 'Could not remove the collection. Try again.',
    openCollection: (name: string) => `Open collection: ${name}`,
    openImported: (name: string) => `View imported collection: ${name}`,
  },
} as const

export default function PromptCollectionRail({
  folders,
  importedFolders,
  selectedFolderId,
  locale = 'zh',
  dragOverFolder,
  onSelectFolder,
  onCreateCollection,
  onRenameOwned,
  onDeleteCollection,
  onPublishFolder,
  onViewImported,
  onDrop,
  onDragOver,
  onDragLeave,
}: PromptCollectionRailProps) {
  const copy = collectionRailCopy[locale]
  const railTitleId = useId()
  const ownedTitleId = useId()
  const importedTitleId = useId()
  const renameInputId = useId()
  const [action, setAction] = useState<PendingAction>(null)
  const [draftName, setDraftName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState('')

  const openAction = (nextAction: Exclude<PendingAction, null>) => {
    setActionError('')
    setIsSubmitting(false)
    setDraftName(nextAction.kind === 'rename' ? nextAction.folder.name : '')
    setAction(nextAction)
  }

  const closeAction = () => {
    if (isSubmitting) return
    setAction(null)
    setActionError('')
    setDraftName('')
  }

  const handleActionOpenChange = (open: boolean) => {
    if (!open) closeAction()
  }

  const handleConfirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!action || isSubmitting) return

    if (action.kind === 'rename' && !draftName.trim()) {
      setActionError(copy.nameRequired)
      return
    }

    setActionError('')
    setIsSubmitting(true)

    try {
      if (action.kind === 'rename') {
        await onRenameOwned(action.folder.id, draftName.trim())
      } else if (action.kind === 'publish') {
        await onPublishFolder(action.folder.id)
      } else if (action.kind === 'delete-owned') {
        await onDeleteCollection('owned', action.folder.id)
      } else {
        await onDeleteCollection('imported', action.folder.id)
      }

      setAction(null)
      setDraftName('')
    } catch {
      if (action.kind === 'rename') setActionError(copy.renameFailed)
      else if (action.kind === 'publish') setActionError(copy.publishFailed)
      else setActionError(copy.deleteFailed)
    } finally {
      setIsSubmitting(false)
    }
  }

  const getDialogContent = () => {
    if (!action) return null

    if (action.kind === 'rename') {
      return {
        title: copy.renameTitle,
        description: copy.renameDescription,
        confirmLabel: copy.save,
        destructive: false,
      }
    }

    if (action.kind === 'publish') {
      return {
        title: copy.publishTitle,
        description: copy.publishDescription(action.folder.name),
        confirmLabel: copy.confirmPublish,
        destructive: false,
      }
    }

    if (action.kind === 'delete-owned') {
      return {
        title: copy.deleteOwnedTitle,
        description: copy.deleteOwnedDescription(action.folder.name),
        confirmLabel: copy.confirmDelete,
        destructive: true,
      }
    }

    return {
      title: copy.deleteImportedTitle,
      description: copy.deleteImportedDescription(action.folder.name),
      confirmLabel: copy.confirmRemove,
      destructive: true,
    }
  }

  const dialogContent = getDialogContent()
  const describeItem = (label: string, count: number) =>
    `${label}${locale === 'zh' ? '，' : ', '}${copy.promptCount(count)}`

  return (
    <>
      <aside
        className="flex h-full min-h-0 w-full flex-col border-r border-[var(--np-rule)] bg-[var(--np-surface)]"
        aria-labelledby={railTitleId}
      >
        <div className="flex min-h-16 items-center justify-between gap-3 border-b border-[var(--np-rule)] px-3 py-2">
          <h2 id={railTitleId} className="px-2 text-sm font-semibold text-[var(--np-ink)]">
            {copy.title}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 text-[var(--np-ink-muted)] hover:bg-[var(--np-accent-soft)] hover:text-[var(--np-accent-strong)]"
            onClick={onCreateCollection}
            aria-label={copy.createCollection}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-label={copy.title}>
          <ul className="space-y-1">
            <li>
              <button
                type="button"
                onClick={() => onSelectFolder(null)}
                aria-pressed={selectedFolderId === null}
                className={cn(
                  'flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--np-accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--np-surface)]',
                  selectedFolderId === null
                    ? 'bg-[var(--np-accent-soft)] font-semibold text-[var(--np-ink)]'
                    : 'text-[var(--np-ink-muted)] hover:bg-[var(--np-surface-soft)] hover:text-[var(--np-ink)]',
                )}
              >
                <Library className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{copy.allPrompts}</span>
              </button>
            </li>
          </ul>

          <section className="mt-6" aria-labelledby={ownedTitleId}>
            <div className="mb-2 flex items-center justify-between gap-2 px-3">
              <h3
                id={ownedTitleId}
                className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--np-ink-muted)]"
              >
                {copy.owned}
              </h3>
              <span
                className="font-mono text-[11px] tabular-nums text-[var(--np-ink-muted)]"
                aria-label={copy.collectionCount(folders.length)}
              >
                {folders.length}
              </span>
            </div>

            {folders.length === 0 ? (
              <p className="px-3 py-2 text-sm leading-5 text-[var(--np-ink-muted)]">{copy.emptyOwned}</p>
            ) : (
              <ul className="space-y-1">
                {folders.map((folder) => {
                  const isSelected = selectedFolderId === folder.id
                  const isDragTarget = dragOverFolder === folder.id
                  const promptCount = folder.prompt_count ?? 0

                  return (
                    <li
                      key={folder.id}
                      className={cn(
                        'group flex min-h-11 items-stretch rounded-md transition-colors duration-150',
                        isDragTarget
                          ? 'bg-[var(--np-accent-soft)] ring-1 ring-inset ring-[var(--np-accent-strong)]'
                          : isSelected
                            ? 'bg-[var(--np-accent-soft)]'
                            : 'hover:bg-[var(--np-surface-soft)]',
                      )}
                      onDrop={(event) => onDrop(event, folder.id)}
                      onDragOver={(event) => onDragOver(event, folder.id)}
                      onDragLeave={(event) => {
                        const nextTarget = event.relatedTarget
                        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
                        onDragLeave()
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectFolder(folder.id)}
                        aria-pressed={isSelected}
                        aria-label={describeItem(copy.openCollection(folder.name), promptCount)}
                        className={cn(
                          'flex min-w-0 flex-1 items-center gap-3 rounded-l-md px-3 py-2 text-left text-sm',
                          'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--np-accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--np-surface)]',
                          isSelected ? 'font-semibold text-[var(--np-ink)]' : 'text-[var(--np-ink-muted)]',
                        )}
                      >
                        <FolderIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                        <span
                          className="font-mono text-[11px] tabular-nums text-[var(--np-ink-muted)]"
                          aria-hidden="true"
                        >
                          {promptCount}
                        </span>
                      </button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 shrink-0 rounded-l-none text-[var(--np-ink-muted)] hover:bg-transparent hover:text-[var(--np-ink)]"
                            aria-label={copy.moreActions(folder.name)}
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" side="right" className="w-48">
                          <DropdownMenuItem onSelect={() => openAction({ kind: 'rename', folder })}>
                            <Pencil aria-hidden="true" />
                            {copy.rename}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={promptCount === 0}
                            onSelect={() => openAction({ kind: 'publish', folder })}
                          >
                            <Upload aria-hidden="true" />
                            {copy.publish}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => openAction({ kind: 'delete-owned', folder })}
                          >
                            <Trash2 aria-hidden="true" />
                            {copy.delete}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="mt-6" aria-labelledby={importedTitleId}>
            <div className="mb-2 flex items-center justify-between gap-2 px-3">
              <h3
                id={importedTitleId}
                className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--np-ink-muted)]"
              >
                {copy.imported}
              </h3>
              <span
                className="font-mono text-[11px] tabular-nums text-[var(--np-ink-muted)]"
                aria-label={copy.importedCount(importedFolders.length)}
              >
                {importedFolders.length}
              </span>
            </div>

            {importedFolders.length === 0 ? (
              <p className="px-3 py-2 text-sm leading-5 text-[var(--np-ink-muted)]">{copy.emptyImported}</p>
            ) : (
              <ul className="space-y-1">
                {importedFolders.map((folder) => {
                  const promptCount = folder.prompt_count ?? 0

                  return (
                    <li
                      key={folder.id}
                      className="group flex min-h-11 items-stretch rounded-md text-[var(--np-ink-muted)] transition-colors duration-150 hover:bg-[var(--np-surface-soft)]"
                    >
                      <button
                        type="button"
                        onClick={() => onViewImported(folder)}
                        aria-label={describeItem(copy.openImported(folder.name), promptCount)}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-l-md px-3 py-2 text-left text-sm focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--np-accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--np-surface)]"
                      >
                        <Archive className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                        <span
                          className="font-mono text-[11px] tabular-nums text-[var(--np-ink-muted)]"
                          aria-hidden="true"
                        >
                          {promptCount}
                        </span>
                      </button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 shrink-0 rounded-l-none text-[var(--np-ink-muted)] hover:bg-transparent hover:text-[var(--np-ink)]"
                            aria-label={copy.moreActions(folder.name)}
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" side="right" className="w-48">
                          <DropdownMenuItem onSelect={() => onViewImported(folder)}>
                            <ExternalLink aria-hidden="true" />
                            {copy.viewImported}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => openAction({ kind: 'delete-imported', folder })}
                          >
                            <Trash2 aria-hidden="true" />
                            {copy.removeImported}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </nav>
      </aside>

      <Dialog open={action !== null} onOpenChange={handleActionOpenChange}>
        {dialogContent && (
          <DialogContent
            className="max-w-md border-[var(--np-rule)] bg-[var(--np-surface-raised)] text-[var(--np-ink)]"
            onEscapeKeyDown={(event) => {
              if (isSubmitting) event.preventDefault()
            }}
            onPointerDownOutside={(event) => {
              if (isSubmitting) event.preventDefault()
            }}
          >
            <form onSubmit={handleConfirm} className="space-y-5" aria-busy={isSubmitting}>
              <DialogHeader>
                <DialogTitle>{dialogContent.title}</DialogTitle>
                <DialogDescription className="leading-6 text-[var(--np-ink-muted)]">
                  {dialogContent.description}
                </DialogDescription>
              </DialogHeader>

              {action?.kind === 'rename' && (
                <div className="space-y-2">
                  <label htmlFor={renameInputId} className="text-sm font-medium text-[var(--np-ink)]">
                    {copy.collectionName}
                  </label>
                  <Input
                    id={renameInputId}
                    value={draftName}
                    onChange={(event) => {
                      setDraftName(event.target.value)
                      if (actionError) setActionError('')
                    }}
                    maxLength={120}
                    autoComplete="off"
                    autoFocus
                    disabled={isSubmitting}
                    className="min-h-11 border-[var(--np-rule)] bg-[var(--np-surface)] text-[var(--np-ink)]"
                  />
                </div>
              )}

              {actionError && (
                <p
                  role="alert"
                  aria-live="assertive"
                  className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {actionError}
                </p>
              )}

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 border-[var(--np-rule)] bg-transparent"
                  onClick={closeAction}
                  disabled={isSubmitting}
                >
                  {copy.cancel}
                </Button>
                <Button
                  type="submit"
                  variant={dialogContent.destructive ? 'destructive' : 'default'}
                  className="min-h-11"
                  disabled={isSubmitting || (action?.kind === 'rename' && !draftName.trim())}
                >
                  {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
                  {isSubmitting ? copy.working : dialogContent.confirmLabel}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}

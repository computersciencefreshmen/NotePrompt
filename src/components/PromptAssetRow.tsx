'use client'

import { useRef, useState, type DragEvent } from 'react'
import {
  Edit3,
  FolderPlus,
  GripVertical,
  MoreHorizontal,
  Send,
  Trash2,
} from 'lucide-react'
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
import type { Locale } from '@/lib/i18n'
import type { Prompt } from '@/types'

interface PromptAssetRowProps {
  prompt: Prompt
  locale?: Locale
  onOpen: (prompt: Prompt) => void
  onEdit: (id: number) => void
  onDelete: (id: number) => Promise<void> | void
  onPublish: (prompt: Prompt) => Promise<void> | void
  onAddToCollection: (id: number) => void
  draggable?: boolean
  onDragStart?: (event: DragEvent<HTMLElement>, prompt: Prompt) => void
}

type ConfirmAction = 'delete' | 'publish'

const assetRowCopy = {
  zh: {
    updated: '更新于',
    collections: '收藏集',
    tags: '标签',
    actions: (title: string) => `${title}的操作`,
    edit: '编辑',
    addToCollection: '加入收藏集',
    publish: '发布',
    delete: '删除',
    cancel: '取消',
    publishing: '发布中…',
    deleting: '删除中…',
    publishTitle: (title: string) => `发布「${title}」？`,
    publishDescription: (title: string) =>
      `提交「${title}」的发布请求。完成后请前往发现页核对实际公开内容。`,
    deleteTitle: (title: string) => `删除「${title}」？`,
    deleteDescription: (title: string) =>
      `「${title}」将从您的资产库中永久删除。此操作无法撤销。`,
    publishFailed: '发布失败，请检查后重试。',
    deleteFailed: '删除失败，请检查后重试。',
    open: (title: string) => `打开提示词「${title}」`,
    dateLocale: 'zh-CN',
  },
  en: {
    updated: 'Updated',
    collections: 'Collections',
    tags: 'Tags',
    actions: (title: string) => `Actions for ${title}`,
    edit: 'Edit',
    addToCollection: 'Add to collection',
    publish: 'Publish',
    delete: 'Delete',
    cancel: 'Cancel',
    publishing: 'Publishing…',
    deleting: 'Deleting…',
    publishTitle: (title: string) => `Publish “${title}”?`,
    publishDescription: (title: string) =>
      `Submit “${title}” for publishing. When it completes, review the public content in Discover.`,
    deleteTitle: (title: string) => `Delete “${title}”?`,
    deleteDescription: (title: string) =>
      `“${title}” will be permanently removed from your asset library. This action cannot be undone.`,
    publishFailed: 'Publishing failed. Review the issue and try again.',
    deleteFailed: 'Deletion failed. Review the issue and try again.',
    open: (title: string) => `Open prompt “${title}”`,
    dateLocale: 'en-US',
  },
}

function formatUpdatedAt(value: string, locale: Locale) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat(assetRowCopy[locale].dateLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function actionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

interface ConfirmationDialogProps {
  action: ConfirmAction
  open: boolean
  prompt: Prompt
  locale: Locale
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void> | void
}

function ConfirmationDialog({
  action,
  open,
  prompt,
  locale,
  onOpenChange,
  onConfirm,
}: ConfirmationDialogProps) {
  const copy = assetRowCopy[locale]
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const submittingRef = useRef(false)
  const isDelete = action === 'delete'

  const handleOpenChange = (nextOpen: boolean) => {
    if (submitting) return
    if (!nextOpen) setError('')
    onOpenChange(nextOpen)
  }

  const handleConfirm = async () => {
    if (submittingRef.current) return

    submittingRef.current = true
    setSubmitting(true)
    setError('')

    try {
      await onConfirm()
      onOpenChange(false)
    } catch (caughtError) {
      setError(
        actionErrorMessage(
          caughtError,
          isDelete ? copy.deleteFailed : copy.publishFailed,
        ),
      )
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-md rounded-[8px] border-[var(--np-rule)] bg-[var(--np-surface-raised)] text-[var(--np-ink)] shadow-[0_18px_48px_rgb(20_20_19_/_0.14)] [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center"
        aria-busy={submitting}
      >
        <DialogHeader>
          <DialogTitle className="pr-8 text-xl font-semibold leading-7 tracking-[-0.015em]">
            {isDelete
              ? copy.deleteTitle(prompt.title)
              : copy.publishTitle(prompt.title)}
          </DialogTitle>
          <DialogDescription className="pt-2 text-sm leading-6 text-[var(--np-ink-muted)]">
            {isDelete
              ? copy.deleteDescription(prompt.title)
              : copy.publishDescription(prompt.title)}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div
            role="alert"
            className="rounded-[6px] border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm leading-5 text-destructive"
          >
            {error}
          </div>
        ) : null}

        <DialogFooter className="mt-2 gap-2 sm:space-x-0">
          <button
            type="button"
            className="min-h-11 rounded-[8px] border border-[var(--np-rule)] bg-transparent px-4 text-sm font-medium text-[var(--np-ink)] transition-colors hover:bg-[var(--np-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            className={
              isDelete
                ? 'min-h-11 rounded-[8px] bg-destructive px-4 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50'
                : 'min-h-11 rounded-[8px] bg-[var(--np-accent)] px-4 text-sm font-semibold text-[var(--np-ink)] transition-colors hover:bg-[var(--np-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50'
            }
            onClick={() => void handleConfirm()}
            disabled={submitting}
          >
            {submitting
              ? isDelete
                ? copy.deleting
                : copy.publishing
              : isDelete
                ? copy.delete
                : copy.publish}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function PromptAssetRow({
  prompt,
  locale = 'zh',
  onOpen,
  onEdit,
  onDelete,
  onPublish,
  onAddToCollection,
  draggable = false,
  onDragStart,
}: PromptAssetRowProps) {
  const copy = assetRowCopy[locale]
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const updatedAt = formatUpdatedAt(prompt.updated_at, locale)
  const folderNames = Array.isArray(prompt.folder_names) ? prompt.folder_names : []
  const tags = Array.isArray(prompt.tags) ? prompt.tags : []

  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    if (!draggable) return
    onDragStart?.(event, prompt)
  }

  return (
    <>
      <article
        className="group relative grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[var(--np-rule)] bg-[var(--np-surface)] px-4 py-4 transition-colors duration-150 ease-out hover:bg-[var(--np-surface-raised)] sm:px-5"
        draggable={draggable}
        onDragStart={handleDragStart}
      >
        <button
          type="button"
          className="min-w-0 rounded-[6px] text-left"
          onClick={() => onOpen(prompt)}
          aria-label={copy.open(prompt.title)}
        >
          <span className="flex min-w-0 items-start gap-2">
            {draggable ? (
              <GripVertical
                className="mt-0.5 hidden h-4 w-4 shrink-0 cursor-grab text-[var(--np-ink-muted)] opacity-45 sm:block"
                aria-hidden="true"
              />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[1.0625rem] font-semibold leading-6 tracking-[-0.012em] text-[var(--np-ink)]">
                {prompt.title}
              </span>
              <span className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--np-ink-muted)]">
                {prompt.content}
              </span>
            </span>
          </span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] text-[var(--np-ink-muted)] transition-colors hover:bg-[var(--np-surface-soft)] hover:text-[var(--np-ink)]"
              aria-label={copy.actions(prompt.title)}
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-52 rounded-[8px] border-[var(--np-rule)] bg-[var(--np-surface-raised)] p-1.5 text-[var(--np-ink)] shadow-[0_10px_30px_rgb(20_20_19_/_0.12)]"
          >
            <DropdownMenuItem
              className="min-h-11 cursor-pointer rounded-[6px]"
              onSelect={() => onEdit(prompt.id)}
            >
              <Edit3 aria-hidden="true" />
              {copy.edit}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11 cursor-pointer rounded-[6px]"
              onSelect={() => onAddToCollection(prompt.id)}
            >
              <FolderPlus aria-hidden="true" />
              {copy.addToCollection}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11 cursor-pointer rounded-[6px]"
              onSelect={() => setConfirmAction('publish')}
            >
              <Send aria-hidden="true" />
              {copy.publish}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[var(--np-rule)]" />
            <DropdownMenuItem
              className="min-h-11 cursor-pointer rounded-[6px] text-destructive focus:bg-destructive/10 focus:text-destructive"
              onSelect={() => setConfirmAction('delete')}
            >
              <Trash2 aria-hidden="true" />
              {copy.delete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 pl-0 text-xs leading-5 text-[var(--np-ink-muted)] sm:pl-6">
          {updatedAt ? (
            <time dateTime={prompt.updated_at} className="font-mono">
              {copy.updated} {updatedAt}
            </time>
          ) : null}

          {folderNames.length > 0 ? (
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="sr-only">{copy.collections}:</span>
              {folderNames.map((folderName, index) => (
                <span
                  key={`${prompt.id}-folder-${index}-${folderName}`}
                  className="max-w-48 truncate rounded-[6px] border border-[var(--np-rule)] bg-[var(--np-surface-soft)] px-2 py-0.5 text-[var(--np-ink-muted)]"
                  title={folderName}
                >
                  {folderName}
                </span>
              ))}
            </span>
          ) : null}

          {tags.length > 0 ? (
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="sr-only">{copy.tags}:</span>
              {tags.map((tag, index) => (
                <span
                  key={`${prompt.id}-tag-${tag.id ?? index}`}
                  className="max-w-40 truncate rounded-[6px] bg-[var(--np-accent-soft)] px-2 py-0.5 text-[var(--np-accent-strong)]"
                  title={tag.name}
                >
                  {tag.name}
                </span>
              ))}
            </span>
          ) : null}
        </div>
      </article>

      <ConfirmationDialog
        action="publish"
        open={confirmAction === 'publish'}
        prompt={prompt}
        locale={locale}
        onOpenChange={(open) => setConfirmAction(open ? 'publish' : null)}
        onConfirm={() => onPublish(prompt)}
      />
      <ConfirmationDialog
        action="delete"
        open={confirmAction === 'delete'}
        prompt={prompt}
        locale={locale}
        onOpenChange={(open) => setConfirmAction(open ? 'delete' : null)}
        onConfirm={() => onDelete(prompt.id)}
      />
    </>
  )
}

export function PromptAssetRowSkeleton() {
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-3 border-b border-[var(--np-rule)] bg-[var(--np-surface)] px-4 py-4 sm:px-5"
      aria-hidden="true"
    >
      <div className="space-y-3">
        <div className="h-5 w-2/5 animate-pulse rounded-[6px] bg-[var(--np-surface-soft)] motion-reduce:animate-none" />
        <div className="space-y-2">
          <div className="h-3.5 w-full animate-pulse rounded-[6px] bg-[var(--np-surface-soft)] motion-reduce:animate-none" />
          <div className="h-3.5 w-11/12 animate-pulse rounded-[6px] bg-[var(--np-surface-soft)] motion-reduce:animate-none" />
          <div className="h-3.5 w-3/4 animate-pulse rounded-[6px] bg-[var(--np-surface-soft)] motion-reduce:animate-none" />
        </div>
      </div>
      <div className="h-11 w-11 animate-pulse rounded-[8px] bg-[var(--np-surface-soft)] motion-reduce:animate-none" />
      <div className="col-span-2 flex gap-2">
        <div className="h-5 w-28 animate-pulse rounded-[6px] bg-[var(--np-surface-soft)] motion-reduce:animate-none" />
        <div className="h-5 w-20 animate-pulse rounded-[6px] bg-[var(--np-surface-soft)] motion-reduce:animate-none" />
        <div className="h-5 w-16 animate-pulse rounded-[6px] bg-[var(--np-surface-soft)] motion-reduce:animate-none" />
      </div>
    </div>
  )
}

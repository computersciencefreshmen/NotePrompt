'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  FileText,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import type { AdminPrompt } from '@/types'

const CANDIDATE_PAGE_SIZE = 20

interface PromptCandidateDialogProps {
  folderId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => Promise<void> | void
}

export function PromptCandidateDialog({
  folderId,
  open,
  onOpenChange,
  onAdded,
}: PromptCandidateDialogProps) {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [prompts, setPrompts] = useState<AdminPrompt[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [selectedPublicPromptId, setSelectedPublicPromptId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const requestIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const cancelRequest = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    requestIdRef.current += 1
  }, [])

  const reset = useCallback(() => {
    cancelRequest()
    setSearch('')
    setPrompts([])
    setPage(0)
    setTotal(0)
    setTotalPages(0)
    setSelectedPublicPromptId(null)
    setError(null)
    setLoading(false)
    setLoadingMore(false)
  }, [cancelRequest])

  const fetchPage = useCallback(
    async (nextPage: number, query: string, append: boolean) => {
      cancelRequest()

      const requestId = requestIdRef.current
      const controller = new AbortController()
      abortRef.current = controller
      setError(null)

      if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
        setPrompts([])
        setPage(0)
        setTotal(0)
        setTotalPages(0)
      }

      try {
        const response = await api.admin.getAvailablePrompts({
          folderId,
          page: nextPage,
          limit: CANDIDATE_PAGE_SIZE,
          search: query || undefined,
          signal: controller.signal,
        })

        if (!response.success) {
          throw new Error(response.error || '无法读取已发布提示词')
        }
        if (requestIdRef.current !== requestId) return

        const nextPrompts = response.data ?? []
        setPrompts(previous => {
          if (!append) return nextPrompts
          const merged = new Map(previous.map(prompt => [prompt.id, prompt]))
          for (const prompt of nextPrompts) merged.set(prompt.id, prompt)
          return Array.from(merged.values())
        })
        setPage(response.pagination?.page ?? nextPage)
        setTotal(response.pagination?.total ?? nextPrompts.length)
        setTotalPages(response.pagination?.totalPages ?? 1)
      } catch (requestError) {
        if (requestIdRef.current !== requestId) return
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return

        setError(
          requestError instanceof Error ? requestError.message : '无法读取已发布提示词',
        )
        if (!append) setPrompts([])
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false)
          setLoadingMore(false)
          abortRef.current = null
        }
      }
    },
    [cancelRequest, folderId],
  )

  useEffect(() => {
    if (!open) return

    setSelectedPublicPromptId(null)
    const delay = search.trim() ? 300 : 0
    const timer = window.setTimeout(() => {
      void fetchPage(1, search.trim(), false)
    }, delay)

    return () => window.clearTimeout(timer)
  }, [fetchPage, open, search])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  useEffect(
    () => () => {
      cancelRequest()
    },
    [cancelRequest],
  )

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && adding) return
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  const handleAdd = async () => {
    if (!selectedPublicPromptId || adding) return

    setAdding(true)
    try {
      const response = await api.admin.addPublishedPromptToPublicFolder(
        folderId,
        selectedPublicPromptId,
      )
      if (!response.success) {
        throw new Error(response.error || '添加已发布提示词失败')
      }
    } catch (addError) {
      setAdding(false)
      toast({
        title: '添加失败',
        description: addError instanceof Error ? addError.message : '请稍后重试',
        variant: 'destructive',
      })
      return
    }

    setAdding(false)
    onOpenChange(false)
    reset()
    toast({
      title: '已添加到公共收藏集',
      description: '已保存当前公开版本的受审核快照；源发布撤回后将不再展示。',
      variant: 'success',
    })

    try {
      await onAdded()
    } catch (refreshError) {
      toast({
        title: '快照已添加，列表刷新失败',
        description: refreshError instanceof Error ? refreshError.message : '请手动刷新列表',
        variant: 'destructive',
      })
    }
  }

  const handleSearchChange = (value: string) => {
    cancelRequest()
    setSelectedPublicPromptId(null)
    setPrompts([])
    setError(null)
    setLoading(true)
    setSearch(value)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[min(88vh,48rem)] w-[calc(100%-1.5rem)] max-w-2xl overflow-hidden rounded-[10px] border-[var(--np-rule)] bg-[var(--np-surface)] p-0 text-[var(--np-ink)] shadow-[0_18px_48px_rgb(20_20_19_/_0.14)] [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center">
        <DialogHeader className="border-b border-[var(--np-rule)] bg-[var(--np-surface-raised)] px-5 py-5 pr-16 text-left sm:px-6">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--np-accent-strong)]">
            Published sources
          </p>
          <DialogTitle className="text-xl">添加已发布提示词</DialogTitle>
          <DialogDescription className="max-w-[65ch] text-sm leading-6 text-[var(--np-ink-muted)]">
            仅可选择仍处于发布状态的内容。添加后生成受审核快照，源发布撤回后自动隐藏。
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-[var(--np-rule)] px-5 py-4 sm:px-6">
            <label htmlFor="available-prompt-search" className="mb-2 block text-sm font-medium">
              搜索已发布内容
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--np-ink-muted)]"
                aria-hidden="true"
              />
              <Input
                id="available-prompt-search"
                placeholder="输入标题、正文或描述关键词"
                value={search}
                onChange={event => handleSearchChange(event.target.value)}
                className="min-h-11 border-[var(--np-rule)] bg-[var(--np-surface-raised)] pl-10 text-[var(--np-ink)] placeholder:text-[var(--np-ink-muted)]"
              />
            </div>
          </div>

          <div className="max-h-[46vh] min-h-56 overflow-y-auto px-3 py-3 sm:px-4">
            {loading ? (
              <div className="space-y-2" role="status" aria-live="polite" aria-label="正在加载已发布提示词">
                {[0, 1, 2].map(item => (
                  <div
                    key={item}
                    className="h-24 animate-pulse rounded-[8px] bg-[var(--np-surface-soft)] motion-reduce:animate-none"
                  />
                ))}
              </div>
            ) : error && prompts.length === 0 ? (
              <div
                className="flex min-h-56 flex-col items-center justify-center px-4 text-center"
                role="alert"
              >
                <AlertCircle
                  className="h-7 w-7 text-[var(--np-accent-strong)]"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-medium">候选内容加载失败</p>
                <p className="mt-1 max-w-md text-sm leading-6 text-[var(--np-ink-muted)]">
                  {error}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-5 min-h-11 border-[var(--np-rule)] bg-transparent"
                  onClick={() => void fetchPage(1, search.trim(), false)}
                >
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                  重试
                </Button>
              </div>
            ) : prompts.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center px-4 text-center">
                <FileText
                  className="h-7 w-7 text-[var(--np-accent-strong)]"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-medium">没有可添加的已发布内容</p>
                <p className="mt-1 max-w-sm text-sm leading-6 text-[var(--np-ink-muted)]">
                  尝试调整搜索词，或先确认提示词仍处于发布状态。
                </p>
              </div>
            ) : (
              <div className="space-y-2" role="radiogroup" aria-label="选择要添加的已发布提示词">
                {prompts.map(prompt => {
                  const selected = selectedPublicPromptId === prompt.id
                  return (
                    <label
                      key={prompt.id}
                      className={`grid min-h-11 cursor-pointer grid-cols-[minmax(0,1fr)_2.75rem] gap-3 rounded-[8px] border p-4 transition-colors duration-150 ease-out has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--np-accent-strong)] ${
                        selected
                          ? 'border-[var(--np-accent-strong)] bg-[var(--np-accent-soft)]'
                          : 'border-[var(--np-rule)] bg-[var(--np-surface-raised)] hover:bg-[var(--np-surface-soft)]'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">{prompt.title}</span>
                        <span className="mt-1 block text-xs text-[var(--np-ink-muted)]">
                          {prompt.author || '未知作者'}
                          <span aria-hidden="true"> · </span>
                          public:{prompt.id}
                        </span>
                        <span className="mt-2 line-clamp-2 block text-sm leading-5 text-[var(--np-ink-muted)]">
                          {prompt.description || prompt.content || '该提示词没有摘要。'}
                        </span>
                      </span>
                      <span
                        className={`flex h-11 w-11 items-center justify-center rounded-full border ${
                          selected
                            ? 'border-[var(--np-accent-strong)] bg-[var(--np-accent)] text-[var(--np-ink)]'
                            : 'border-[var(--np-rule)] bg-[var(--np-surface)] text-transparent'
                        }`}
                        aria-hidden="true"
                      >
                        <Check className="h-4 w-4" />
                      </span>
                      <input
                        type="radio"
                        name="available-prompt"
                        value={prompt.id}
                        checked={selected}
                        onChange={() => setSelectedPublicPromptId(prompt.id)}
                        className="sr-only"
                      />
                    </label>
                  )
                })}

                {error && (
                  <div
                    className="rounded-[8px] border border-[var(--np-rule)] bg-[var(--np-accent-soft)] p-4 text-sm"
                    role="alert"
                  >
                    <p>{error}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-2 min-h-11 px-2 text-[var(--np-accent-strong)]"
                      onClick={() => void fetchPage(page + 1, search.trim(), true)}
                    >
                      重试加载下一页
                    </Button>
                  </div>
                )}

                {page < totalPages && !error && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full border-[var(--np-rule)] bg-transparent text-[var(--np-ink)] hover:bg-[var(--np-surface-soft)]"
                    disabled={loadingMore}
                    onClick={() => void fetchPage(page + 1, search.trim(), true)}
                  >
                    {loadingMore ? (
                      <>
                        <Loader2
                          className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                          aria-hidden="true"
                        />
                        正在加载
                      </>
                    ) : (
                      '加载更多'
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>

          <footer className="flex flex-col-reverse gap-2 border-t border-[var(--np-rule)] bg-[var(--np-surface-raised)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p
              className="font-mono text-xs tabular-nums text-[var(--np-ink-muted)]"
              aria-live="polite"
            >
              {total > 0 ? `已加载 ${prompts.length} / ${total}` : '未选择内容'}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1 border-[var(--np-rule)] bg-transparent sm:flex-none"
                disabled={adding}
                onClick={() => handleOpenChange(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                className="min-h-11 flex-1 bg-[var(--np-accent)] text-[var(--np-ink)] hover:bg-[var(--np-accent-hover)] sm:flex-none"
                disabled={!selectedPublicPromptId || adding}
                onClick={() => void handleAdd()}
              >
                {adding ? (
                  <>
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                    正在添加
                  </>
                ) : (
                  '添加快照'
                )}
              </Button>
            </div>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  )
}

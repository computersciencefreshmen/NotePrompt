'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import type { AdminFolder, AdminFolderSnapshotPrompt } from '@/types'
import { PromptCandidateDialog } from './PromptCandidateDialog'

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return date.toLocaleDateString('zh-CN')
}

export default function AdminFolderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const hasAdminAccess = Boolean(user && (user.is_admin || user.user_type === 'admin'))
  const folderId = Number(params.id)

  const [folder, setFolder] = useState<AdminFolder | null>(null)
  const [prompts, setPrompts] = useState<AdminFolderSnapshotPrompt[]>([])
  const [promptPage, setPromptPage] = useState(1)
  const [promptTotal, setPromptTotal] = useState(0)
  const [promptTotalPages, setPromptTotalPages] = useState(0)
  const [loading, setLoading] = useState(false)
  const [folderError, setFolderError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [removingSnapshotIds, setRemovingSnapshotIds] = useState<Set<number>>(
    () => new Set(),
  )
  const folderRequestIdRef = useRef(0)

  const fetchFolderData = useCallback(
    async (page = 1) => {
      const requestId = ++folderRequestIdRef.current
      if (!Number.isInteger(folderId) || folderId <= 0) {
        setFolderError('收藏集地址无效')
        return
      }

      setLoading(true)
      setFolderError(null)
      try {
        const response = await api.admin.getPublicFolderPrompts(folderId, {
          page,
          limit: 20,
        })
        if (!response.success || !response.data) {
          throw new Error(response.error || '无法读取公共收藏集')
        }

        if (folderRequestIdRef.current !== requestId) return

        setFolder(response.data.folder)
        setPrompts(response.data.prompts)
        setPromptPage(response.pagination?.page ?? page)
        setPromptTotal(response.pagination?.total ?? response.data.prompts.length)
        setPromptTotalPages(response.pagination?.totalPages ?? 1)
      } catch (error) {
        if (folderRequestIdRef.current !== requestId) return
        const message = error instanceof Error ? error.message : '无法读取公共收藏集'
        setFolderError(message)
      } finally {
        if (folderRequestIdRef.current === requestId) setLoading(false)
      }
    },
    [folderId],
  )

  useEffect(() => {
    if (hasAdminAccess) void fetchFolderData()
  }, [fetchFolderData, hasAdminAccess])

  const handleRemovePrompt = async (snapshotId: number) => {
    if (removingSnapshotIds.has(snapshotId)) return

    setRemovingSnapshotIds(previous => new Set(previous).add(snapshotId))
    try {
      const response = await api.admin.removeSnapshotPromptFromPublicFolder(
        folderId,
        snapshotId,
      )
      if (!response.success) {
        throw new Error(response.error || '移除快照失败')
      }

      const nextPage = prompts.length === 1 && promptPage > 1 ? promptPage - 1 : promptPage
      await fetchFolderData(nextPage)
      toast({
        title: '已移除快照',
        description: '公共收藏集不再展示这条内容。',
        variant: 'success',
      })
    } catch (error) {
      toast({
        title: '移除失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      })
    } finally {
      setRemovingSnapshotIds(previous => {
        const next = new Set(previous)
        next.delete(snapshotId)
        return next
      })
    }
  }

  const filteredPrompts = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('zh-CN')
    if (!query) return prompts
    return prompts.filter(prompt =>
      [prompt.title, prompt.content, prompt.description, prompt.author]
        .filter(Boolean)
        .some(value => value?.toLocaleLowerCase('zh-CN').includes(query)),
    )
  }, [prompts, searchTerm])

  if (!hasAdminAccess) {
    return (
      <main className="np-product-surface flex min-h-screen items-center justify-center px-4">
        <section className="w-full max-w-md rounded-[10px] border border-[var(--np-rule)] bg-[var(--np-surface)] p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--np-accent-strong)]">
            Access restricted
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-[var(--np-ink)]">权限不足</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--np-ink-muted)]">
            当前账户没有公共内容审核权限。
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-6 min-h-11 border-[var(--np-rule)] bg-transparent text-[var(--np-ink)] hover:bg-[var(--np-surface-soft)]"
            onClick={() => router.push('/')}
          >
            返回首页
          </Button>
        </section>
      </main>
    )
  }

  return (
    <main className="np-product-surface min-h-screen bg-[var(--np-canvas)] text-[var(--np-ink)]">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 px-2 text-[var(--np-ink-muted)] hover:bg-[var(--np-surface-soft)] hover:text-[var(--np-ink)]"
          onClick={() => router.push('/admin')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          返回管理台
        </Button>

        {loading && !folder ? (
          <div className="mt-6 overflow-hidden rounded-[10px] border border-[var(--np-rule)] bg-[var(--np-surface)]">
            <div className="space-y-3 border-b border-[var(--np-rule)] px-5 py-7 sm:px-7">
              <div className="h-3 w-28 animate-pulse rounded bg-[var(--np-surface-soft)] motion-reduce:animate-none" />
              <div className="h-8 w-2/5 animate-pulse rounded bg-[var(--np-surface-soft)] motion-reduce:animate-none" />
              <div className="h-4 w-3/5 animate-pulse rounded bg-[var(--np-surface-soft)] motion-reduce:animate-none" />
            </div>
            <div className="space-y-1 px-5 py-4 sm:px-7">
              {[0, 1, 2].map(item => (
                <div
                  key={item}
                  className="h-24 animate-pulse border-b border-[var(--np-rule)] bg-[var(--np-surface)] motion-reduce:animate-none"
                />
              ))}
            </div>
          </div>
        ) : folderError && !folder ? (
          <section className="mt-6 rounded-[10px] border border-[var(--np-rule)] bg-[var(--np-surface)] px-6 py-10 text-center">
            <AlertCircle
              className="mx-auto h-7 w-7 text-[var(--np-accent-strong)]"
              aria-hidden="true"
            />
            <h1 className="mt-4 text-xl font-semibold">无法读取公共收藏集</h1>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--np-ink-muted)]">
              {folderError}
            </p>
            <Button
              type="button"
              className="mt-6 min-h-11 bg-[var(--np-accent)] text-[var(--np-ink)] hover:bg-[var(--np-accent-hover)]"
              onClick={() => void fetchFolderData()}
            >
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              重试
            </Button>
          </section>
        ) : folder ? (
          <section className="mt-6 overflow-hidden rounded-[10px] border border-[var(--np-rule)] bg-[var(--np-surface)] shadow-[0_18px_50px_rgb(20_20_19_/_0.055)]">
            <header className="border-b border-[var(--np-rule)] bg-[var(--np-surface-raised)] px-5 py-7 sm:px-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--np-accent-strong)]">
                    Public collection
                  </p>
                  <div className="mt-2 flex items-start gap-3">
                    <FolderOpen
                      className="mt-1 h-6 w-6 shrink-0 text-[var(--np-accent-strong)]"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
                        {folder.name}
                      </h1>
                      <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[var(--np-ink-muted)]">
                        {folder.description || '暂未填写收藏集说明。'}
                      </p>
                    </div>
                  </div>
                </div>
                {folder.is_featured && (
                  <Badge className="w-fit border border-[var(--np-rule)] bg-[var(--np-accent-soft)] text-[var(--np-accent-strong)] hover:bg-[var(--np-accent-soft)]">
                    精选
                  </Badge>
                )}
              </div>
              <dl className="mt-6 flex flex-wrap gap-x-7 gap-y-2 border-t border-[var(--np-rule)] pt-4 text-sm text-[var(--np-ink-muted)]">
                <div className="flex items-center gap-2">
                  <dt>维护者</dt>
                  <dd className="font-medium text-[var(--np-ink)]">{folder.author}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt>已验证快照</dt>
                  <dd className="font-mono tabular-nums text-[var(--np-ink)]">{promptTotal}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt>收藏集 ID</dt>
                  <dd className="font-mono tabular-nums text-[var(--np-ink)]">{folder.id}</dd>
                </div>
              </dl>
            </header>

            <div>
              <div className="flex flex-col gap-4 border-b border-[var(--np-rule)] px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7">
                <div>
                  <h2 className="text-lg font-semibold">公开快照</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--np-ink-muted)]">
                    这里只展示经过来源验证的已发布内容，快照 ID 不等于公开提示词 ID。
                  </p>
                </div>
                <Button
                  type="button"
                  className="min-h-11 shrink-0 bg-[var(--np-accent)] text-[var(--np-ink)] hover:bg-[var(--np-accent-hover)]"
                  onClick={() => setShowAddDialog(true)}
                >
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  从已发布内容添加
                </Button>
              </div>

              <div className="border-b border-[var(--np-rule)] px-5 py-4 sm:px-7">
                <div className="relative max-w-lg">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--np-ink-muted)]"
                    aria-hidden="true"
                  />
                  <Input
                    aria-label="筛选当前页的快照"
                    placeholder="筛选当前页标题、作者或正文"
                    value={searchTerm}
                    onChange={event => setSearchTerm(event.target.value)}
                    className="min-h-11 border-[var(--np-rule)] bg-[var(--np-surface-raised)] pl-10 text-[var(--np-ink)] placeholder:text-[var(--np-ink-muted)]"
                  />
                </div>
              </div>

              {folderError && (
                <div
                  className="mx-5 mt-5 flex flex-col gap-3 rounded-[8px] border border-[var(--np-rule)] bg-[var(--np-accent-soft)] p-4 text-sm sm:mx-7 sm:flex-row sm:items-center sm:justify-between"
                  role="alert"
                >
                  <span className="flex items-start gap-2 text-[var(--np-ink)]">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {folderError}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 border-[var(--np-rule)] bg-transparent"
                    onClick={() => void fetchFolderData(promptPage)}
                  >
                    重试
                  </Button>
                </div>
              )}

              {filteredPrompts.length === 0 ? (
                <div className="px-5 py-16 text-center sm:px-7">
                  <FileText
                    className="mx-auto h-8 w-8 text-[var(--np-accent-strong)]"
                    aria-hidden="true"
                  />
                  <h3 className="mt-4 text-lg font-semibold">
                    {searchTerm ? '当前页没有匹配快照' : '还没有公开快照'}
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--np-ink-muted)]">
                    {searchTerm
                      ? '清除筛选词，或切换到其他分页继续检查。'
                      : '从明确发布的提示词中选择内容，系统会保存受审核快照；源发布撤回后自动隐藏。'}
                  </p>
                </div>
              ) : (
                <div aria-live="polite">
                  {filteredPrompts.map(prompt => {
                    const removing = removingSnapshotIds.has(prompt.snapshot_id)
                    return (
                      <article
                        key={prompt.snapshot_id}
                        className="grid gap-4 border-b border-[var(--np-rule)] px-5 py-5 transition-colors duration-150 ease-out last:border-b-0 hover:bg-[var(--np-surface-raised)] sm:grid-cols-[minmax(0,1fr)_auto] sm:px-7"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold">{prompt.title}</h3>
                            <span className="rounded-[6px] border border-[var(--np-rule)] bg-[var(--np-surface-soft)] px-2 py-0.5 font-mono text-[10px] text-[var(--np-ink-muted)]">
                              snapshot:{prompt.snapshot_id}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-[var(--np-ink-muted)]">
                            {prompt.author || '未知作者'}
                            <span aria-hidden="true"> · </span>
                            <time dateTime={prompt.created_at}>{formatDate(prompt.created_at)}</time>
                          </p>
                          <p className="mt-3 line-clamp-2 max-w-[75ch] text-sm leading-6 text-[var(--np-ink-muted)]">
                            {prompt.description || prompt.content || '该快照没有摘要。'}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 w-full shrink-0 text-[var(--np-ink-muted)] hover:bg-[var(--np-accent-soft)] hover:text-[var(--np-accent-strong)] sm:w-11"
                          disabled={removing}
                          onClick={() => void handleRemovePrompt(prompt.snapshot_id)}
                          aria-label={`从公共收藏集移除快照：${prompt.title}`}
                        >
                          {removing ? (
                            <Loader2
                              className="h-4 w-4 animate-spin motion-reduce:animate-none"
                              aria-hidden="true"
                            />
                          ) : (
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          )}
                          <span className="ml-2 sm:sr-only">
                            {removing ? '正在移除' : '移除'}
                          </span>
                        </Button>
                      </article>
                    )
                  })}
                </div>
              )}

              {promptTotalPages > 1 && (
                <nav
                  className="flex flex-col gap-3 border-t border-[var(--np-rule)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7"
                  aria-label="公共收藏集快照分页"
                >
                  <p className="font-mono text-xs tabular-nums text-[var(--np-ink-muted)]">
                    {promptTotal} 条，第 {promptPage} / {promptTotalPages} 页
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 flex-1 border-[var(--np-rule)] bg-transparent sm:flex-none"
                      disabled={loading || promptPage <= 1}
                      onClick={() => void fetchFolderData(promptPage - 1)}
                    >
                      上一页
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 flex-1 border-[var(--np-rule)] bg-transparent sm:flex-none"
                      disabled={loading || promptPage >= promptTotalPages}
                      onClick={() => void fetchFolderData(promptPage + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                </nav>
              )}
            </div>
          </section>
        ) : null}
      </div>

      <PromptCandidateDialog
        folderId={folderId}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdded={() => fetchFolderData(promptPage)}
      />
    </main>
  )
}

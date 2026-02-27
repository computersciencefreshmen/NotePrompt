'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, FileText, Globe, Folder, X, Loader2, Command } from 'lucide-react'
import { api, SearchResults } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

export default function GlobalSearch() {
  const { user } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ctrl+K / Cmd+K to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      setQuery('')
      setResults(null)
      setSelectedIndex(0)
    }
  }, [open])

  // Debounced search
  const doSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim() || !user) {
      setResults(null)
      return
    }
    setLoading(true)
    try {
      const response = await api.search.query(keyword)
      if (response.success && response.data) {
        setResults(response.data)
        setSelectedIndex(0)
      }
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      doSearch(query)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, doSearch])

  // Build flat result list for keyboard navigation
  const allItems: Array<{ type: string; id: number; title: string; subtitle?: string; href: string }> = []
  if (results) {
    for (const item of results.userPrompts.items) {
      allItems.push({
        type: 'user_prompt',
        id: item.id,
        title: item.title,
        subtitle: item.content.substring(0, 80),
        href: `/prompts/edit/${item.id}`
      })
    }
    for (const item of results.publicPrompts.items) {
      allItems.push({
        type: 'public_prompt',
        id: item.id,
        title: item.title,
        subtitle: `by ${item.author} · ${item.content.substring(0, 60)}`,
        href: `/public-prompts/${item.id}`
      })
    }
    for (const item of results.folders.items) {
      allItems.push({
        type: 'folder',
        id: item.id,
        title: item.name,
        href: `/folders/${item.id}`
      })
    }
  }

  const handleSelect = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, allItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && allItems[selectedIndex]) {
      e.preventDefault()
      handleSelect(allItems[selectedIndex].href)
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'user_prompt': return <FileText className="h-4 w-4 text-teal-500" />
      case 'public_prompt': return <Globe className="h-4 w-4 text-blue-500" />
      case 'folder': return <Folder className="h-4 w-4 text-amber-500" />
      default: return <FileText className="h-4 w-4" />
    }
  }

  const getLabel = (type: string) => {
    switch (type) {
      case 'user_prompt': return '我的提示词'
      case 'public_prompt': return '公共提示词'
      case 'folder': return '文件夹'
      default: return ''
    }
  }

  if (!user) return null

  return (
    <>
      {/* Trigger button in header */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-700"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">搜索...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-600">
          <Command className="h-2.5 w-2.5" />K
        </kbd>
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
          onClick={() => setOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Search dialog */}
          <div
            className="relative w-full max-w-2xl mx-4 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="搜索提示词、文件夹..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none text-base"
              />
              {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto">
              {!query.trim() ? (
                <div className="py-12 text-center text-gray-400 dark:text-gray-500">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">输入关键词搜索提示词和文件夹</p>
                </div>
              ) : loading && !results ? (
                <div className="py-12 text-center text-gray-400">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  <p className="text-sm">搜索中...</p>
                </div>
              ) : allItems.length === 0 && query.trim() ? (
                <div className="py-12 text-center text-gray-400 dark:text-gray-500">
                  <p className="text-sm">未找到匹配结果</p>
                  <p className="text-xs mt-1">尝试不同的关键词</p>
                </div>
              ) : (
                <div className="py-2">
                  {/* User prompts section */}
                  {results && results.userPrompts.items.length > 0 && (
                    <div>
                      <div className="px-4 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                        我的提示词 ({results.userPrompts.total})
                      </div>
                      {results.userPrompts.items.map((item, idx) => {
                        const globalIdx = idx
                        return (
                          <button
                            key={`up-${item.id}`}
                            onClick={() => handleSelect(`/prompts/edit/${item.id}`)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                              selectedIndex === globalIdx
                                ? 'bg-teal-50 dark:bg-teal-900/20'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                            onMouseEnter={() => setSelectedIndex(globalIdx)}
                          >
                            <FileText className="h-4 w-4 text-teal-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {item.title}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {item.content.substring(0, 80)}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Public prompts section */}
                  {results && results.publicPrompts.items.length > 0 && (
                    <div>
                      <div className="px-4 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-1">
                        公共提示词 ({results.publicPrompts.total})
                      </div>
                      {results.publicPrompts.items.map((item, idx) => {
                        const globalIdx = (results?.userPrompts.items.length || 0) + idx
                        return (
                          <button
                            key={`pp-${item.id}`}
                            onClick={() => handleSelect(`/public-prompts/${item.id}`)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                              selectedIndex === globalIdx
                                ? 'bg-blue-50 dark:bg-blue-900/20'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                            onMouseEnter={() => setSelectedIndex(globalIdx)}
                          >
                            <Globe className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {item.title}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                by {item.author} · {item.content.substring(0, 60)}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Folders section */}
                  {results && results.folders.items.length > 0 && (
                    <div>
                      <div className="px-4 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-1">
                        文件夹
                      </div>
                      {results.folders.items.map((item, idx) => {
                        const globalIdx = (results?.userPrompts.items.length || 0) + (results?.publicPrompts.items.length || 0) + idx
                        return (
                          <button
                            key={`f-${item.id}`}
                            onClick={() => handleSelect(`/folders/${item.id}`)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                              selectedIndex === globalIdx
                                ? 'bg-amber-50 dark:bg-amber-900/20'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                            onMouseEnter={() => setSelectedIndex(globalIdx)}
                          >
                            <Folder className="h-4 w-4 text-amber-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {item.name}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-[11px] text-gray-400 dark:text-gray-500">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">↑↓</kbd> 导航
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">Enter</kbd> 打开
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">Esc</kbd> 关闭
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

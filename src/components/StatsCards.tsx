'use client'

import { useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FileText, Folder as FolderIcon, Sparkles, Heart } from 'lucide-react'
import AIUsageHeatmap from '@/components/AIUsageHeatmap'
import { Locale, withLocaleHref } from '@/lib/i18n'

interface UserStats {
  total_prompts: number
  total_folders: number
  monthly_usage: number
  total_favorites: number
  ai_optimize_count: number
}

interface StatsCardsProps {
  stats: UserStats | null
  locale?: Locale
}

const statsCopy = {
  zh: {
    totalPrompts: '总提示词',
    viewPrompts: '点击查看提示词',
    folders: '文件夹',
    viewFolders: '点击查看文件夹',
    monthlyAI: '本月 AI 使用',
    viewHeatmap: '点击查看热力图',
    favorites: '收藏数',
    viewFavorites: '点击查看收藏',
    aiStats: 'AI 使用统计',
  },
  en: {
    totalPrompts: 'Total prompts',
    viewPrompts: 'View prompts',
    folders: 'Folders',
    viewFolders: 'View folders',
    monthlyAI: 'AI usage this month',
    viewHeatmap: 'View heatmap',
    favorites: 'Favorites',
    viewFavorites: 'View favorites',
    aiStats: 'AI usage stats',
  },
}

const cardBase = 'cursor-pointer hover:shadow-md transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2'

function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (el) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }
}

function activateOnKeyboard(event: KeyboardEvent<HTMLDivElement>, action: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  action()
}

export default function StatsCards({ stats, locale = 'zh' }: StatsCardsProps) {
  const [heatmapOpen, setHeatmapOpen] = useState(false)
  const router = useRouter()
  const copy = statsCopy[locale]

  if (!stats) return null

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card
          className={`${cardBase} hover:border-blue-300`}
          onClick={() => scrollToSection('prompts-section')}
          onKeyDown={(event) => activateOnKeyboard(event, () => scrollToSection('prompts-section'))}
          role="button"
          tabIndex={0}
          aria-label={`${copy.totalPrompts}: ${stats.total_prompts}. ${copy.viewPrompts}`}
        >
          <CardContent className="p-6">
            <div className="flex items-center">
              <FileText className="h-8 w-8 text-blue-600 group-hover:scale-110 transition-transform" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{copy.totalPrompts}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total_prompts}</p>
                <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-0.5">{copy.viewPrompts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`${cardBase} hover:border-green-300`}
          onClick={() => scrollToSection('folders-section')}
          onKeyDown={(event) => activateOnKeyboard(event, () => scrollToSection('folders-section'))}
          role="button"
          tabIndex={0}
          aria-label={`${copy.folders}: ${stats.total_folders}. ${copy.viewFolders}`}
        >
          <CardContent className="p-6">
            <div className="flex items-center">
              <FolderIcon className="h-8 w-8 text-green-600 group-hover:scale-110 transition-transform" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{copy.folders}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total_folders}</p>
                <p className="text-[10px] text-green-500 dark:text-green-400 mt-0.5">{copy.viewFolders}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`${cardBase} hover:border-purple-300`}
          onClick={() => setHeatmapOpen(true)}
          onKeyDown={(event) => activateOnKeyboard(event, () => setHeatmapOpen(true))}
          role="button"
          tabIndex={0}
          aria-label={`${copy.monthlyAI}: ${stats.monthly_usage || 0}. ${copy.viewHeatmap}`}
        >
          <CardContent className="p-6">
            <div className="flex items-center">
              <Sparkles className="h-8 w-8 text-purple-600 group-hover:scale-110 transition-transform" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{copy.monthlyAI}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.monthly_usage || 0}</p>
                <p className="text-[10px] text-purple-500 dark:text-purple-400 mt-0.5">{copy.viewHeatmap}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`${cardBase} hover:border-orange-300`}
          onClick={() => router.push(withLocaleHref('/favorites', locale))}
          onKeyDown={(event) => activateOnKeyboard(event, () => router.push(withLocaleHref('/favorites', locale)))}
          role="button"
          tabIndex={0}
          aria-label={`${copy.favorites}: ${stats.total_favorites}. ${copy.viewFavorites}`}
        >
          <CardContent className="p-6">
            <div className="flex items-center">
              <Heart className="h-8 w-8 text-orange-600 group-hover:scale-110 transition-transform" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{copy.favorites}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total_favorites}</p>
                <p className="text-[10px] text-orange-500 dark:text-orange-400 mt-0.5">{copy.viewFavorites}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI 使用热力图弹窗 */}
      <Dialog open={heatmapOpen} onOpenChange={setHeatmapOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Sparkles className="h-5 w-5 mr-2 text-purple-600" />
              {copy.aiStats}
            </DialogTitle>
          </DialogHeader>
          <AIUsageHeatmap />
        </DialogContent>
      </Dialog>
    </>
  )
}

'use client'

import { useState } from 'react'
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

interface UserStats {
  total_prompts: number
  total_folders: number
  monthly_usage: number
  total_favorites: number
  ai_optimize_count: number
}

interface StatsCardsProps {
  stats: UserStats | null
}

const cardBase = 'cursor-pointer hover:shadow-md transition-all group'

function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

export default function StatsCards({ stats }: StatsCardsProps) {
  const [heatmapOpen, setHeatmapOpen] = useState(false)
  const router = useRouter()

  if (!stats) return null

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card
          className={`${cardBase} hover:border-blue-300`}
          onClick={() => scrollToSection('prompts-section')}
        >
          <CardContent className="p-6">
            <div className="flex items-center">
              <FileText className="h-8 w-8 text-blue-600 group-hover:scale-110 transition-transform" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">总提示词</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total_prompts}</p>
                <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-0.5">点击查看提示词</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`${cardBase} hover:border-green-300`}
          onClick={() => scrollToSection('folders-section')}
        >
          <CardContent className="p-6">
            <div className="flex items-center">
              <FolderIcon className="h-8 w-8 text-green-600 group-hover:scale-110 transition-transform" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">文件夹</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total_folders}</p>
                <p className="text-[10px] text-green-500 dark:text-green-400 mt-0.5">点击查看文件夹</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`${cardBase} hover:border-purple-300`}
          onClick={() => setHeatmapOpen(true)}
        >
          <CardContent className="p-6">
            <div className="flex items-center">
              <Sparkles className="h-8 w-8 text-purple-600 group-hover:scale-110 transition-transform" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">本月优化</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.ai_optimize_count || 0}</p>
                <p className="text-[10px] text-purple-500 dark:text-purple-400 mt-0.5">点击查看热力图</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`${cardBase} hover:border-orange-300`}
          onClick={() => router.push('/favorites')}
        >
          <CardContent className="p-6">
            <div className="flex items-center">
              <Heart className="h-8 w-8 text-orange-600 group-hover:scale-110 transition-transform" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">收藏数</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total_favorites}</p>
                <p className="text-[10px] text-orange-500 dark:text-orange-400 mt-0.5">点击查看收藏</p>
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
              AI 使用统计
            </DialogTitle>
          </DialogHeader>
          <AIUsageHeatmap />
        </DialogContent>
      </Dialog>
    </>
  )
}

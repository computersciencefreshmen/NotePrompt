'use client'

import { Card, CardContent } from '@/components/ui/card'
import { FileText, Folder as FolderIcon, Sparkles, BarChart3 } from 'lucide-react'

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

export default function StatsCards({ stats }: StatsCardsProps) {
  if (!stats) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center">
            <FileText className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">总提示词</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total_prompts}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center">
            <FolderIcon className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">文件夹</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total_folders}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center">
            <Sparkles className="h-8 w-8 text-purple-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">本月优化</p>
              <p className="text-2xl font-bold text-gray-900">{stats.ai_optimize_count || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center">
            <BarChart3 className="h-8 w-8 text-orange-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">收藏数</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total_favorites}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

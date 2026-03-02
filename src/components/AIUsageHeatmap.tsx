'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Flame, Calendar, TrendingUp } from 'lucide-react'
import { api } from '@/lib/api'

interface DailyData {
  usage_date: string
  optimize_count: number
  generate_count: number
  total_count: number
}

interface HeatmapData {
  daily: DailyData[]
  summary: {
    totalOptimize: number
    totalGenerate: number
    totalAll: number
    maxDaily: number
    activeDays: number
    totalDays: number
  }
}

// 颜色等级 (GitHub 风格)
function getColor(count: number, max: number): string {
  if (count === 0) return 'bg-gray-100 dark:bg-gray-800'
  const ratio = count / Math.max(max, 1)
  if (ratio <= 0.25) return 'bg-emerald-200 dark:bg-emerald-900'
  if (ratio <= 0.5) return 'bg-emerald-400 dark:bg-emerald-700'
  if (ratio <= 0.75) return 'bg-emerald-500 dark:bg-emerald-500'
  return 'bg-emerald-700 dark:bg-emerald-400'
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

export default function AIUsageHeatmap() {
  const [data, setData] = useState<HeatmapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [hoveredDay, setHoveredDay] = useState<{ date: string; count: number; x: number; y: number } | null>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const res = await api.user.getHeatmap()
      if (res.success && res.data) {
        setData(res.data)
      }
    } catch (error) {
      console.error('Failed to fetch heatmap data:', error)
    } finally {
      setLoading(false)
    }
  }

  // 构建热力图网格 (26 周 = ~6 个月)
  const { weeks, monthLabels, maxCount } = useMemo(() => {
    if (!data) return { weeks: [], monthLabels: [], maxCount: 0 }

    const dailyMap = new Map<string, number>()
    let maxCount = 0
    for (const d of data.daily) {
      const dateStr = new Date(d.usage_date).toISOString().split('T')[0]
      dailyMap.set(dateStr, d.total_count)
      if (d.total_count > maxCount) maxCount = d.total_count
    }

    const today = new Date()
    const todayDay = today.getDay() // 0=Sun
    // 计算起点：26 周前的周日
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - (26 * 7) - todayDay)

    const weeks: Array<Array<{ date: string; count: number; inRange: boolean }>> = []
    const monthLabels: Array<{ label: string; col: number }> = []
    let lastMonth = -1

    const cursor = new Date(startDate)
    let weekIdx = 0

    while (cursor <= today) {
      const week: Array<{ date: string; count: number; inRange: boolean }> = []
      for (let dow = 0; dow < 7; dow++) {
        if (cursor > today) {
          week.push({ date: '', count: 0, inRange: false })
        } else {
          const dateStr = cursor.toISOString().split('T')[0]
          const month = cursor.getMonth()
          if (month !== lastMonth) {
            monthLabels.push({ label: MONTHS[month], col: weekIdx })
            lastMonth = month
          }
          week.push({
            date: dateStr,
            count: dailyMap.get(dateStr) || 0,
            inRange: true,
          })
        }
        cursor.setDate(cursor.getDate() + 1)
      }
      weeks.push(week)
      weekIdx++
    }

    return { weeks, monthLabels, maxCount }
  }, [data])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-500">加载热力图...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">
          暂无使用数据
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center text-lg">
            <Sparkles className="h-5 w-5 mr-2 text-emerald-600" />
            AI 使用热力图
          </CardTitle>
          <div className="flex items-center space-x-3 text-xs text-gray-500">
            <span>过去 6 个月</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* 统计摘要 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="flex items-center space-x-2 bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2">
            <Flame className="h-4 w-4 text-orange-500" />
            <div>
              <p className="text-xs text-gray-500">活跃天数</p>
              <p className="font-bold text-sm">{data.summary.activeDays} 天</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            <div>
              <p className="text-xs text-gray-500">总优化次数</p>
              <p className="font-bold text-sm">{data.summary.totalOptimize}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-xs text-gray-500">总生成次数</p>
              <p className="font-bold text-sm">{data.summary.totalGenerate}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2">
            <Calendar className="h-4 w-4 text-emerald-500" />
            <div>
              <p className="text-xs text-gray-500">单日最高</p>
              <p className="font-bold text-sm">{data.summary.maxDaily} 次</p>
            </div>
          </div>
        </div>

        {/* 热力图 */}
        <div className="relative overflow-x-auto" ref={containerRef}>
          {/* 月份标签 */}
          <div className="flex ml-8 mb-1">
            {monthLabels.map((m, i) => (
              <div
                key={i}
                className="text-[10px] text-gray-400 absolute"
                style={{ left: `${m.col * 15 + 32}px` }}
              >
                {m.label}
              </div>
            ))}
          </div>

          <div className="flex mt-4">
            {/* 星期标签 */}
            <div className="flex flex-col mr-1 mt-0">
              {WEEKDAYS.map((d, i) => (
                <div
                  key={i}
                  className="h-[13px] text-[9px] text-gray-400 flex items-center justify-end pr-1"
                  style={{ height: '13px', marginBottom: '2px' }}
                >
                  {i % 2 === 1 ? d : ''}
                </div>
              ))}
            </div>

            {/* 格子 */}
            <div className="flex gap-[2px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[2px]">
                  {week.map((day, di) => (
                    <div
                      key={di}
                      className={`w-[11px] h-[11px] rounded-[2px] transition-colors ${
                        day.inRange ? getColor(day.count, maxCount) : 'bg-transparent'
                      } ${day.inRange ? 'hover:ring-1 hover:ring-gray-400 cursor-pointer' : ''}`}
                      onMouseEnter={(e) => {
                        if (day.inRange && day.date && containerRef.current) {
                          const cellRect = e.currentTarget.getBoundingClientRect()
                          const containerRect = containerRef.current.getBoundingClientRect()
                          setHoveredDay({
                            date: day.date,
                            count: day.count,
                            x: cellRect.left - containerRect.left + cellRect.width / 2,
                            y: cellRect.top - containerRect.top - 8,
                          })
                        }
                      }}
                      onMouseLeave={() => setHoveredDay(null)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* 图例 */}
          <div className="flex items-center justify-end mt-3 space-x-1 text-[10px] text-gray-400">
            <span>少</span>
            <div className="w-[11px] h-[11px] rounded-[2px] bg-gray-100 dark:bg-gray-800"></div>
            <div className="w-[11px] h-[11px] rounded-[2px] bg-emerald-200 dark:bg-emerald-900"></div>
            <div className="w-[11px] h-[11px] rounded-[2px] bg-emerald-400 dark:bg-emerald-700"></div>
            <div className="w-[11px] h-[11px] rounded-[2px] bg-emerald-500 dark:bg-emerald-500"></div>
            <div className="w-[11px] h-[11px] rounded-[2px] bg-emerald-700 dark:bg-emerald-400"></div>
            <span>多</span>
          </div>
        </div>

        {/* Tooltip */}
        {hoveredDay && (
          <div
            className="absolute z-50 pointer-events-none bg-gray-900 text-white text-xs rounded-md px-2.5 py-1.5 shadow-lg whitespace-nowrap"
            style={{
              left: `${hoveredDay.x}px`,
              top: `${hoveredDay.y}px`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <span className="font-medium">{hoveredDay.count} 次 AI 使用</span>
            <span className="text-gray-300 ml-1.5">{hoveredDay.date}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

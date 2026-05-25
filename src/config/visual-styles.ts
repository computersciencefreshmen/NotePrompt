export type VisualStyle = 'workbench' | 'editorial' | 'dashboard' | 'lightweight'

export type VisualStyleOption = {
  value: VisualStyle
  label: string
  note: string
}

export const DEFAULT_VISUAL_STYLE: VisualStyle = 'workbench'

export const visualStyleOptions: VisualStyleOption[] = [
  { value: 'workbench', label: '精密工作台', note: '克制、密度高，适合长期调参和比对' },
  { value: 'editorial', label: '黑白编辑器', note: '强对比、少装饰，突出文本本身' },
  { value: 'dashboard', label: '数据仪表盘', note: '更像 SaaS 工具，便于扫描状态和参数' },
  { value: 'lightweight', label: '轻量创作台', note: '更明亮、友好，适合普通用户快速使用' },
]

export const visualStyleClasses: Record<VisualStyle, {
  page: string
  grid: string
  card: string
  editor: string
  softPanel: string
  primaryButton: string
  accent: string
}> = {
  workbench: {
    page: 'bg-[#f3eee6] dark:bg-[#06110f]',
    grid: 'opacity-[0.06] dark:opacity-[0.08]',
    card: 'border-[#ded6c8] bg-[#fbfaf7]/95 shadow-[0_20px_70px_rgba(67,56,43,0.10)] dark:border-teal-900/60 dark:bg-[#0b1815]/95 dark:shadow-[0_22px_80px_rgba(0,0,0,0.32)]',
    editor: 'border-[#d8cfbf] bg-[#fffdf8] dark:border-teal-900/60 dark:bg-[#07110f]',
    softPanel: 'border-[#ded6c8] bg-[#f6f1e9] dark:border-teal-900/60 dark:bg-[#10221e]',
    primaryButton: 'bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-zinc-950 dark:hover:bg-teal-400',
    accent: 'bg-teal-700 text-white hover:bg-teal-700 dark:bg-teal-400 dark:text-zinc-950',
  },
  editorial: {
    page: 'bg-white dark:bg-[#06110f]',
    grid: 'opacity-[0.03] dark:opacity-[0.08]',
    card: 'border-gray-950 bg-white shadow-none dark:border-teal-900/70 dark:bg-[#0b1815]',
    editor: 'border-gray-950 bg-white dark:border-teal-900/70 dark:bg-[#07110f]',
    softPanel: 'border-gray-950 bg-white dark:border-teal-900/70 dark:bg-[#10221e]',
    primaryButton: 'bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-400 dark:text-black dark:hover:bg-teal-300',
    accent: 'bg-teal-700 text-white hover:bg-teal-700 dark:bg-teal-400 dark:text-black',
  },
  dashboard: {
    page: 'bg-slate-50 dark:bg-[#06110f]',
    grid: 'opacity-[0.04] dark:opacity-[0.06]',
    card: 'border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-teal-900/60 dark:bg-[#0b1815]/95',
    editor: 'border-slate-200 bg-white dark:border-teal-900/60 dark:bg-[#07110f]',
    softPanel: 'border-slate-200 bg-slate-50 dark:border-teal-900/60 dark:bg-[#10221e]',
    primaryButton: 'bg-cyan-700 text-white hover:bg-cyan-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400',
    accent: 'bg-cyan-700 text-white hover:bg-cyan-700 dark:bg-cyan-400 dark:text-slate-950',
  },
  lightweight: {
    page: 'bg-[#fbfaf7] dark:bg-[#06110f]',
    grid: 'opacity-[0.035] dark:opacity-[0.06]',
    card: 'border-stone-200 bg-white/95 shadow-[0_20px_70px_rgba(68,64,60,0.08)] dark:border-teal-900/60 dark:bg-[#0b1815]/95',
    editor: 'border-stone-200 bg-white dark:border-teal-900/60 dark:bg-[#07110f]',
    softPanel: 'border-stone-200 bg-[#fffdf8] dark:border-teal-900/60 dark:bg-[#10221e]',
    primaryButton: 'bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400',
    accent: 'bg-emerald-700 text-white hover:bg-emerald-700 dark:bg-emerald-400 dark:text-zinc-950',
  },
}

export function isVisualStyle(value: string): value is VisualStyle {
  return visualStyleOptions.some(option => option.value === value)
}

export function getVisualStyleLabel(value: VisualStyle) {
  return visualStyleOptions.find(option => option.value === value)?.label || value
}
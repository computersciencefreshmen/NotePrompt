'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Brain,
  Check,
  Crown,
  FileText,
  Gauge,
  Globe,
  Layers3,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { featureFlags } from '@/config/features'

type Locale = 'zh' | 'en'

const homeCopy = {
  zh: {
    nav: { product: '产品', library: '提示词库', pricing: '价格', optimizer: '优化台', login: '登录', register: '免费注册', workspace: '进入工作台' },
    heroBadge: '为提示词资产、模型成本和团队复用而设计',
    heroTitle: '把零散提示词，升级成可复用的 AI 生产系统',
    heroSubtitle: 'Note Prompt 将提示词优化、知识库管理、公共模板、模型选择、使用统计和版本回滚放进一个专业工作台。少烧额度，多产出可复用资产。',
    primaryCta: '免费开始',
    libraryCta: '浏览 50+ 精选模板',
    v2Eyebrow: 'Noteprompt V2',
    v2Title: 'Noteprompt V2 更新了',
    v2Desc: '新版本围绕优化控制台、模型成本、公共模板库和用量统计做了系统升级，让提示词从单条文本变成可管理、可复用、可评估的生产资产。',
    libraryEyebrow: 'Prompt Library',
    libraryTitle: '内置可直接上手的高质量模板库',
    libraryDesc: '覆盖内容创作、代码审查、数据分析、教学设计、商业营销、项目管理和专业咨询。每条模板都按 Role、输入、输出、约束和验收标准组织。',
    pricingEyebrow: 'Pricing',
    pricingTitle: '按使用强度选择套餐',
    pricingDesc: '从免费个人库到团队级协作空间，Note Prompt 让提示词资产随着使用规模自然升级。',
    currentPlan: '当前可用',
    featured: '推荐',
    footerRoadmapLabel: 'Feature Roadmap',
    footerRoadmapHint: '公开规划',
    footerLinks: { library: '提示词库', optimizer: '优化台', pro: '升级 Pro', providers: '模型配置' },
    preview: {
      eyebrow: 'Prompt Console', title: '模型与执行', ready: 'Ready', url: 'optimizer.note-prompt.local', chips: ['结构清晰', 'Markdown', '专业稳重'], probe: '低成本模型探针', rollback: '版本快照回滚', result: '优化结果', score: 'Score 94', role: 'Role: 专业任务执行助手', lines: ['Goal：明确目标与验收标准', 'Rules：不编造事实，信息不足先提问', 'Workflow：识别目标、拆解约束、输出结果'],
    },
    capabilities: [
      { icon: Wand2, title: '提示词优化工作台', desc: '参数、附件、模型、版本都在一个专业控制台里完成。' },
      { icon: BookOpen, title: '公共精品库', desc: '内置 50+ 高质量结构化模板，覆盖写作、代码、营销、研究和管理。' },
      { icon: Layers3, title: '版本与资产管理', desc: '提示词、文件夹、标签、收藏和发布流程统一沉淀。' },
      { icon: Gauge, title: '可控成本策略', desc: '模型检测默认不消耗额度，真实调用才走低成本探针。' },
    ],
    pricing: [
      { name: 'Free', price: '¥0', note: '适合个人试用和轻量管理', cta: '免费开始', href: '/register', features: ['50 个私有提示词', '10 个文件夹', '每月 10 次 AI 优化', '公共提示词库浏览与收藏', '基础版本历史'] },
      { name: 'Pro', price: '¥29', suffix: '/月', note: '适合高频创作者和独立开发者', cta: '升级 Pro', href: '/profile', featured: true, features: ['无限提示词和文件夹', '更高 AI 优化额度', '多模型高级参数', '批量导入与发布', '优先体验新功能', '可通过贡献优质内容解锁'] },
      { name: 'Team', price: '¥99', suffix: '/月起', note: '适合团队知识库和内容协作', cta: '联系开通', href: '/register', features: ['团队空间与权限', '共享提示词规范库', '管理员审查与统计', '私有部署咨询', '发票与合同支持'] },
    ],
    roadmap: [
      { quarter: '2026 Q3', title: '团队协作空间', desc: '共享提示词库、成员权限、团队模板规范与使用统计。' },
      { quarter: '2026 Q4', title: '商业化与企业版', desc: 'Pro 套餐、团队席位、发票合同、私有化部署咨询。' },
      { quarter: '2027 Q1', title: '智能评测系统', desc: '提示词评分、A/B 结果对比、自动生成优化建议。' },
    ],
    v2Updates: ['全新优化工作台：文件解析、OCR、模型选择、参数控制和流式输出集中在一个界面', '模型诊断更省额度：默认只做配置检查，真实调用使用低成本探针和缓存', '公共提示词库升级：导入 50+ 高质量结构化模板，支持搜索、收藏和一键导入', 'AI 使用统计升级：本月用量、优化次数和管理员统计实时汇总'],
    stats: [['50+', '精选提示词模板'], ['6', '主流模型供应商'], ['2 token', '低成本可用性探针'], ['30s', '统计自动刷新']],
  },
  en: {
    nav: { product: 'Product', library: 'Prompt Library', pricing: 'Pricing', optimizer: 'Optimizer', login: 'Log in', register: 'Get started', workspace: 'Workspace' },
    heroBadge: 'Built for prompt assets, model cost control, and team reuse',
    heroTitle: 'Turn scattered prompts into a reusable AI production system',
    heroSubtitle: 'Note Prompt brings prompt optimization, knowledge management, curated templates, model selection, usage analytics, and version rollback into one professional workspace.',
    primaryCta: 'Get started',
    libraryCta: 'Browse English templates',
    v2Eyebrow: 'Noteprompt V2',
    v2Title: 'Noteprompt V2 is here',
    v2Desc: 'V2 upgrades the optimizer workbench, model-cost controls, curated template library, and usage analytics so prompts become managed, reusable, and measurable assets.',
    libraryEyebrow: 'Prompt Library',
    libraryTitle: 'Curated prompt frameworks ready to use',
    libraryDesc: 'Explore English prompt frameworks for content, code review, research, marketing, operations, product management, sales, education, and data analysis.',
    pricingEyebrow: 'Pricing',
    pricingTitle: 'Choose a plan by usage intensity',
    pricingDesc: 'Start with a personal library, then scale into professional workflows and team collaboration as your prompt assets grow.',
    currentPlan: 'Available now',
    featured: 'Recommended',
    footerRoadmapLabel: 'Feature Roadmap',
    footerRoadmapHint: 'Public plan',
    footerLinks: { library: 'Prompt Library', optimizer: 'Optimizer', pro: 'Upgrade Pro', providers: 'Model Settings' },
    preview: {
      eyebrow: 'Prompt Console', title: 'Model and execution', ready: 'Ready', url: 'optimizer.note-prompt.local', chips: ['Structured', 'Markdown', 'Professional'], probe: 'Low-cost model probe', rollback: 'Version rollback', result: 'Optimized result', score: 'Score 94', role: 'Role: professional task assistant', lines: ['Goal: define outcomes and acceptance criteria', 'Rules: do not invent facts; ask first when context is missing', 'Workflow: identify goal, unpack constraints, produce result'],
    },
    capabilities: [
      { icon: Wand2, title: 'Optimizer workbench', desc: 'Parameters, files, models, versions, and output review live in one professional console.' },
      { icon: BookOpen, title: 'Curated public library', desc: 'English prompt frameworks for strategy, product, engineering, research, marketing, and operations.' },
      { icon: Layers3, title: 'Asset management', desc: 'Prompts, folders, tags, favorites, publishing, and versions stay organized in one place.' },
      { icon: Gauge, title: 'Cost-aware model checks', desc: 'Availability checks avoid paid calls by default; real probes use tiny cached requests.' },
    ],
    pricing: [
      { name: 'Free', price: '$0', note: 'For personal trials and lightweight prompt management', cta: 'Start free', href: '/register', features: ['50 private prompts', '10 folders', '10 AI optimizations per month', 'Browse and save public prompts', 'Basic version history'] },
      { name: 'Pro', price: '$4', suffix: '/mo', note: 'For frequent creators and independent builders', cta: 'Upgrade Pro', href: '/profile', featured: true, features: ['Unlimited prompts and folders', 'Higher AI optimization quota', 'Advanced model parameters', 'Batch import and publishing', 'Early access features', 'Can be unlocked through quality contributions'] },
      { name: 'Team', price: '$14', suffix: '/mo+', note: 'For shared knowledge bases and team workflows', cta: 'Contact sales', href: '/register', features: ['Team spaces and permissions', 'Shared prompt standards', 'Admin review and analytics', 'Private deployment consulting', 'Invoice and contract support'] },
    ],
    roadmap: [
      { quarter: '2026 Q3', title: 'Team collaboration spaces', desc: 'Shared prompt libraries, member permissions, team standards, and usage analytics.' },
      { quarter: '2026 Q4', title: 'Commercial and enterprise plans', desc: 'Pro plans, team seats, invoices, contracts, and private deployment consulting.' },
      { quarter: '2027 Q1', title: 'Prompt evaluation system', desc: 'Prompt scoring, A/B result comparison, and automated improvement suggestions.' },
    ],
    v2Updates: ['New optimizer workbench with file parsing, OCR, model selection, parameters, and streaming output', 'Lower-cost model diagnostics with config-first checks and tiny cached probes', 'Public library upgraded with 50+ curated structured templates', 'Usage analytics upgraded with monthly counts and admin summaries'],
    stats: [['50+', 'Curated templates'], ['6', 'Model providers'], ['2 token', 'Low-cost probe'], ['30s', 'Stats refresh']],
  },
}

function FeatureRoadmap({ copy }: { copy: typeof homeCopy.zh }) {
  return (
    <details className="group w-full max-w-md rounded-[8px] border border-zinc-200 bg-white/92 p-4 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-[#111312]/90">
      <summary className="flex cursor-pointer list-none items-center justify-between">
        <span className="text-sm font-bold text-zinc-950 dark:text-white">{copy.footerRoadmapLabel}</span>
        <span className="rounded-[6px] bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700 dark:bg-teal-950 dark:text-teal-200">{copy.footerRoadmapHint}</span>
      </summary>
      <div className="mt-4 space-y-3">
        {copy.roadmap.map(item => (
          <div key={item.quarter} className="grid grid-cols-[76px_1fr] gap-3 border-t border-zinc-100 pt-3 first:border-t-0 first:pt-0 dark:border-zinc-800">
            <div className="text-xs font-black text-amber-700 dark:text-amber-300">{item.quarter}</div>
            <div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.title}</div>
              <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}

function ProductPreview({ copy }: { copy: typeof homeCopy.zh.preview }) {
  return (
    <div className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-[8px] border border-teal-100 bg-white shadow-2xl shadow-teal-100/70 dark:border-zinc-800 dark:bg-[#111312] dark:shadow-black/20">
      <div className="flex items-center justify-between border-b border-teal-100 bg-teal-50 px-4 py-3 dark:border-zinc-800 dark:bg-[#151817]">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff6464]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#f5c542]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#38c172]" />
        </div>
        <div className="rounded-[6px] border border-teal-200 bg-white px-3 py-1 text-xs text-teal-700 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-400">{copy.url}</div>
      </div>
      <div className="grid gap-px bg-teal-100 dark:bg-zinc-800 md:grid-cols-[1fr_0.95fr]">
        <div className="bg-white p-5 dark:bg-[#111412]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">{copy.eyebrow}</p>
              <h3 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">{copy.title}</h3>
            </div>
            <div className="rounded-[6px] bg-teal-400 px-2 py-1 text-xs font-semibold text-zinc-950">{copy.ready}</div>
          </div>
          <div className="rounded-[8px] border border-zinc-200 bg-[#f8faf9] p-4 dark:border-zinc-700 dark:bg-[#0b0d0c]">
            <div className="mb-3 h-3 w-3/5 rounded bg-teal-200 dark:bg-zinc-700" />
            <div className="space-y-2">
              <div className="h-2 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-2 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-2 w-4/5 rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {copy.chips.map(item => (
                <div key={item} className="rounded-[6px] border border-teal-100 bg-white px-2 py-2 text-center text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">{item}</div>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[8px] border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-100">{copy.probe}</div>
            <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">{copy.rollback}</div>
          </div>
        </div>
        <div className="bg-[#f2f6f1] p-5 text-zinc-950">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">{copy.result}</h3>
            <span className="rounded-[6px] bg-zinc-950 px-2 py-1 text-xs text-zinc-50">{copy.score}</span>
          </div>
          <div className="space-y-3 rounded-[8px] border border-zinc-300 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Brain className="h-4 w-4 text-teal-700" />{copy.role}</div>
            {copy.lines.map(line => (
              <div key={line} className="rounded-[6px] bg-zinc-100 px-3 py-2 text-sm text-zinc-700">{line}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const { user, loading } = useAuth()
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window === 'undefined') return 'zh'
    return new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'zh'
  })
  const copy = homeCopy[locale]

  const withLocale = (href: string) => locale === 'en' ? `${href}${href.includes('?') ? '&' : '?'}lang=en` : href

  const handleLocaleChange = (nextLocale: Locale) => {
    setLocale(nextLocale)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (nextLocale === 'en') {
        params.set('lang', 'en')
      } else {
        params.delete('lang')
      }
      const query = params.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    }
  }

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN'
  }, [locale])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#06110f]">
        <Sparkles className="h-6 w-6 animate-pulse text-amber-300" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] text-zinc-950 dark:bg-[#06110f] dark:text-teal-50">
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-zinc-200/70 bg-[#f8faf9]/90 backdrop-blur-xl dark:border-teal-900/60 dark:bg-[#06110f]/88">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-teal-700 text-white dark:bg-teal-400 dark:text-zinc-950"><Sparkles className="h-4 w-4" /></span>
            <span className="text-lg font-bold tracking-tight">Note Prompt</span>
          </Link>
          <div className="hidden items-center gap-6 text-sm text-zinc-600 dark:text-teal-100/70 md:flex">
            <a href="#product" className="hover:text-zinc-950 dark:hover:text-teal-50">{copy.nav.product}</a>
            <a href="#library" className="hover:text-zinc-950 dark:hover:text-teal-50">{copy.nav.library}</a>
            <a href="#pricing" className="hover:text-zinc-950 dark:hover:text-teal-50">{copy.nav.pricing}</a>
            {featureFlags.promptOptimizerV2 && <Link href={withLocale('/optimizer')} className="hover:text-zinc-950 dark:hover:text-teal-50">{copy.nav.optimizer}</Link>}
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden rounded-full border border-teal-200 bg-white p-0.5 text-xs dark:border-teal-900 dark:bg-zinc-900 sm:flex">
              {(['zh', 'en'] as Locale[]).map(item => (
                <button
                  key={item}
                  onClick={() => handleLocaleChange(item)}
                  className={`rounded-full px-2.5 py-1 font-semibold transition-colors ${locale === item ? 'bg-teal-700 text-white' : 'text-zinc-500 hover:text-teal-700 dark:text-zinc-300'}`}
                >
                  {item === 'zh' ? 'ZH' : 'EN'}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="hidden text-zinc-700 hover:text-teal-700 dark:text-teal-100/80 dark:hover:text-teal-50 sm:inline-flex" asChild><Link href={withLocale('/login')}>{copy.nav.login}</Link></Button>
            <Button variant="outline" size="sm" className="hidden rounded-[8px] border-teal-200 bg-white text-teal-800 hover:bg-teal-50 dark:border-teal-800 dark:bg-[#0b1815] dark:text-teal-100 dark:hover:bg-[#10221e] sm:inline-flex" asChild><Link href={withLocale('/register')}>{copy.nav.register}</Link></Button>
            <Button size="sm" className="rounded-[8px] bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-400 dark:text-[#06110f] dark:hover:bg-teal-300" asChild><Link href={withLocale(user ? '/prompts' : '/register')}>{user ? copy.nav.workspace : copy.nav.register}</Link></Button>
          </div>
        </div>
      </nav>

      <main>
        <section className="relative overflow-hidden pt-28">
          <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.12]" style={{ backgroundImage: 'linear-gradient(#0f766e 1px, transparent 1px), linear-gradient(90deg, #0f766e 1px, transparent 1px)', backgroundSize: '44px 44px' }} />
          <div className="relative mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:pb-20">
            <div className="mx-auto max-w-5xl text-center">
              <div className="mb-6 inline-flex items-center justify-center gap-2 rounded-[8px] border border-amber-300 bg-amber-100 px-3 py-1 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
                <BadgeCheck className="h-4 w-4" /> {copy.heroBadge}
              </div>
              <h1 className="mx-auto max-w-5xl text-5xl font-black leading-[0.98] tracking-tight text-zinc-950 dark:text-teal-50 md:text-7xl">
                {copy.heroTitle}
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-teal-100/72">
                {copy.heroSubtitle}
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button size="lg" className="h-12 rounded-[8px] bg-teal-700 px-7 text-white hover:bg-teal-800 dark:bg-teal-400 dark:text-zinc-950 dark:hover:bg-teal-300" asChild>
                  <Link href={withLocale(user ? '/prompts' : '/register')}>{user ? copy.nav.workspace : copy.primaryCta}<ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
                <Button variant="outline" size="lg" className="h-12 rounded-[8px] border-zinc-300 px-7" asChild>
                  <Link href={withLocale('/public-prompts')}><Globe className="mr-2 h-4 w-4" />{copy.libraryCta}</Link>
                </Button>
              </div>
            </div>
            <div id="product" className="mt-12">
              <ProductPreview copy={copy.preview} />
            </div>
          </div>
        </section>

        <section className="border-y border-teal-100 bg-teal-50/70 py-14 dark:border-teal-900/60 dark:bg-[#0b1815]">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">{copy.v2Eyebrow}</p>
              <h2 className="text-3xl font-black tracking-tight md:text-4xl">{copy.v2Title}</h2>
              <p className="mt-4 text-zinc-600 dark:text-teal-100/72">{copy.v2Desc}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {copy.v2Updates.map(update => (
                <div key={update} className="rounded-[8px] border border-teal-100 bg-white p-4 text-sm leading-6 text-zinc-700 shadow-sm dark:border-teal-900/70 dark:bg-[#10221e] dark:text-teal-50/82">
                  <Check className="mb-3 h-4 w-4 text-teal-700 dark:text-teal-300" />
                  {update}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="library" className="border-y border-zinc-200 bg-white py-16 dark:border-teal-900/60 dark:bg-[#07110f]">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">{copy.libraryEyebrow}</p>
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{copy.libraryTitle}</h2>
              <p className="mt-4 text-zinc-600 dark:text-teal-100/72">{copy.libraryDesc}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {copy.capabilities.map(item => (
                <div key={item.title} className="rounded-[8px] border border-zinc-200 bg-[#f8faf9] p-5 dark:border-teal-900/60 dark:bg-[#0b1815]">
                  <item.icon className="mb-4 h-5 w-5 text-teal-700 dark:text-teal-300" />
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-teal-100/65">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:px-6 md:grid-cols-4">
            {copy.stats.map(([value, label]) => (
              <div key={label} className="rounded-[8px] border border-zinc-200 bg-white p-6 dark:border-teal-900/60 dark:bg-[#0b1815]">
                <div className="text-3xl font-black text-zinc-950 dark:text-teal-50">{value}</div>
                <div className="mt-1 text-sm text-zinc-500 dark:text-teal-100/65">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="border-y border-zinc-200 bg-white py-20 text-zinc-950 dark:border-teal-900/60 dark:bg-[#07110f] dark:text-teal-50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-12 max-w-3xl">
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-amber-700 dark:text-amber-300">{copy.pricingEyebrow}</p>
              <h2 className="text-4xl font-black tracking-tight md:text-5xl">{copy.pricingTitle}</h2>
              <p className="mt-4 text-zinc-600 dark:text-teal-100/72">{copy.pricingDesc}</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {copy.pricing.map(plan => (
                <div key={plan.name} className={`relative rounded-[8px] border p-6 ${plan.featured ? 'border-teal-300 bg-[#f2fbf7] text-zinc-950 shadow-xl shadow-teal-100 dark:border-teal-500/80 dark:bg-[#10221e] dark:text-teal-50 dark:shadow-none' : 'border-zinc-200 bg-[#f8faf9] text-zinc-950 dark:border-teal-900/60 dark:bg-[#0b1815] dark:text-teal-50'}`}>
                  {plan.featured && <div className="absolute right-4 top-4 rounded-[6px] bg-amber-300 px-2 py-1 text-xs font-bold text-zinc-950"><Crown className="mr-1 inline h-3 w-3" />{copy.featured}</div>}
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{plan.note}</p>
                  <div className="mt-6 flex items-end gap-1">
                    <span className="text-4xl font-black">{plan.price}</span>
                    {plan.suffix && <span className="text-zinc-500 dark:text-zinc-400">{plan.suffix}</span>}
                  </div>
                  <ul className="mt-6 space-y-3 text-sm">
                    {plan.features.map(feature => (
                      <li key={feature} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" />{feature}</li>
                    ))}
                  </ul>
                  <Button className={`mt-8 w-full rounded-[8px] ${plan.featured ? 'bg-teal-700 text-white hover:bg-teal-800' : 'border border-teal-200 bg-white text-teal-800 hover:bg-teal-50 dark:bg-transparent dark:text-teal-200 dark:hover:bg-teal-950/40'}`} asChild>
                    <Link href={withLocale(user && plan.name === 'Free' ? '/prompts' : plan.href)}>{user && plan.name === 'Free' ? copy.currentPlan : plan.cta}</Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-white py-8 dark:border-teal-900/60 dark:bg-[#0b1815]">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 text-sm text-zinc-500 sm:px-6 md:grid-cols-[1fr_auto] md:items-start">
          <div className="space-y-4">
            <div className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-100"><FileText className="h-4 w-4" />Note Prompt</div>
            <FeatureRoadmap copy={copy} />
          </div>
          <div className="flex flex-wrap gap-5 md:justify-end">
            <Link href={withLocale('/public-prompts')} className="hover:text-teal-600">{copy.footerLinks.library}</Link>
            {featureFlags.promptOptimizerV2 && <Link href={withLocale('/optimizer')} className="hover:text-teal-600">{copy.footerLinks.optimizer}</Link>}
            <Link href={withLocale('/profile')} className="hover:text-teal-600">{copy.footerLinks.pro}</Link>
            {user && <Link href={withLocale('/settings/providers')} className="hover:text-teal-600">{copy.footerLinks.providers}</Link>}
          </div>
        </div>
      </footer>
    </div>
  )
}
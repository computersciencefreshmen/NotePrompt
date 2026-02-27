'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import {
  Sparkles, Wand2, FolderOpen, Globe, ArrowRight,
  Zap, Shield, Users, ChevronDown, Star, BookOpen
} from 'lucide-react'
import { Button } from '@/components/ui/button'

function FloatingOrb({ delay, size, x, y }: { delay: number; size: number; x: string; y: string }) {
  return (
    <div
      className="absolute rounded-full opacity-20 blur-3xl animate-pulse pointer-events-none"
      style={{
        width: size,
        height: size,
        left: x,
        top: y,
        background: 'radial-gradient(circle, rgba(20,184,166,0.4) 0%, rgba(6,78,59,0.1) 70%)',
        animationDelay: `${delay}s`,
        animationDuration: '6s',
      }}
    />
  )
}

function FeatureCard({ icon: Icon, title, desc, accent }: {
  icon: React.ElementType; title: string; desc: string; accent: string
}) {
  return (
    <div className="group relative p-6 rounded-2xl bg-white/80 dark:bg-gray-900/60 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/40 hover:border-teal-300 dark:hover:border-teal-600 transition-all duration-300 hover:shadow-lg hover:shadow-teal-500/10 hover:-translate-y-1">
      <div className={`w-12 h-12 rounded-xl ${accent} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{desc}</p>
    </div>
  )
}

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">{value}</div>
      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{label}</div>
    </div>
  )
}

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()

  // 已登录用户直接进入
  useEffect(() => {
    if (!loading && user) {
      router.push('/prompts')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center animate-pulse">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
      </div>
    )
  }

  if (user) return null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100 tracking-tight">Note Prompt</span>
          </Link>
          <div className="hidden md:flex items-center space-x-6 text-sm">
            <a href="#features" className="text-gray-600 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors">功能</a>
            <a href="#how-it-works" className="text-gray-600 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors">使用方式</a>
            <Link href="/public-prompts" className="text-gray-600 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors">提示词库</Link>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">登录</Link>
            </Button>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white rounded-full px-5" asChild>
              <Link href="/register">免费注册</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-32">
        {/* Background orbs */}
        <FloatingOrb delay={0} size={400} x="10%" y="20%" />
        <FloatingOrb delay={2} size={300} x="70%" y="10%" />
        <FloatingOrb delay={4} size={250} x="50%" y="60%" />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #14b8a6 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-sm mb-8">
            <Zap className="h-3.5 w-3.5" />
            <span>支持 DeepSeek / Kimi / 通义千问 / 智谱 17+ 模型</span>
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-gray-900 dark:text-gray-50 leading-[1.1]">
            用 AI 驱动你的<br />
            <span className="bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500 bg-clip-text text-transparent">提示词工程</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
            创建、优化、管理和分享 AI 提示词。
            <br className="hidden sm:block" />
            让每一次 AI 对话都精准高效。
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="bg-teal-600 hover:bg-teal-700 text-white rounded-full px-8 h-12 text-base shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 transition-all" asChild>
              <Link href="/register">
                开始使用
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="rounded-full px-8 h-12 text-base border-gray-300 dark:border-gray-700" asChild>
              <Link href="/public-prompts">
                <Globe className="mr-2 h-4 w-4" />
                浏览提示词库
              </Link>
            </Button>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-3 gap-8 max-w-md mx-auto">
            <StatBlock value="17+" label="AI 模型" />
            <StatBlock value="4" label="大厂 API" />
            <StatBlock value="∞" label="可能性" />
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="h-5 w-5 text-gray-400" />
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-50">
              为提示词工程而生
            </h2>
            <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
              从创建到优化，从管理到分享，一站式提示词平台
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={Wand2}
              title="AI 智能优化"
              desc="选择任意 AI 模型，一键优化你的提示词。支持 DeepSeek、Kimi、通义千问、智谱等主流模型。"
              accent="bg-gradient-to-br from-teal-500 to-emerald-600"
            />
            <FeatureCard
              icon={BookOpen}
              title="双模式编辑器"
              desc="普通模式快速上手，专业模式精细控制。支持角色设定、约束条件、变量系统等高级功能。"
              accent="bg-gradient-to-br from-violet-500 to-purple-600"
            />
            <FeatureCard
              icon={FolderOpen}
              title="文件夹管理"
              desc="用文件夹组织你的提示词库。支持拖拽操作，快速归类和整理。"
              accent="bg-gradient-to-br from-blue-500 to-indigo-600"
            />
            <FeatureCard
              icon={Globe}
              title="公共提示词库"
              desc="发现和共享优质提示词。一键收藏，导入到自己的工作空间。"
              accent="bg-gradient-to-br from-orange-500 to-red-500"
            />
            <FeatureCard
              icon={Star}
              title="收藏与标签"
              desc="收藏喜欢的提示词，用标签系统高效分类，让最好的提示词触手可及。"
              accent="bg-gradient-to-br from-amber-500 to-yellow-600"
            />
            <FeatureCard
              icon={Shield}
              title="版本历史"
              desc="每次修改自动保存版本。对比历史差异，随时回滚到任意版本。"
              accent="bg-gradient-to-br from-cyan-500 to-teal-600"
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 md:py-28 bg-white/50 dark:bg-gray-900/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-50">
              三步开始
            </h2>
          </div>

          <div className="space-y-12">
            {[
              { step: '01', title: '创建提示词', desc: '选择普通模式或专业模式，输入你的提示词内容。模板库帮你快速起步。' },
              { step: '02', title: 'AI 优化', desc: '选择合适的 AI 模型，一键优化。对比优化前后的差异，决定是否应用。' },
              { step: '03', title: '管理与分享', desc: '用文件夹整理，添加标签分类。发布到公共库与他人分享优质提示词。' },
            ].map((item) => (
              <div key={item.step} className="flex items-start space-x-6">
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-teal-500/20">
                  {item.step}
                </div>
                <div className="pt-1">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{item.title}</h3>
                  <p className="mt-2 text-gray-600 dark:text-gray-400 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-50 mb-6">
            开始优化你的 AI 提示词
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-10 max-w-xl mx-auto">
            免费注册，立即使用 17+ AI 模型优化你的提示词
          </p>
          <Button size="lg" className="bg-teal-600 hover:bg-teal-700 text-white rounded-full px-10 h-12 text-base shadow-lg shadow-teal-500/25" asChild>
            <Link href="/register">
              免费注册
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                <Sparkles className="h-3 w-3 text-white" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Note Prompt</span>
            </div>
            <div className="flex items-center space-x-6 text-sm text-gray-500 dark:text-gray-400">
              <Link href="/public-prompts" className="hover:text-teal-600 transition-colors">提示词库</Link>
              <Link href="/public-folders" className="hover:text-teal-600 transition-colors">公共文件夹</Link>
              <Link href="/login" className="hover:text-teal-600 transition-colors">登录</Link>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">© 2025 Note Prompt. 毕业设计作品</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

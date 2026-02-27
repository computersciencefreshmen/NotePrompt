import { Sparkles, Brain, Zap, Lightbulb } from 'lucide-react'
import { LoadingSpinner } from './loading-spinner'

interface AILoadingProps {
  message?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function AILoading({ 
  message = 'AI正在优化中...', 
  className = '',
  size = 'md'
}: AILoadingProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
  }

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  }

  return (
    <div className={`flex items-center justify-center space-x-3 text-teal-600 ${className}`}>
      {/* 主要动画容器 */}
      <div className="relative">
        {/* 背景光晕效果 */}
        <div className="absolute inset-0 bg-teal-200 rounded-full animate-pulse opacity-30"></div>
        
        {/* 中心图标 */}
        <div className="relative z-10">
          <Brain className={`${sizeClasses[size]} animate-bounce`} />
        </div>
        
        {/* 旋转的装饰元素 */}
        <div className="absolute inset-0 animate-spin">
          <Sparkles className={`${sizeClasses[size]} text-teal-400 opacity-60`} />
        </div>
        
        {/* 脉冲效果 */}
        <div className="absolute inset-0">
          <Zap className={`${sizeClasses[size]} text-teal-500 animate-pulse`} />
        </div>
      </div>
      
      {/* 文字部分 */}
      <div className="flex items-center space-x-2">
        <span className={`font-medium animate-pulse ${textSizes[size]}`}>
          {message}
        </span>
        
        {/* 动态点 */}
        <div className="flex space-x-1">
          <div className="w-1 h-1 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-1 h-1 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-1 h-1 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
      
      {/* 右侧装饰 */}
      <div className="relative">
        <Lightbulb className={`${sizeClasses[size]} text-yellow-500 animate-pulse opacity-70`} />
      </div>
    </div>
  )
}

// 专门用于AI优化的加载组件
export function AIOptimizingLoading({ 
  message = 'AI正在优化提示词...', 
  className = '',
  size = 'md'
}: AILoadingProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
  }

  return (
    <div className={`flex items-center justify-center space-x-3 text-purple-600 ${className}`}>
      {/* 主要动画容器 */}
      <div className="relative">
        {/* 多层光晕效果 */}
        <div className="absolute inset-0 bg-gradient-to-r from-purple-200 to-pink-200 rounded-full animate-pulse opacity-40"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-purple-300 to-pink-300 rounded-full animate-pulse opacity-20" style={{ animationDelay: '500ms' }}></div>
        
        {/* 中心大脑图标 */}
        <div className="relative z-10">
          <Brain className={`${sizeClasses[size]} animate-bounce text-purple-600`} />
        </div>
        
        {/* 旋转的星星 */}
        <div className="absolute inset-0 animate-spin">
          <Sparkles className={`${sizeClasses[size]} text-purple-400 opacity-70`} />
        </div>
        
        {/* 反向旋转的装饰 */}
        <div className="absolute inset-0 animate-spin" style={{ animationDirection: 'reverse' }}>
          <Zap className={`${sizeClasses[size]} text-pink-500 opacity-60`} />
        </div>
        
        {/* 脉冲效果 */}
        <div className="absolute inset-0">
          <Lightbulb className={`${sizeClasses[size]} text-yellow-500 animate-pulse opacity-50`} />
        </div>
      </div>
      
      {/* 文字部分 */}
      <div className="flex items-center space-x-2">
        <span className="font-medium animate-pulse text-sm">
          {message}
        </span>
        
        {/* 动态点 */}
        <div className="flex space-x-1">
          <div className="w-1 h-1 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-1 h-1 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-1 h-1 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
      
      {/* 右侧装饰 */}
      <div className="relative">
        <div className="animate-spin">
          <Sparkles className={`${sizeClasses[size]} text-purple-400 opacity-60`} />
        </div>
      </div>
    </div>
  )
} 
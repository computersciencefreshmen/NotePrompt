import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from './input'
import { cn } from '@/lib/utils'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  debounceMs?: number
  showClearButton?: boolean
  onClear?: () => void
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ 
    value, 
    onChange, 
    placeholder = "搜索...", 
    className,
    debounceMs = 500,
    showClearButton = true,
    onClear
  }, ref) => {
    const [inputValue, setInputValue] = useState(value)
    const [isComposing, setIsComposing] = useState(false)
    const timeoutRef = useRef<NodeJS.Timeout>()
    const inputRef = useRef<HTMLInputElement>(null)

    // 防抖处理
    const debouncedOnChange = useCallback((newValue: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      
      timeoutRef.current = setTimeout(() => {
        onChange(newValue)
      }, debounceMs)
    }, [onChange, debounceMs])

    // 处理输入变化
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value
      setInputValue(newValue)
      
      // 如果正在输入法组合状态，不触发搜索
      if (!isComposing) {
        debouncedOnChange(newValue)
      }
    }, [debouncedOnChange, isComposing])

    // 处理输入法组合开始
    const handleCompositionStart = useCallback(() => {
      setIsComposing(true)
    }, [])

    // 处理输入法组合结束
    const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
      setIsComposing(false)
      const newValue = e.currentTarget.value
      setInputValue(newValue)
      debouncedOnChange(newValue)
    }, [debouncedOnChange])

    // 处理清除按钮
    const handleClear = useCallback(() => {
      setInputValue('')
      onChange('')
      onClear?.()
      // 聚焦到输入框
      inputRef.current?.focus()
    }, [onChange, onClear])

    // 同步外部value变化
    useEffect(() => {
      setInputValue(value)
    }, [value])

    // 清理定时器
    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
      }
    }, [])

    return (
      <div className={cn("relative", className)}>
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 pointer-events-none" />
        <Input
          ref={(node) => {
            // 同时设置两个ref
            if (typeof ref === 'function') {
              ref(node)
            } else if (ref) {
              ref.current = node
            }
            inputRef.current = node
          }}
          value={inputValue}
          onChange={handleInputChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={placeholder}
          className="pl-10 pr-10"
        />
        {showClearButton && inputValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="清除搜索"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }
)

SearchInput.displayName = "SearchInput" 
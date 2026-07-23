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
  resetSignal?: number
  showClearButton?: boolean
  onClear?: () => void
  ariaLabel?: string
  clearLabel?: string
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ 
    value, 
    onChange, 
    placeholder = "搜索...", 
    className,
    debounceMs = 500,
    resetSignal = 0,
    showClearButton = true,
    onClear,
    ariaLabel,
    clearLabel = '清除搜索',
  }, ref) => {
    const [inputValue, setInputValue] = useState(value)
    const [isComposing, setIsComposing] = useState(false)
    const timeoutRef = useRef<NodeJS.Timeout>()
    const inputRef = useRef<HTMLInputElement | null>(null)

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
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      setInputValue('')
      onChange('')
      onClear?.()
      // 聚焦到输入框
      inputRef.current?.focus()
    }, [onChange, onClear])

    // 同步外部value变化
    useEffect(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      setInputValue(value)
    }, [resetSignal, value])

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
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--np-ink-muted)]"
          aria-hidden="true"
        />
        <Input
          ref={(node) => {
            // 同时设置两个ref
            if (typeof ref === 'function') {
              ref(node)
            } else if (ref) {
              ;(ref as React.MutableRefObject<HTMLInputElement | null>).current = node
            }
            inputRef.current = node
          }}
          value={inputValue}
          aria-label={ariaLabel || placeholder}
          onChange={handleInputChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={placeholder}
          className="h-11 rounded-[8px] border-[var(--np-rule)] bg-[var(--np-surface)] pl-10 pr-12 text-[var(--np-ink)] placeholder:text-[var(--np-ink-muted)]"
        />
        {showClearButton && inputValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[8px] text-[var(--np-ink-muted)] transition-colors hover:bg-[var(--np-surface-soft)] hover:text-[var(--np-ink)]"
            aria-label={clearLabel}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    )
  }
)

SearchInput.displayName = "SearchInput"

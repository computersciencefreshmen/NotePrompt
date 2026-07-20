'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { DEFAULT_VISUAL_STYLE, isLegacyVisualStyle, VisualStyle } from '@/config/visual-styles'

type UISettingsContextType = {
  visualStyle: VisualStyle
  setVisualStyle: (visualStyle: VisualStyle) => void
}

const UISettingsContext = createContext<UISettingsContextType>({
  visualStyle: DEFAULT_VISUAL_STYLE,
  setVisualStyle: () => {},
})

const VISUAL_STYLE_STORAGE_KEY = 'note-prompt-visual-style'

export function useUISettings() {
  return useContext(UISettingsContext)
}

export function UISettingsProvider({ children }: { children: React.ReactNode }) {
  const [visualStyle, setVisualStyleState] = useState<VisualStyle>(DEFAULT_VISUAL_STYLE)

  useEffect(() => {
    delete document.documentElement.dataset.visualStyle
    const storedStyle = localStorage.getItem(VISUAL_STYLE_STORAGE_KEY)
    if (storedStyle && !isLegacyVisualStyle(storedStyle)) {
      localStorage.removeItem(VISUAL_STYLE_STORAGE_KEY)
    }
    setVisualStyleState(DEFAULT_VISUAL_STYLE)
    localStorage.setItem(VISUAL_STYLE_STORAGE_KEY, DEFAULT_VISUAL_STYLE)
  }, [])

  const setVisualStyle = useCallback((nextVisualStyle: VisualStyle) => {
    delete document.documentElement.dataset.visualStyle
    setVisualStyleState(nextVisualStyle)
    localStorage.setItem(VISUAL_STYLE_STORAGE_KEY, nextVisualStyle)
  }, [])

  return (
    <UISettingsContext.Provider value={{ visualStyle, setVisualStyle }}>
      {children}
    </UISettingsContext.Provider>
  )
}

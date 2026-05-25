'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { DEFAULT_VISUAL_STYLE, isVisualStyle, VisualStyle } from '@/config/visual-styles'

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
    const storedStyle = localStorage.getItem(VISUAL_STYLE_STORAGE_KEY)
    if (storedStyle && isVisualStyle(storedStyle)) {
      setVisualStyleState(storedStyle)
      document.documentElement.dataset.visualStyle = storedStyle
      return
    }

    document.documentElement.dataset.visualStyle = DEFAULT_VISUAL_STYLE
  }, [])

  const setVisualStyle = (nextVisualStyle: VisualStyle) => {
    setVisualStyleState(nextVisualStyle)
    localStorage.setItem(VISUAL_STYLE_STORAGE_KEY, nextVisualStyle)
    document.documentElement.dataset.visualStyle = nextVisualStyle
  }

  return (
    <UISettingsContext.Provider value={{ visualStyle, setVisualStyle }}>
      {children}
    </UISettingsContext.Provider>
  )
}
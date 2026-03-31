'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export type MediaMode = 'peliculas' | 'series'

type MediaModeContextType = {
  mode: MediaMode
  setMode: (mode: MediaMode) => void
  hydrated: boolean
}

const MediaModeContext = createContext<MediaModeContextType>({
  mode: 'peliculas',
  setMode: () => {},
  hydrated: false,
})

export function MediaModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<MediaMode>('peliculas')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('cinebret-media-mode') as MediaMode | null
    if (saved === 'peliculas' || saved === 'series') setModeState(saved)
    setHydrated(true)
  }, [])

  const setMode = (newMode: MediaMode) => {
    setModeState(newMode)
    localStorage.setItem('cinebret-media-mode', newMode)
  }

  return (
    <MediaModeContext.Provider value={{ mode, setMode, hydrated }}>
      {children}
    </MediaModeContext.Provider>
  )
}

export const useMediaMode = () => useContext(MediaModeContext)

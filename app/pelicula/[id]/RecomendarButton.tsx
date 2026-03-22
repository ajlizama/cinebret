'use client'

import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import RecomendarModal from './RecomendarModal'

type Props = {
  peliculaId: string
  peliculaTitulo: string
}

export default function RecomendarButton({ peliculaId, peliculaTitulo }: Props) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)

  if (!user) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-zinc-800/50 border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors rounded-lg px-4 py-2 text-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
        Recomendar
      </button>
      {open && (
        <RecomendarModal
          peliculaId={peliculaId}
          peliculaTitulo={peliculaTitulo}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

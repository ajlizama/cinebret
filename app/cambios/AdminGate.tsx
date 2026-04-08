'use client'

import { useAuth } from '@/context/AuthContext'
import Link from 'next/link'

const ADMIN_ID = 'b5eafe05-9ec8-4b23-b0b4-137148ecbac2'

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-zinc-700 border-t-yellow-400 animate-spin" />
      </div>
    )
  }

  if (!user || user.id !== ADMIN_ID) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
        <svg className="w-16 h-16 text-zinc-700 mb-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h2 className="text-white text-xl font-bold mb-2">Acceso restringido</h2>
        <p className="text-zinc-500 text-sm mb-6 max-w-sm">Esta sección es solo para administradores de CineBret.</p>
        <Link href="/catalogo" className="bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-bold rounded-lg px-5 py-2.5 text-sm transition-colors cursor-pointer">
          Volver al inicio
        </Link>
      </div>
    )
  }

  return <>{children}</>
}

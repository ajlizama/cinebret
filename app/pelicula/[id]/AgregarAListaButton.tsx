'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

type Lista = {
  id: string
  nombre: string
  ya_tiene: boolean
}

type Props = {
  peliculaId: string
}

export default function AgregarAListaButton({ peliculaId }: Props) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [listas, setListas] = useState<Lista[]>([])
  const [cargando, setCargando] = useState(false)
  const [agregando, setAgregando] = useState<string | null>(null)

  const fetchListas = async () => {
    if (!user) return
    setCargando(true)

    const { data: membresias } = await supabase
      .from('lista_miembros')
      .select('lista_id')
      .eq('user_id', user.id)

    if (!membresias || membresias.length === 0) { setListas([]); setCargando(false); return }

    const listaIds = membresias.map((m: any) => m.lista_id)

    const [listasRes, peliculasEnListasRes] = await Promise.all([
      supabase.from('listas_compartidas').select('id, nombre').in('id', listaIds).order('created_at', { ascending: false }),
      supabase.from('lista_compartida_peliculas').select('lista_id').eq('pelicula_id', peliculaId).in('lista_id', listaIds),
    ])

    const conPelicula = new Set((peliculasEnListasRes.data ?? []).map((p: any) => p.lista_id))

    setListas((listasRes.data ?? []).map((l: any) => ({
      id: l.id,
      nombre: l.nombre,
      ya_tiene: conPelicula.has(l.id),
    })))
    setCargando(false)
  }

  const handleOpen = () => {
    setOpen(true)
    fetchListas()
  }

  const agregar = async (listaId: string) => {
    if (!user || agregando) return
    setAgregando(listaId)
    await supabase.from('lista_compartida_peliculas').insert({
      lista_id: listaId,
      pelicula_id: peliculaId,
      added_by: user.id,
    })
    setListas(prev => prev.map(l => l.id === listaId ? { ...l, ya_tiene: true } : l))
    setAgregando(null)
  }

  if (!user) return null

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 bg-zinc-800/50 border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors rounded-lg px-4 py-2 text-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        Lista compartida
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl max-w-sm mx-auto max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <p className="text-white font-semibold text-sm">Agregar a lista</p>
              <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4">
              {cargando && <p className="text-zinc-500 text-xs text-center py-4">Cargando...</p>}
              {!cargando && listas.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-zinc-400 text-sm mb-3">No tenés listas aún.</p>
                </div>
              )}
              <div className="space-y-2">
                {listas.map(l => (
                  <button
                    key={l.id}
                    onClick={() => !l.ya_tiene && agregar(l.id)}
                    disabled={l.ya_tiene || agregando === l.id}
                    className={`w-full flex items-center justify-between px-3 py-3 rounded-xl border transition-colors ${
                      l.ya_tiene
                        ? 'border-emerald-700 bg-emerald-950/30 cursor-default'
                        : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'
                    }`}
                  >
                    <span className={`text-sm font-medium ${l.ya_tiene ? 'text-zinc-400' : 'text-white'}`}>
                      {l.nombre}
                    </span>
                    {l.ya_tiene ? (
                      <span className="text-emerald-400 text-xs">Agregada ✓</span>
                    ) : agregando === l.id ? (
                      <span className="text-zinc-500 text-xs">Agregando...</span>
                    ) : (
                      <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-zinc-800">
              <Link
                href="/listas"
                onClick={() => setOpen(false)}
                className="w-full flex items-center justify-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors py-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Nueva lista
              </Link>
            </div>
          </div>
        </>
      )}
    </>
  )
}

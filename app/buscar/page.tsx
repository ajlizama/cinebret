'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

type Perfil = {
  user_id: string
  username: string
  vistas: number
  sigo: boolean
}

export default function BuscarPage() {
  const { user } = useAuth()
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<Perfil[]>([])
  const [cargando, setCargando] = useState(false)
  const [siguiendoMap, setSiguiendoMap] = useState<Record<string, boolean>>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) { setResultados([]); return }

    setCargando(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username')
        .ilike('username', `%${q}%`)
        .limit(20)

      if (!profiles || profiles.length === 0) { setResultados([]); setCargando(false); return }

      // Contar vistas por usuario
      const vistasRes = await Promise.all(
        profiles.map(p =>
          supabase.from('user_peliculas').select('*', { count: 'exact', head: true }).eq('user_id', p.user_id).eq('visto', true)
        )
      )

      // Ver a cuáles sigo
      let sigosSet: Set<string> = new Set()
      if (user) {
        const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
        sigosSet = new Set((follows ?? []).map((f: any) => f.following_id))
      }

      const merged: Perfil[] = profiles.map((p, i) => ({
        user_id: p.user_id,
        username: p.username,
        vistas: vistasRes[i].count ?? 0,
        sigo: sigosSet.has(p.user_id),
      })).filter(p => !user || p.user_id !== user.id)

      setResultados(merged)
      const map: Record<string, boolean> = {}
      merged.forEach(p => { map[p.user_id] = p.sigo })
      setSiguiendoMap(map)
      setCargando(false)
    }, 300)
  }, [busqueda, user])

  const toggleFollow = async (perfil: Perfil) => {
    if (!user) return
    const sigo = siguiendoMap[perfil.user_id]
    setSiguiendoMap(prev => ({ ...prev, [perfil.user_id]: !sigo }))
    if (sigo) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', perfil.user_id)
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: perfil.user_id })
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />
      <div className="max-w-xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-white mb-6">Buscar perfiles</h1>

        <input
          autoFocus
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por username..."
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 mb-6"
        />

        {cargando && <p className="text-zinc-500 text-sm">Buscando...</p>}

        {!cargando && busqueda && resultados.length === 0 && (
          <p className="text-zinc-500 text-sm">No se encontraron perfiles para "<span className="text-zinc-300">{busqueda}</span>"</p>
        )}

        <div className="space-y-3">
          {resultados.map(perfil => (
            <div key={perfil.user_id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
              <Link href={`/perfil/${perfil.username}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-300">
                  {perfil.username[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-white text-sm font-medium">@{perfil.username}</p>
                  <p className="text-zinc-500 text-xs">{perfil.vistas} películas vistas</p>
                </div>
              </Link>
              {user && (
                <button
                  onClick={() => toggleFollow(perfil)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    siguiendoMap[perfil.user_id]
                      ? 'border-zinc-600 text-zinc-400 hover:border-red-500 hover:text-red-400'
                      : 'bg-yellow-400 border-yellow-400 text-zinc-950 hover:bg-yellow-300'
                  }`}
                >
                  {siguiendoMap[perfil.user_id] ? 'Siguiendo' : '+ Seguir'}
                </button>
              )}
            </div>
          ))}
        </div>

        {!busqueda && (
          <p className="text-zinc-600 text-sm text-center mt-8">Escribe un username para buscar</p>
        )}
      </div>
    </main>
  )
}

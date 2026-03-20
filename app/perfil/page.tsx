'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

type Pelicula = {
  pelicula_id: string
  rating: number | null
  pelicula: {
    titulo: string
    titulo_ingles: string | null
    poster_path: string | null
  }
}

export default function MiPerfilPage() {
  const { user, username, loading } = useAuth()
  const router = useRouter()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [peliculas, setPeliculas] = useState<Pelicula[]>([])
  const [seguidores, setSeguidores] = useState(0)
  const [siguiendo, setSiguiendo] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [cargando, setCargando] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!loading && !user) { router.replace('/catalogo'); return }
    if (!user) return

    Promise.all([
      supabase.from('profiles').select('avatar_url').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_peliculas')
        .select('pelicula_id, rating, peliculas(titulo, titulo_ingles, poster_path)')
        .eq('user_id', user.id).eq('visto', true),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
    ]).then(([{ data: prof }, { data: vistas }, { count: nSeg }, { count: nSig }]) => {
      setAvatarUrl((prof as any)?.avatar_url ?? null)
      setPeliculas(
        (vistas ?? [])
          .map((r: any) => ({ pelicula_id: r.pelicula_id, rating: r.rating, pelicula: r.peliculas }))
          .filter((r: any) => r.pelicula)
          .sort((a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0))
      )
      setSeguidores(nSeg ?? 0)
      setSiguiendo(nSig ?? 0)
      setCargando(false)
    })
  }, [user, loading])

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)

    const ext = file.name.split('.').pop()
    const path = `${user.id}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadErr) { setUploading(false); return }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const urlWithBust = `${publicUrl}?t=${Date.now()}`

    await supabase.from('profiles').update({ avatar_url: urlWithBust }).eq('user_id', user.id)
    setAvatarUrl(urlWithBust)
    setUploading(false)
  }

  if (loading || cargando) return (
    <main className="min-h-screen bg-zinc-950"><Nav />
      <div className="flex items-center justify-center h-64"><p className="text-zinc-500 text-sm">Cargando...</p></div>
    </main>
  )

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />
      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-center gap-5 mb-8 flex-wrap">
          {/* Avatar */}
          <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
            <div className="w-20 h-20 rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center border-2 border-zinc-700 group-hover:border-yellow-400 transition-colors">
              {avatarUrl ? (
                <img src={avatarUrl} alt={username ?? ''} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-zinc-400">
                  {username?.[0]?.toUpperCase() ?? '?'}
                </span>
              )}
            </div>
            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-xs font-medium">{uploading ? '...' : 'Cambiar'}</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          <div>
            <h1 className="text-3xl font-bold text-white">
              {username ? `@${username}` : <span className="text-zinc-400">Sin username</span>}
            </h1>
            <div className="flex gap-4 mt-2 text-sm text-zinc-500">
              <span><span className="text-white font-semibold">{peliculas.length}</span> vistas</span>
              <span><span className="text-white font-semibold">{seguidores}</span> seguidores</span>
              <span><span className="text-white font-semibold">{siguiendo}</span> siguiendo</span>
            </div>
            <p className="text-zinc-600 text-xs mt-1">Haz clic en la foto para cambiarla</p>
          </div>
        </div>

        {/* Grid películas */}
        {peliculas.length === 0 ? (
          <p className="text-zinc-500 text-sm">Aún no has marcado películas como vistas.</p>
        ) : (
          <>
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Películas vistas</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {peliculas.map(entrada => {
                const p = entrada.pelicula
                const titulo = p.titulo_ingles || p.titulo
                return (
                  <Link key={entrada.pelicula_id} href={`/pelicula/${entrada.pelicula_id}`}>
                    <div className="bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-colors">
                      <div className="relative aspect-[2/3] bg-zinc-800">
                        {p.poster_path ? (
                          <Image src={`https://image.tmdb.org/t/p/w185${p.poster_path}`} alt={titulo} fill className="object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center p-1">
                            <span className="text-zinc-600 text-xs text-center leading-tight">{titulo}</span>
                          </div>
                        )}
                        {entrada.rating && (
                          <div className="absolute top-1 right-1 bg-zinc-900/90 rounded-full px-1.5 py-0.5 text-xs font-bold text-yellow-400">
                            {entrada.rating}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

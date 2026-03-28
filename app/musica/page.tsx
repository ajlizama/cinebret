'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Nav from '@/components/Nav'
import BackButton from '@/components/BackButton'
import { supabase } from '@/lib/supabase'

type MovieMusic = {
  id: string
  titulo: string
  titulo_ingles: string | null
  nota_imdb: number | null
  poster_path: string | null
  logo_path: string | null
  anio: number | null
  compositor: string | null
  generos: string[]
  spotifyAlbumId: string | null
}

const GENEROS_COMUNES = ['Drama', 'Acción', 'Comedia', 'Thriller', 'Ciencia ficción', 'Terror', 'Aventura', 'Animación', 'Romance']

export default function MusicaPage() {
  const [movies, setMovies] = useState<MovieMusic[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [genreFilter, setGenreFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [embedUrl, setEmbedUrl] = useState<string | null>(null)
  const [loadingEmbed, setLoadingEmbed] = useState(false)

  useEffect(() => {
    ;(async () => {
      const allEnr: any[] = []
      let offset = 0
      while (true) {
        const { data } = await supabase.from('enriquecimiento')
          .select('pelicula_id, compositor, generos')
          .range(offset, offset + 999)
        if (!data || data.length === 0) break
        allEnr.push(...data)
        if (data.length < 1000) break
        offset += 1000
      }
      const enrMap: Record<string, any> = {}
      allEnr.forEach(e => { enrMap[e.pelicula_id] = e })

      const allPels: any[] = []
      offset = 0
      while (true) {
        const { data } = await supabase.from('peliculas')
          .select('id, titulo, titulo_ingles, nota_imdb, poster_path, logo_path, anio')
          .range(offset, offset + 999)
        if (!data || data.length === 0) break
        allPels.push(...data)
        if (data.length < 1000) break
        offset += 1000
      }

      const result: MovieMusic[] = allPels
        .filter(p => p.poster_path)
        .map(p => ({
          ...p,
          compositor: enrMap[p.id]?.compositor ?? null,
          generos: enrMap[p.id]?.generos ?? [],
          spotifyAlbumId: null,
        }))
        .sort((a, b) => (b.nota_imdb ?? 0) - (a.nota_imdb ?? 0))

      setMovies(result)
      setLoading(false)
    })()
  }, [])

  const filtered = useMemo(() => {
    let list = movies
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m =>
        m.titulo.toLowerCase().includes(q) ||
        (m.titulo_ingles || '').toLowerCase().includes(q) ||
        (m.compositor || '').toLowerCase().includes(q)
      )
    }
    if (genreFilter) {
      list = list.filter(m => m.generos.some(g => g.toLowerCase().includes(genreFilter.toLowerCase())))
    }
    return list
  }, [movies, search, genreFilter])

  const [albumCache, setAlbumCache] = useState<Record<string, string | null>>({})
  const [playingInline, setPlayingInline] = useState<string | null>(null)

  const fetchAlbum = async (movie: MovieMusic): Promise<string | null> => {
    if (albumCache[movie.id] !== undefined) return albumCache[movie.id]
    try {
      const res = await fetch(`/api/spotify-search?q=${encodeURIComponent(movie.titulo_ingles || movie.titulo)}`)
      const data = await res.json()
      const url = data.album?.embedUrl ?? null
      setAlbumCache(prev => ({ ...prev, [movie.id]: url }))
      return url
    } catch { return null }
  }

  const handleExpand = async (movie: MovieMusic) => {
    if (expandedId === movie.id) { setExpandedId(null); setEmbedUrl(null); return }
    setPlayingInline(null)
    setExpandedId(movie.id)
    setLoadingEmbed(true)
    const url = await fetchAlbum(movie)
    setEmbedUrl(url)
    setLoadingEmbed(false)
  }

  const handleQuickPlay = async (e: React.MouseEvent, movie: MovieMusic) => {
    e.stopPropagation()
    if (playingInline === movie.id) { setPlayingInline(null); return }
    setExpandedId(null)
    setPlayingInline(movie.id)
    await fetchAlbum(movie)
  }

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
        <BackButton />
        <h1 className="text-2xl font-bold text-white mt-4 mb-1">Música & Soundtracks</h1>
        <p className="text-zinc-500 text-sm mb-5">Escucha los soundtracks de las películas</p>

        {/* Search + filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <input
            type="text"
            placeholder="Buscar película o compositor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          <select
            value={genreFilter}
            onChange={e => setGenreFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-300 focus:outline-none"
          >
            <option value="">Todos los géneros</option>
            {GENEROS_COMUNES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <video src="/loading.mp4" autoPlay muted loop playsInline className="w-14 h-14 object-contain" style={{ mixBlendMode: 'lighten' }} />
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.slice(0, 100).map((m, i) => (
              <div key={m.id}>
                <div
                  onClick={() => handleExpand(m)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 transition-colors cursor-pointer ${expandedId === m.id ? 'bg-zinc-800' : 'bg-zinc-900/40 hover:bg-zinc-800/60'}`}
                >
                  {/* Play button */}
                  <button onClick={(e) => handleQuickPlay(e, m)} className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${playingInline === m.id ? 'bg-green-500' : 'bg-zinc-700 hover:bg-green-500'}`}>
                    {playingInline === m.id ? (
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
                    ) : (
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    )}
                  </button>
                  <div className="relative w-14 h-20 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                    {m.poster_path && <Image src={`https://image.tmdb.org/t/p/w92${m.poster_path}`} alt="" fill className="object-cover" sizes="56px" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    {m.logo_path ? (
                      <img src={`https://image.tmdb.org/t/p/w200${m.logo_path}`} alt={m.titulo_ingles || m.titulo} className="h-6 w-auto max-w-[200px] object-contain" />
                    ) : (
                      <p className="text-white text-sm font-medium truncate">{m.titulo_ingles || m.titulo}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                      {m.anio && <span>{m.anio}</span>}
                      {m.compositor && <span>🎵 {m.compositor}</span>}
                    </div>
                  </div>
                  {m.nota_imdb && <span className="text-yellow-400 font-bold text-sm shrink-0">⭐ {m.nota_imdb}</span>}
                  <svg className="w-5 h-5 text-green-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.234 1.328a.78.78 0 01.257 1.072z"/>
                  </svg>
                </div>

                {/* Expanded: Spotify embed */}
                {expandedId === m.id && (
                  <div className="bg-zinc-900 rounded-xl p-3 mt-1 mb-2">
                    {loadingEmbed ? (
                      <div className="flex justify-center py-4">
                        <video src="/loading.mp4" autoPlay muted loop playsInline className="w-10 h-10 object-contain" style={{ mixBlendMode: 'lighten' }} />
                      </div>
                    ) : embedUrl ? (
                      <div className="rounded-xl overflow-hidden">
                        <iframe
                          src={embedUrl}
                          width="100%"
                          height="352"
                          frameBorder="0"
                          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                          loading="lazy"
                          className="rounded-xl"
                        />
                      </div>
                    ) : (
                      <p className="text-zinc-500 text-sm text-center py-4">Soundtrack no encontrado en Spotify</p>
                    )}
                    <Link href={`/pelicula/${m.id}`} className="inline-block mt-2 text-xs text-yellow-400 hover:text-yellow-300 font-medium">Ver ficha →</Link>
                  </div>
                )}

                {/* Inline mini player (quick play) */}
                {playingInline === m.id && albumCache[m.id] && (
                  <div className="rounded-xl overflow-hidden mt-1 mb-2">
                    <iframe
                      src={albumCache[m.id]!}
                      width="100%"
                      height="152"
                      frameBorder="0"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                      className="rounded-xl"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import Nav from '@/components/Nav'

const PLATAFORMAS = [
  { id: 'netflix', nombre: 'Netflix', color: 'bg-red-600', logo: '/netflix.png' },
  { id: 'disney_plus', nombre: 'Disney+', color: 'bg-blue-700', logo: '/disney_plus.svg' },
  { id: 'hbo_max', nombre: 'HBO Max', color: 'bg-purple-700', logo: '/hbo_max.png' },
  { id: 'amazon_prime', nombre: 'Prime Video', color: 'bg-cyan-600', logo: '/amazon_prime.png' },
  { id: 'apple_tv', nombre: 'Apple TV+', color: 'bg-zinc-600', logo: '/apple_tv.png' },
  { id: 'paramount_plus', nombre: 'Paramount+', color: 'bg-blue-500', logo: '/paramount_plus.svg' },
]

async function getPelicula(id: string) {
  const { data } = await supabase
    .from('peliculas')
    .select(`
      *,
      enriquecimiento (*),
      catalogos (plataforma, fecha, activo)
    `)
    .eq('id', id)
    .single()

  return data
}

export default async function PeliculaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const pelicula = await getPelicula(id)

  if (!pelicula) notFound()

  const enr = pelicula.enriquecimiento
  const hoy = new Date().toISOString().split('T')[0]
  const plataformasHoy = pelicula.catalogos
    .filter((c: any) => c.fecha === hoy && c.activo)
    .map((c: any) => c.plataforma)

  const tieneReviewAutor = enr?.review_autor

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />

      <div className="max-w-6xl mx-auto px-6 py-6">

        {/* Back */}
        <Link href="/catalogo" className="text-sm text-zinc-500 hover:text-white transition-colors mb-8 block">
          ← Volver al catálogo
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">
                {pelicula.titulo_ingles || pelicula.titulo}
              </h1>
              {pelicula.titulo_ingles && pelicula.titulo !== pelicula.titulo_ingles && (
                <p className="text-zinc-500 text-lg mb-3">{pelicula.titulo}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-zinc-400 flex-wrap">
                {pelicula.anio && <span>{pelicula.anio}</span>}
                {pelicula.nota_imdb && (
                  <span className="text-yellow-400 font-bold text-base">⭐ {pelicula.nota_imdb}</span>
                )}
                {pelicula.oscars && pelicula.oscars !== 'N/A' && (
                  <span className="flex items-center gap-1.5 text-yellow-500">
                    <img src="/oscar.png" alt="Oscar" className="h-4 w-auto" />
                    {pelicula.oscars}
                  </span>
                )}
              </div>
            </div>

            {/* Categoría */}
            {pelicula.categoria && (
              <div className="shrink-0 border border-zinc-700 bg-zinc-900 rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-zinc-500 mb-1">Categoría CineBret</p>
                <p className="text-sm font-semibold text-white">{pelicula.categoria}</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8">

          {/* Columna principal */}
          <div className="md:col-span-2 space-y-8">

            {/* Review */}
            <div>
              {tieneReviewAutor ? (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs bg-yellow-400 text-zinc-950 font-bold px-2 py-1 rounded-full">
                      ✍️ Review CineBret
                    </span>
                  </div>
                  {enr.sinopsis_chilensis && (
                    <p className="text-zinc-400 text-sm leading-relaxed mb-4 italic border-l-2 border-zinc-700 pl-4">
                      {enr.sinopsis_chilensis}
                    </p>
                  )}
                  <p className="text-zinc-200 leading-relaxed whitespace-pre-line">
                    {enr.review_autor}
                  </p>
                </>
              ) : enr?.sinopsis_chilensis ? (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-full font-medium">
                      🤖 Sinopsis IA
                    </span>
                    <span className="text-xs text-zinc-600">
                      — review de autor próximamente
                    </span>
                  </div>
                  <p className="text-zinc-300 leading-relaxed italic">
                    {enr.sinopsis_chilensis}
                  </p>
                </>
              ) : (
                <div className="border border-dashed border-zinc-800 rounded-xl p-6 text-center">
                  <p className="text-zinc-600 text-sm">
                    Pendiente de enriquecimiento — disponible en los próximos días
                  </p>
                </div>
              )}
            </div>

            {/* Géneros */}
            {enr?.generos && enr.generos.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Géneros</p>
                <div className="flex flex-wrap gap-2">
                  {enr.generos.map((g: string) => (
                    <span key={g} className="text-sm bg-zinc-800 text-zinc-300 px-3 py-1 rounded-full">
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Equipo */}
            <div className="grid grid-cols-2 gap-6">
              {enr?.director && (
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Director</p>
                  <p className="text-sm text-zinc-200">{enr.director}</p>
                </div>
              )}
              {enr?.compositor && (
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Compositor</p>
                  <p className="text-sm text-zinc-200">{enr.compositor}</p>
                </div>
              )}
              {enr?.actores && (
                <div className="col-span-2">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Reparto</p>
                  <p className="text-sm text-zinc-200">{enr.actores}</p>
                </div>
              )}
            </div>

            {/* Dónde ver */}
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Disponible en</p>
              <div className="grid grid-cols-3 gap-1.5">
                {PLATAFORMAS.map(plat => {
                  const activa = plataformasHoy.includes(plat.id)
                  return (
                    <div
                      key={plat.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-opacity ${
                        activa ? 'bg-zinc-800' : 'opacity-20'
                      }`}
                    >
                      <div className="bg-white rounded px-1 py-0.5 shrink-0">
                        <img src={plat.logo} alt={plat.nombre} className="h-3.5 w-auto object-contain" />
                      </div>
                      <span className={`text-xs truncate ${activa ? 'text-white' : 'text-zinc-500'}`}>{plat.nombre}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Links externos */}
            <div className="flex flex-wrap gap-3">
              {pelicula.imdb_id && (
                <a
                  href={`https://www.imdb.com/title/${pelicula.imdb_id}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 transition-colors rounded-lg px-4 py-2 text-sm font-medium"
                >
                  IMDb ↗
                </a>
              )}
              {pelicula.youtube_trailer_key && (
                <a
                  href={`https://www.youtube.com/watch?v=${pelicula.youtube_trailer_key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors rounded-lg px-4 py-2 text-sm font-medium"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  Trailer ↗
                </a>
              )}
              <a
                href={`https://open.spotify.com/search/${encodeURIComponent((pelicula.titulo_ingles || pelicula.titulo) + ' soundtrack')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors rounded-lg px-4 py-2 text-sm font-medium"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.234 1.328a.78.78 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.937.937 0 11-.543-1.794c3.527-1.07 9.394-.863 13.098 1.382a.937.937 0 01-.938 1.569z"/>
                </svg>
                Soundtrack ↗
              </a>
            </div>
          </div>

          {/* Columna lateral */}
          <div className="flex flex-col gap-4">

            {/* Poster */}
            {pelicula.poster_path && (
              <Image
                src={`https://image.tmdb.org/t/p/w342${pelicula.poster_path}`}
                alt={pelicula.titulo_ingles || pelicula.titulo}
                width={342}
                height={513}
                className="rounded-xl w-full object-cover"
              />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

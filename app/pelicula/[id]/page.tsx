import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'

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

  const tieneReviewAutor = enr?.es_review_autor && enr?.review_autor

  return (
    <main className="min-h-screen bg-zinc-950">
      {/* Navbar */}
      <nav className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight text-white">CineBret</Link>
          <div className="flex gap-6 text-sm text-zinc-500">
            <Link href="/" className="hover:text-white transition-colors">Inicio</Link>
            <Link href="/catalogo" className="hover:text-white transition-colors">Catálogo</Link>
            <Link href="/cambios" className="hover:text-white transition-colors">Cambios</Link>
            <Link href="/estadisticas" className="hover:text-white transition-colors">Estadísticas</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10">

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
          </div>

          {/* Columna lateral */}
          <div className="space-y-6">

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

            {/* Dónde ver */}
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Disponible en</p>
              <div className="space-y-2">
                {PLATAFORMAS.map(plat => {
                  const activa = plataformasHoy.includes(plat.id)
                  return (
                    <div
                      key={plat.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-opacity ${
                        activa ? 'bg-zinc-800' : 'opacity-25'
                      }`}
                    >
                      <div className="bg-white rounded px-1.5 py-0.5 shrink-0">
                        <img src={plat.logo} alt={plat.nombre} className="h-4 w-auto object-contain" />
                      </div>
                      <span className={activa ? 'text-white' : 'text-zinc-500'}>{plat.nombre}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Info rápida */}
            <div className="border border-zinc-800 bg-zinc-900 rounded-xl p-4 space-y-3">
              {pelicula.anio && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Año</span>
                  <span className="text-zinc-200">{pelicula.anio}</span>
                </div>
              )}
              {pelicula.nota_imdb && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">IMDB</span>
                  <span className="text-yellow-400 font-bold">⭐ {pelicula.nota_imdb}</span>
                </div>
              )}
              {pelicula.oscars && pelicula.oscars !== 'N/A' && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Oscars</span>
                  <span className="text-zinc-200">{pelicula.oscars}</span>
                </div>
              )}
              {pelicula.categoria && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Categoría</span>
                  <span className="text-zinc-200 text-right max-w-32">{pelicula.categoria}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

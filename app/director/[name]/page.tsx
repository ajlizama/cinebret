import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import Nav from '@/components/Nav'
import BackButton from '@/components/BackButton'

const GENEROS_NORMALIZE: Record<string, string> = {
  'Action': 'Acción', 'Adventure': 'Aventura', 'Animation': 'Animación',
  'Comedy': 'Comedia', 'Crime': 'Crimen', 'Documentary': 'Documental',
  'Fantasy': 'Fantasía', 'History': 'Historia', 'Horror': 'Terror',
  'Music': 'Música', 'Mystery': 'Misterio', 'Science Fiction': 'Ciencia ficción',
  'Sci-Fi': 'Ciencia ficción', 'War': 'Guerra', 'Family': 'Familia',
  'Biography': 'Biografía', 'Sport': 'Deporte', 'Accion': 'Acción',
  'Animacion': 'Animación', 'Biografia': 'Biografía', 'Fantasia': 'Fantasía',
  'Familiar': 'Familia', 'Ciencia Ficción': 'Ciencia ficción',
}
const norm = (g: string) => GENEROS_NORMALIZE[g] ?? g

const CAT_SHORT: Record<string, string> = {
  "Pa'l domingo de bajón": 'Domingo de bajón',
  "Pa' saltar del sillón": 'Saltar del sillón',
  "Pa' quedar con el cerebro como licuadora": 'Cerebro licuadora',
  "Pa' llorar a moco tendido": 'Llorar a moco tendido',
}

async function fetchAllPages<T>(
  queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const results: T[] = []
  let from = 0
  while (true) {
    const { data } = await queryFn(from, from + pageSize - 1)
    if (!data || data.length === 0) break
    results.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return results
}

export default async function DirectorPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const directorName = decodeURIComponent(name)

  const allEnr = await fetchAllPages((from, to) =>
    supabase.from('enriquecimiento')
      .select('pelicula_id, director, director_oscars, compositor, actores, generos, cast_json')
      .eq('director', directorName)
      .range(from, to)
  )

  if (allEnr.length === 0) notFound()

  const movieIds = allEnr.map(e => e.pelicula_id)
  const { data: movies } = await supabase
    .from('peliculas')
    .select('id, titulo, titulo_ingles, anio, nota_imdb, poster_path, categoria, backdrop_path, oscars')
    .in('id', movieIds)

  if (!movies || movies.length === 0) notFound()

  const enrMap: Record<string, any> = {}
  allEnr.forEach(e => { enrMap[e.pelicula_id] = e })

  const sorted = [...movies].sort((a, b) => (b.nota_imdb ?? 0) - (a.nota_imdb ?? 0))
  const conImdb = sorted.filter(m => m.nota_imdb)
  const avgImdb = conImdb.length > 0 ? (conImdb.reduce((s, m) => s + m.nota_imdb!, 0) / conImdb.length).toFixed(1) : null

  // Personal Oscars
  const dirOscars = allEnr[0]?.director_oscars ?? null

  // Best Picture wins
  const bestPicture = sorted.filter(m => {
    const osc = (m.oscars ?? '').toLowerCase()
    return osc.startsWith('ganó') && osc.includes('mejor película') && !osc.includes('animad') && !osc.includes('internacional') && !osc.includes('documental')
  }).length

  // Collaborators
  const actors: Record<string, number> = {}
  const composers: Record<string, number> = {}
  const genres: Record<string, number> = {}
  const categories: Record<string, number> = {}

  for (const m of sorted) {
    const enr = enrMap[m.id]
    if (enr?.compositor) composers[enr.compositor] = (composers[enr.compositor] ?? 0) + 1
    const actList = (enr?.actores ?? '').split(',').map((a: string) => a.trim()).filter(Boolean)
    for (const a of actList.slice(0, 5)) actors[a] = (actors[a] ?? 0) + 1
    for (const g of (enr?.generos ?? [])) { const ng = norm(g); genres[ng] = (genres[ng] ?? 0) + 1 }
    if (m.categoria) { const cat = CAT_SHORT[m.categoria] ?? m.categoria; categories[cat] = (categories[cat] ?? 0) + 1 }
  }

  const topActors = Object.entries(actors).sort(([, a], [, b]) => b - a).slice(0, 6)
  const topComposers = Object.entries(composers).sort(([, a], [, b]) => b - a).slice(0, 4)
  const topGenres = Object.entries(genres).sort(([, a], [, b]) => b - a).slice(0, 6)
  const topCats = Object.entries(categories).sort(([, a], [, b]) => b - a)

  const moviesWithBackdrop = sorted.filter(m => m.backdrop_path)
  const backdrop = moviesWithBackdrop.length > 0
    ? moviesWithBackdrop[Math.floor(Math.random() * moviesWithBackdrop.length)].backdrop_path
    : null

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />

      <div className="relative w-full overflow-hidden" style={{ minHeight: '220px' }}>
        {backdrop && (
          <>
            <img src={`https://image.tmdb.org/t/p/w1280${backdrop}`} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0.3 }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(9,9,11,0.3) 0%, rgba(9,9,11,1) 100%)' }} />
          </>
        )}

        <div className="relative max-w-5xl mx-auto px-6 pt-6 pb-8">
          <BackButton />
          <div className="mt-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Director</p>
            <h1 className="text-3xl md:text-4xl font-bold text-white">{directorName}</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-zinc-400 flex-wrap">
              <span>{sorted.length} películas</span>
              {avgImdb && <span className="text-yellow-400 font-bold">⭐ {avgImdb} promedio</span>}
              {bestPicture > 0 && <span className="text-amber-400">🏆 {bestPicture} Mejor Película</span>}
              {dirOscars != null && dirOscars > 0 && <span className="text-amber-400">🎬 {dirOscars} Oscar{dirOscars > 1 ? 's' : ''} personales</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="bg-zinc-900/60 rounded-2xl p-4 backdrop-blur">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Actores frecuentes</p>
            {topActors.map(([a, count]) => (
              <Link key={a} href={`/actor/${encodeURIComponent(a)}`} className="block text-sm text-zinc-300 hover:text-yellow-400 transition-colors py-0.5">
                {a} <span className="text-zinc-600">({count})</span>
              </Link>
            ))}
          </div>
          <div className="bg-zinc-900/60 rounded-2xl p-4 backdrop-blur">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Compositores</p>
            {topComposers.map(([c, count]) => (
              <Link key={c} href={`/compositor/${encodeURIComponent(c)}`} className="block text-sm text-zinc-300 hover:text-yellow-400 transition-colors py-0.5">
                {c} <span className="text-zinc-600">({count})</span>
              </Link>
            ))}
          </div>
          <div className="bg-zinc-900/60 rounded-2xl p-4 backdrop-blur">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Géneros</p>
            {topGenres.map(([g, count]) => (
              <p key={g} className="text-sm text-zinc-300 py-0.5">{g} <span className="text-zinc-600">({count})</span></p>
            ))}
          </div>
          <div className="bg-zinc-900/60 rounded-2xl p-4 backdrop-blur">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Categorías CineBret</p>
            {topCats.map(([c, count]) => (
              <p key={c} className="text-sm text-zinc-300 py-0.5">{c} <span className="text-zinc-600">({count})</span></p>
            ))}
          </div>
        </div>

        <h2 className="text-lg font-bold text-white mb-4">Filmografía</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {sorted.map(m => (
            <Link key={m.id} href={`/pelicula/${m.id}`} className="group">
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 mb-1 ring-2 ring-transparent group-hover:ring-yellow-400/50 transition-all">
                {m.poster_path ? (
                  <Image src={`https://image.tmdb.org/t/p/w185${m.poster_path}`} alt={m.titulo_ingles || m.titulo} fill className="object-cover" sizes="150px" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center p-2"><span className="text-zinc-600 text-xs text-center">{m.titulo_ingles || m.titulo}</span></div>
                )}
                {m.nota_imdb && <div className="absolute top-1.5 left-1.5 bg-zinc-900/90 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-yellow-400">⭐ {m.nota_imdb}</div>}
              </div>
              <p className="text-white text-xs font-semibold leading-snug line-clamp-2">{m.titulo_ingles || m.titulo}</p>
              <p className="text-zinc-500 text-[10px]">{m.anio}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}

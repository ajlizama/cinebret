import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import Nav from '@/components/Nav'
import BackButton from '@/components/BackButton'
import { fetchPersonByName, calcAge } from '@/lib/tmdb-person'
import FilmographyGrid from '@/components/FilmographyGrid'

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

export default async function CompositorPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const compositorName = decodeURIComponent(name)

  const allEnr = await fetchAllPages((from, to) =>
    supabase.from('enriquecimiento')
      .select('pelicula_id, director, compositor_oscars, compositor, actores, generos, cast_json')
      .eq('compositor', compositorName)
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
  const compOscars = allEnr[0]?.compositor_oscars ?? null

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
    ? moviesWithBackdrop[0].backdrop_path
    : null

  const person = await fetchPersonByName(compositorName)
  const age = person?.birthday ? calcAge(person.birthday, person.deathday) : null

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />

      <div className="relative w-full overflow-hidden" style={{ minHeight: '260px' }}>
        {backdrop && (
          <>
            <img loading="lazy" src={`https://image.tmdb.org/t/p/w1280${backdrop}`} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0.3 }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(9,9,11,0.3) 0%, rgba(9,9,11,1) 100%)' }} />
          </>
        )}

        <div className="relative max-w-5xl mx-auto px-6 pt-6 pb-8">
          <BackButton />
          <div className="mt-4 flex items-end gap-5">
            {person?.profile_path && (
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden bg-zinc-800 shrink-0 ring-4 ring-zinc-950">
                <img loading="lazy" src={`https://image.tmdb.org/t/p/w185${person.profile_path}`} alt={compositorName} className="w-full h-full object-cover" />
              </div>
            )}
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Compositor</p>
              <h1 className="text-3xl md:text-4xl font-bold text-white">{compositorName}</h1>
              {(age || person?.place_of_birth) && (
                <div className="flex items-center gap-3 mt-1 text-sm text-zinc-400 flex-wrap">
                  {age && <span>{person?.deathday ? `${age} años (fallecido)` : `${age} años`}</span>}
                  {person?.place_of_birth && <span className="text-zinc-500">{person.place_of_birth}</span>}
                </div>
              )}
              <div className="flex items-center gap-4 mt-1 text-sm text-zinc-400 flex-wrap">
                <span>{sorted.length} películas</span>
                {avgImdb && <span className="text-yellow-400 font-bold flex items-center gap-1"><svg className="w-3.5 h-3.5 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg> {avgImdb} promedio</span>}
                {bestPicture > 0 && <span className="text-amber-400 flex items-center gap-1"><img loading="lazy" src="/oscar.png" alt="Oscar" className="h-4 w-auto" /> {bestPicture} Mejor Pelicula</span>}
                {compOscars != null && compOscars > 0 && <span className="text-amber-400">{compOscars} Oscar{compOscars > 1 ? 's' : ''}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {person?.biography && (
          <div className="mb-8">
            <p className="text-sm text-zinc-300 leading-relaxed line-clamp-6">{person.biography}</p>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="bg-zinc-900/60 rounded-2xl p-4 backdrop-blur">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Actores frecuentes</p>
            {topActors.map(([a, count]) => (
              <Link key={a} href={`/actor/${encodeURIComponent(a)}`} className="block text-sm text-zinc-300 hover:text-yellow-400 transition-colors py-0.5">
                {a} <span className="text-zinc-600">({count})</span>
              </Link>
            ))}
          </div>
          <div className="bg-zinc-900/60 rounded-2xl p-4 backdrop-blur">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Compositores</p>
            {topComposers.map(([c, count]) => (
              <Link key={c} href={`/compositor/${encodeURIComponent(c)}`} className="block text-sm text-zinc-300 hover:text-yellow-400 transition-colors py-0.5">
                {c} <span className="text-zinc-600">({count})</span>
              </Link>
            ))}
          </div>
          <div className="bg-zinc-900/60 rounded-2xl p-4 backdrop-blur">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Géneros</p>
            {topGenres.map(([g, count]) => (
              <p key={g} className="text-sm text-zinc-300 py-0.5">{g} <span className="text-zinc-600">({count})</span></p>
            ))}
          </div>
          <div className="bg-zinc-900/60 rounded-2xl p-4 backdrop-blur">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Categorías CineBret</p>
            {topCats.map(([c, count]) => (
              <p key={c} className="text-sm text-zinc-300 py-0.5">{c} <span className="text-zinc-600">({count})</span></p>
            ))}
          </div>
        </div>

        <FilmographyGrid movies={sorted} musicFirst />
      </div>
    </main>
  )
}

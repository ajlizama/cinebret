import { supabase } from '@/lib/supabase'
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import Nav from '@/components/Nav'
import BackButton from '@/components/BackButton'
import YouTubeClip from '@/components/YouTubeClip'
import SpotifyPlayer from '@/components/SpotifyPlayer'
import ShareButton from '@/components/ShareButton'
import TemporadasBrowser from './TemporadasBrowser'
import ParentGuide from '@/components/ParentGuide'

const PLATAFORMAS = [
  { id: 'netflix', nombre: 'Netflix', color: 'bg-red-600', logo: '/netflix.png' },
  { id: 'disney_plus', nombre: 'Disney+', color: 'bg-blue-700', logo: '/disney_plus.svg' },
  { id: 'hbo_max', nombre: 'HBO Max', color: 'bg-purple-700', logo: '/hbo_max.png' },
  { id: 'amazon_prime', nombre: 'Prime Video', color: 'bg-cyan-600', logo: '/amazon_prime.png' },
  { id: 'apple_tv', nombre: 'Apple TV+', color: 'bg-zinc-600', logo: '/apple_tv.png' },
  { id: 'paramount_plus', nombre: 'Paramount+', color: 'bg-blue-500', logo: '/paramount_plus.svg' },
  { id: 'mubi', nombre: 'MUBI', color: 'bg-blue-800', logo: '/mubi.png' },
  { id: 'crunchyroll', nombre: 'Crunchyroll', color: 'bg-orange-600', logo: '/crunchyroll.png' },
]

async function getSerie(id: string) {
  // First fetch the serie itself — use maybeSingle() so missing rows return null instead of throwing
  const { data: serie } = await supabase
    .from('series')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!serie) return null

  // Fetch enrichment separately so a missing row never breaks the page
  const { data: enr } = await supabase
    .from('enriquecimiento_series')
    .select('*')
    .eq('serie_id', id)
    .maybeSingle()

  return { ...serie, enriquecimiento_series: enr }
}

async function getTemporadas(serieId: string) {
  const { data: temps } = await supabase
    .from('temporadas')
    .select('id, numero, nombre, poster_path, fecha_estreno, num_episodios, nota_tmdb')
    .eq('serie_id', serieId)
    .order('numero')

  if (!temps || temps.length === 0) return []

  const tempIds = temps.map(t => t.id)
  const { data: eps } = await supabase
    .from('episodios')
    .select('id, temporada_id, numero, nombre, sinopsis, still_path, fecha_estreno, runtime, nota_tmdb')
    .in('temporada_id', tempIds)
    .order('numero')

  const epsByTemp: Record<string, any[]> = {}
  for (const ep of (eps || [])) {
    if (!epsByTemp[ep.temporada_id]) epsByTemp[ep.temporada_id] = []
    epsByTemp[ep.temporada_id].push(ep)
  }

  return temps.map(t => ({ ...t, episodios: epsByTemp[t.id] || [] }))
}

async function getWatchProviders(serieId: string) {
  const { data } = await supabase
    .from('watch_providers_series')
    .select('platform_key, provider_type')
    .eq('serie_id', serieId)
    .eq('provider_type', 'flatrate')
    .not('platform_key', 'is', null)
  return [...new Set((data ?? []).map((wp: any) => wp.platform_key))]
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const s = await getSerie(id)
  if (!s) return { title: 'Serie no encontrada' }

  const title = `${s.titulo} (${s.anio_inicio}) — CineBret`
  const description = s.enriquecimiento_series?.sinopsis_chilensis || `Descubre ${s.titulo} en CineBret`

  return {
    title,
    description,
    openGraph: {
      title, description,
      url: `https://cinebret.cl/serie/${id}`,
      siteName: 'CineBret',
      type: 'website',
      images: s.poster_path ? [{ url: `https://image.tmdb.org/t/p/w500${s.poster_path}`, width: 500, height: 750 }] : [],
    },
  }
}

function estadoLabel(estado: string | null) {
  if (!estado) return null
  const map: Record<string, { text: string; color: string }> = {
    'Returning Series': { text: 'En emisión', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
    'Ended': { text: 'Finalizada', color: 'bg-zinc-700/50 text-zinc-300 border-zinc-600' },
    'Canceled': { text: 'Cancelada', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
    'In Production': { text: 'En producción', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    'Planned': { text: 'Planeada', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  }
  const info = map[estado] || { text: estado, color: 'bg-zinc-800 text-zinc-400 border-zinc-700' }
  return <span className={`border rounded-full px-2.5 py-0.5 text-xs font-medium ${info.color}`}>{info.text}</span>
}

export default async function SeriePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const serie = await getSerie(id)
  if (!serie) notFound()

  const enr = serie.enriquecimiento_series
  const titulo = serie.titulo_ingles || serie.titulo
  const tituloLocal = serie.titulo_latino || serie.titulo
  const [plataformas, temporadasRaw] = await Promise.all([
    getWatchProviders(id),
    getTemporadas(id),
  ])
  const anioRange = serie.anio_inicio
    ? serie.anio_fin ? `${serie.anio_inicio}–${serie.anio_fin}` : `${serie.anio_inicio}–presente`
    : null

  return (
    <main className="min-h-screen bg-zinc-950 overflow-x-hidden">
      <Nav />

      {/* ── HERO ── */}
      <div className="relative w-full overflow-hidden" style={{ minHeight: '300px' }}>
        {(serie.backdrop_path || serie.poster_path) && (
          <>
            <img
              src={`https://image.tmdb.org/t/p/w1280${serie.backdrop_path || serie.poster_path}`}
              alt="" aria-hidden
              className={`absolute inset-0 w-full h-full object-cover ${serie.backdrop_path ? 'object-center' : 'object-top scale-110'}`}
              style={{ opacity: serie.backdrop_path ? 0.45 : 0.3, filter: serie.backdrop_path ? undefined : 'blur(12px)' }}
            />
            <div className="absolute inset-0 bg-zinc-950/30" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(9,9,11,0.85) 0%, rgba(9,9,11,0.2) 50%, rgba(9,9,11,0.85) 100%)' }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(9,9,11,0) 0%, rgba(9,9,11,0.5) 60%, rgba(9,9,11,1) 100%)' }} />
          </>
        )}

        <div className="relative max-w-6xl mx-auto px-6 pt-6 pb-16">
          <BackButton />

          <div className="mt-6 flex items-start justify-between gap-4 flex-wrap">
            <div>
              {serie.logo_path ? (
                <div className="mb-2">
                  <img loading="lazy" src={`https://image.tmdb.org/t/p/w500${serie.logo_path}`} alt={titulo} className="h-16 md:h-20 w-auto max-w-full object-contain drop-shadow-lg" />
                  {serie.titulo_ingles && tituloLocal !== serie.titulo_ingles && (
                    <p className="text-zinc-400 text-sm mt-1">{tituloLocal}</p>
                  )}
                </div>
              ) : (
                <>
                  <h1 className="text-4xl font-bold text-white mb-1">{titulo}</h1>
                  {serie.titulo_ingles && tituloLocal !== serie.titulo_ingles && (
                    <p className="text-zinc-400 text-lg mb-1">{tituloLocal}</p>
                  )}
                </>
              )}
              {serie.tagline && (
                <p className="text-zinc-400 text-sm italic mb-3">&ldquo;{serie.tagline}&rdquo;</p>
              )}
              <div className="flex items-center gap-3 text-sm text-zinc-400 flex-wrap">
                {anioRange && <span>{anioRange}</span>}
                {estadoLabel(serie.estado)}
                {serie.num_temporadas && (
                  <span>{serie.num_temporadas} temporada{serie.num_temporadas > 1 ? 's' : ''}</span>
                )}
                {serie.episode_runtime && <span>{serie.episode_runtime} min/ep</span>}
                {serie.certification && (
                  <span className="border border-zinc-600 rounded px-1.5 py-0.5 text-xs font-medium">{serie.certification}</span>
                )}
                {serie.nota_imdb && (
                  <span className="text-yellow-400 font-bold text-base flex items-center gap-1">
                    <svg className="w-4 h-4 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg>
                    {serie.nota_imdb}
                  </span>
                )}
              </div>
              {serie.networks && serie.networks.length > 0 && (
                <p className="text-xs text-zinc-500 mt-2">En: <span className="text-zinc-300">{serie.networks.join(', ')}</span></p>
              )}
            </div>

            {serie.categoria && (
              <div className="shrink-0 border border-zinc-700 bg-zinc-900/70 backdrop-blur-sm rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-zinc-500 mb-1">Categoría CineBret</p>
                <p className="text-sm font-semibold text-white">{serie.categoria}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── CONTENIDO ── */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="grid md:grid-cols-3 gap-8">

          {/* Columna principal */}
          <div className="md:col-span-2 space-y-8 min-w-0">

            {/* Sinopsis */}
            {enr?.sinopsis_chilensis && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-full font-medium">Sinopsis</span>
                </div>
                <p className="text-zinc-300 leading-relaxed">{enr.sinopsis_chilensis}</p>
              </div>
            )}

            {/* Géneros */}
            {enr?.generos && enr.generos.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Géneros</p>
                <div className="flex flex-wrap gap-2">
                  {enr.generos.map((g: string) => (
                    <span key={g} className="text-sm bg-zinc-800 text-zinc-300 px-3 py-1 rounded-full">{g}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Creador / Equipo */}
            <div className="grid grid-cols-2 gap-6">
              {enr?.director && (
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Creador</p>
                  <p className="text-sm text-zinc-200">{enr.director}</p>
                </div>
              )}
              {enr?.compositor && (
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Compositor</p>
                  <p className="text-sm text-zinc-200">{enr.compositor}</p>
                </div>
              )}
            </div>

            {/* Cast con fotos */}
            {enr?.cast_json && (enr.cast_json as any[]).length > 0 && (
              <div className="min-w-0">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Reparto</p>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none -mx-6 px-6">
                  {(enr.cast_json as any[]).map((actor: any, i: number) => (
                    <Link key={i} href={`/actor/${encodeURIComponent(actor.name)}`} className="shrink-0 w-20 text-center group">
                      <div className="w-20 h-20 rounded-full overflow-hidden bg-zinc-800 mb-1.5 ring-2 ring-transparent group-hover:ring-yellow-400/50 transition-all">
                        {actor.profile_path ? (
                          <img loading="lazy" src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`} alt={actor.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-lg font-bold">{actor.name[0]}</div>
                        )}
                      </div>
                      <p className="text-white text-[10px] font-semibold leading-tight line-clamp-2">{actor.name}</p>
                      {actor.character && <p className="text-zinc-500 text-[9px] leading-tight line-clamp-1 mt-0.5">{actor.character}</p>}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Temporadas y episodios */}
            <TemporadasBrowser temporadas={temporadasRaw} />

            {/* Dónde ver */}
            {plataformas.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Dónde ver en Chile</p>
                <div className="flex flex-wrap gap-3">
                  {PLATAFORMAS.filter(pl => plataformas.includes(pl.id)).map(pl => (
                    <div key={pl.id} className={`${pl.color} rounded-xl px-4 py-2.5 flex items-center gap-2.5`}>
                      <div className="bg-white rounded px-1 py-1" style={{ height: 24 }}>
                        <img loading="lazy" src={pl.logo} alt={pl.nombre} className="h-4 w-auto object-contain" />
                      </div>
                      <span className="text-white text-sm font-medium">{pl.nombre}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Soundtrack */}
            <SpotifyPlayer movieTitle={`${serie.titulo_ingles || serie.titulo} tv series`} />

            {/* Trailer */}
            {serie.youtube_trailer_key && <YouTubeClip videoId={serie.youtube_trailer_key} />}

            {/* Series similares */}
            {enr?.similar_ids && (enr.similar_ids as number[]).length > 0 && await (async () => {
              const simIds = enr.similar_ids as number[]
              const { data: simSeries } = await supabase
                .from('series')
                .select('id, titulo, titulo_ingles, poster_path, nota_imdb, tmdb_id')
                .in('tmdb_id', simIds)
                .not('poster_path', 'is', null)
              if (!simSeries || simSeries.length === 0) return null
              const orderMap = new Map(simIds.map((id, i) => [id, i]))
              simSeries.sort((a: any, b: any) => (orderMap.get(a.tmdb_id) ?? 99) - (orderMap.get(b.tmdb_id) ?? 99))
              return (
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Si te gustó esta serie</p>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                    {simSeries.map((sim: any) => (
                      <Link key={sim.id} href={`/serie/${sim.id}`} className="shrink-0 w-28">
                        <div className="relative w-28 h-40 rounded-xl overflow-hidden bg-zinc-800 mb-1 ring-2 ring-transparent hover:ring-yellow-400/50 transition-all">
                          <Image src={`https://image.tmdb.org/t/p/w185${sim.poster_path}`} alt={sim.titulo_ingles || sim.titulo} fill className="object-cover" sizes="112px" />
                          {sim.nota_imdb && (
                            <div className="absolute top-1 left-1 bg-zinc-900/90 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-yellow-400 flex items-center gap-0.5">
                              <svg className="w-2.5 h-2.5 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg>
                              {sim.nota_imdb}
                            </div>
                          )}
                        </div>
                        <p className="text-white text-[10px] font-semibold leading-snug line-clamp-2">{sim.titulo_ingles || sim.titulo}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Guía Parental */}
            <ParentGuide serieId={serie.id} />

            {/* Keywords */}
            {enr?.keywords && (enr.keywords as string[]).length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {(enr.keywords as string[]).map((kw: string) => (
                    <span key={kw} className="text-xs bg-zinc-800 text-zinc-400 px-2.5 py-1 rounded-full">{kw}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Links externos */}
            <div className="flex flex-wrap gap-3">
              {serie.imdb_id && (
                <a href={`https://www.imdb.com/title/${serie.imdb_id}/`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 transition-colors rounded-lg px-4 py-2 text-sm font-medium">
                  IMDb
                </a>
              )}
              {serie.youtube_trailer_key && (
                <a href={`https://www.youtube.com/watch?v=${serie.youtube_trailer_key}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors rounded-lg px-4 py-2 text-sm font-medium">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  Trailer
                </a>
              )}
              <ShareButton
                data={{
                  title: serie.titulo,
                  text: `Mira "${serie.titulo}" en CineBret`,
                  url: `https://cinebret.cl/serie/${serie.id}`,
                }}
                className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors rounded-lg px-4 py-2 text-sm font-medium"
              />
            </div>
          </div>

          {/* Columna lateral: poster */}
          <div className="hidden md:flex flex-col gap-4">
            {serie.poster_path && (
              <Image
                src={`https://image.tmdb.org/t/p/w342${serie.poster_path}`}
                alt={titulo}
                width={342}
                height={513}
                className="rounded-xl w-full object-cover"
              />
            )}
            {/* Info rápida */}
            <div className="bg-zinc-900 rounded-xl p-4 space-y-3">
              {serie.num_episodios && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Episodios</span>
                  <span className="text-zinc-200">{serie.num_episodios}</span>
                </div>
              )}
              {serie.num_temporadas && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Temporadas</span>
                  <span className="text-zinc-200">{serie.num_temporadas}</span>
                </div>
              )}
              {serie.episode_runtime && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Duración/ep</span>
                  <span className="text-zinc-200">{serie.episode_runtime} min</span>
                </div>
              )}
              {serie.origin_country && serie.origin_country.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">País</span>
                  <span className="text-zinc-200">{serie.origin_country.join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

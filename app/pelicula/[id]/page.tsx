import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import Nav from '@/components/Nav'
import SeguidosQueVieron from './SeguidosQueVieron'
import ReviewSection from './ReviewSection'
import UserActions from './UserActions'
import AutorReviewLike from './AutorReviewLike'
import BackButton from '@/components/BackButton'
import RecomendarButton from './RecomendarButton'
import AgregarAListaButton from './AgregarAListaButton'
import YouTubeClip from '@/components/YouTubeClip'
import { extractYouTubeId } from '@/lib/youtube'

const PLATAFORMAS = [
  { id: 'netflix', nombre: 'Netflix', color: 'bg-red-600', logo: '/netflix.png' },
  { id: 'disney_plus', nombre: 'Disney+', color: 'bg-blue-700', logo: '/disney_plus.svg' },
  { id: 'hbo_max', nombre: 'HBO Max', color: 'bg-purple-700', logo: '/hbo_max.png' },
  { id: 'amazon_prime', nombre: 'Prime Video', color: 'bg-cyan-600', logo: '/amazon_prime.png' },
  { id: 'apple_tv', nombre: 'Apple TV+', color: 'bg-zinc-600', logo: '/apple_tv.png' },
  { id: 'paramount_plus', nombre: 'Paramount+', color: 'bg-blue-500', logo: '/paramount_plus.svg' },
  { id: 'mubi', nombre: 'MUBI', color: 'bg-blue-800', logo: '/mubi.png' },
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
  const titulo = pelicula.titulo_ingles || pelicula.titulo

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />

      {/* ── HERO: backdrop or blurred poster ── */}
      <div className="relative w-full overflow-hidden" style={{ minHeight: '300px' }}>
        {(pelicula.backdrop_path || pelicula.poster_path) && (
          <>
            <img
              src={`https://image.tmdb.org/t/p/w1280${pelicula.backdrop_path || pelicula.poster_path}`}
              alt=""
              aria-hidden
              className={`absolute inset-0 w-full h-full object-cover ${pelicula.backdrop_path ? 'object-center' : 'object-top scale-110'}`}
              style={{ opacity: pelicula.backdrop_path ? 0.45 : 0.3, filter: pelicula.backdrop_path ? undefined : 'blur(12px)' }}
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
              <h1 className="text-4xl font-bold text-white mb-1">{titulo}</h1>
              {pelicula.titulo_ingles && pelicula.titulo !== pelicula.titulo_ingles && (
                <p className="text-zinc-400 text-lg mb-1">{pelicula.titulo}</p>
              )}
              {pelicula.tagline && (
                <p className="text-zinc-400 text-sm italic mb-3">&ldquo;{pelicula.tagline}&rdquo;</p>
              )}
              <div className="flex items-center gap-4 text-sm text-zinc-400 flex-wrap">
                {pelicula.anio && <span>{pelicula.anio}</span>}
                {pelicula.runtime && <span>{pelicula.runtime} min</span>}
                {pelicula.certification && (
                  <span className="border border-zinc-600 rounded px-1.5 py-0.5 text-xs font-medium">{pelicula.certification}</span>
                )}
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
              {pelicula.collection_name && (
                <p className="text-xs text-zinc-500 mt-2">Parte de: <span className="text-zinc-300">{pelicula.collection_name}</span></p>
              )}
            </div>

            {pelicula.categoria && (
              <div className="shrink-0 border border-zinc-700 bg-zinc-900/70 backdrop-blur-sm rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-zinc-500 mb-1">Categoría CineBret</p>
                <p className="text-sm font-semibold text-white">{pelicula.categoria}</p>
              </div>
            )}
          </div>

          <UserActions peliculaId={id} />
        </div>
      </div>

      {/* ── CONTENIDO: fondo negro ── */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="grid md:grid-cols-3 gap-8">

          {/* Columna principal */}
          <div className="md:col-span-2 space-y-8">

            {/* Review / Sinopsis */}
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
                  <AutorReviewLike peliculaId={pelicula.id} />
                </>
              ) : enr?.sinopsis_chilensis ? (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-full font-medium">
                      🤖 Sinopsis IA
                    </span>
                    <span className="text-xs text-zinc-600">— review de autor próximamente</span>
                  </div>
                  <p className="text-zinc-300 leading-relaxed italic">{enr.sinopsis_chilensis}</p>
                </>
              ) : (
                <div className="border border-dashed border-zinc-800 rounded-xl p-6 text-center">
                  <p className="text-zinc-600 text-sm">Pendiente de enriquecimiento — disponible en los próximos días</p>
                </div>
              )}
            </div>

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

            {/* Equipo */}
            <div className="grid grid-cols-2 gap-6">
              {enr?.director && (
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Director</p>
                  <Link href={`/director/${encodeURIComponent(enr.director)}`} className="text-sm text-zinc-200 hover:text-yellow-400 transition-colors">{enr.director}</Link>
                </div>
              )}
              {enr?.compositor && (
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Compositor</p>
                  <Link href={`/compositor/${encodeURIComponent(enr.compositor)}`} className="text-sm text-zinc-200 hover:text-yellow-400 transition-colors">{enr.compositor}</Link>
                </div>
              )}
              {enr?.actores && !enr?.cast_json && (
                <div className="col-span-2">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Reparto</p>
                  <p className="text-sm text-zinc-200">{enr.actores}</p>
                </div>
              )}
            </div>

            {/* Cast con fotos */}
            {enr?.cast_json && (enr.cast_json as any[]).length > 0 && (
              <div className="overflow-hidden min-w-0">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Reparto</p>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                  {(enr.cast_json as any[]).map((actor: any, i: number) => (
                    <Link key={i} href={`/actor/${encodeURIComponent(actor.name)}`} className="shrink-0 w-20 text-center group">
                      <div className="w-20 h-20 rounded-full overflow-hidden bg-zinc-800 mb-1.5 ring-2 ring-transparent group-hover:ring-yellow-400/50 transition-all">
                        {actor.profile_path ? (
                          <img src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`} alt={actor.name} className="w-full h-full object-cover" />
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

            {/* Dónde ver — solo plataformas activas */}
            {PLATAFORMAS.some(plat => plataformasHoy.includes(plat.id)) ? (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Disponible en</p>
                <div className="flex flex-wrap gap-2">
                  {PLATAFORMAS.filter(plat => plataformasHoy.includes(plat.id)).map(plat => (
                    <div
                      key={plat.id}
                      className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 min-h-[44px]"
                    >
                      <div className="bg-white rounded px-1.5 py-1 shrink-0">
                        <img src={plat.logo} alt={plat.nombre} className="h-5 w-auto object-contain" />
                      </div>
                      <span className="text-sm text-white">{plat.nombre}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Disponible en</p>
                <p className="text-sm text-zinc-600">No disponible en streaming actualmente</p>
              </div>
            )}

            {/* Video clip */}
            {enr?.video_clip_url && (() => {
              const url = enr.video_clip_url as string
              const ytId = extractYouTubeId(url)
              if (ytId) return <YouTubeClip videoId={ytId} />
              return (
                <div className="relative rounded-xl overflow-hidden bg-black">
                  <video src={url} autoPlay muted loop playsInline preload="metadata"
                    className="w-full max-h-80 object-contain"
                    onClick={(e: any) => { e.currentTarget.muted = !e.currentTarget.muted }} />
                </div>
              )
            })()}

            {/* Seguidos que ya la vieron */}
            <SeguidosQueVieron peliculaId={id} />

            {/* Reviews */}
            <ReviewSection peliculaId={id} />

            {/* Películas similares */}
            {enr?.similar_ids && (enr.similar_ids as number[]).length > 0 && await (async () => {
              const simIds = enr.similar_ids as number[]
              const { data: simPels } = await supabase
                .from('peliculas')
                .select('id, titulo, titulo_ingles, poster_path, nota_imdb, tmdb_id')
                .in('tmdb_id', simIds)
                .not('poster_path', 'is', null)
                .limit(15)
              if (!simPels || simPels.length === 0) return null
              // Sort by similar_ids order
              const orderMap = new Map(simIds.map((id, i) => [id, i]))
              simPels.sort((a: any, b: any) => (orderMap.get(a.tmdb_id) ?? 99) - (orderMap.get(b.tmdb_id) ?? 99))
              return (
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Si te gustó esta película</p>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                    {simPels.map((sim: any) => (
                      <Link key={sim.id} href={`/pelicula/${sim.id}`} className="shrink-0 w-28">
                        <div className="relative w-28 h-40 rounded-xl overflow-hidden bg-zinc-800 mb-1 ring-2 ring-transparent hover:ring-yellow-400/50 transition-all">
                          <Image src={`https://image.tmdb.org/t/p/w185${sim.poster_path}`} alt={sim.titulo_ingles || sim.titulo} fill className="object-cover" sizes="112px" />
                          {sim.nota_imdb && (
                            <div className="absolute top-1 left-1 bg-zinc-900/90 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-yellow-400">⭐ {sim.nota_imdb}</div>
                          )}
                        </div>
                        <p className="text-white text-[10px] font-semibold leading-snug line-clamp-2">{sim.titulo_ingles || sim.titulo}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })()}

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

            {/* Budget / Revenue */}
            {(pelicula.budget || pelicula.revenue) && (
              <div className="flex gap-6">
                {pelicula.budget > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Presupuesto</p>
                    <p className="text-sm text-zinc-300">${(pelicula.budget / 1_000_000).toFixed(0)}M USD</p>
                  </div>
                )}
                {pelicula.revenue > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Recaudación</p>
                    <p className="text-sm text-zinc-300">${(pelicula.revenue / 1_000_000).toFixed(0)}M USD</p>
                  </div>
                )}
              </div>
            )}

            {/* Links externos */}
            <div className="flex flex-wrap gap-3">
              <RecomendarButton peliculaId={id} peliculaTitulo={titulo} />
              <AgregarAListaButton peliculaId={id} />
              {pelicula.imdb_id && (
                <a href={`https://www.imdb.com/title/${pelicula.imdb_id}/`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 transition-colors rounded-lg px-4 py-2 text-sm font-medium">
                  IMDb
                </a>
              )}
              {pelicula.youtube_trailer_key && (
                <a href={`https://www.youtube.com/watch?v=${pelicula.youtube_trailer_key}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors rounded-lg px-4 py-2 text-sm font-medium">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  Trailer
                </a>
              )}
              <a href={`https://open.spotify.com/search/${encodeURIComponent((pelicula.titulo_ingles || pelicula.titulo) + ' soundtrack')}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors rounded-lg px-4 py-2 text-sm font-medium">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.234 1.328a.78.78 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.937.937 0 11-.543-1.794c3.527-1.07 9.394-.863 13.098 1.382a.937.937 0 01-.938 1.569z"/>
                </svg>
                Soundtrack
              </a>
            </div>
          </div>

          {/* Columna lateral: poster (solo desktop) */}
          <div className="hidden md:flex flex-col gap-4">
            {pelicula.poster_path && (
              <Image
                src={`https://image.tmdb.org/t/p/w342${pelicula.poster_path}`}
                alt={titulo}
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

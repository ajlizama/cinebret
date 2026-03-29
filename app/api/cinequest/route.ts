import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY!

const GENEROS_NORMALIZE: Record<string, string> = {
  'Action': 'Accion', 'Adventure': 'Aventura', 'Animation': 'Animacion',
  'Comedy': 'Comedia', 'Crime': 'Crimen', 'Documentary': 'Documental',
  'Drama': 'Drama', 'Fantasy': 'Fantasia', 'History': 'Historia',
  'Horror': 'Terror', 'Music': 'Musica', 'Mystery': 'Misterio',
  'Romance': 'Romance', 'Science Fiction': 'Ciencia ficcion', 'Sci-Fi': 'Ciencia ficcion',
  'Thriller': 'Thriller', 'War': 'Guerra', 'Western': 'Western',
  'Family': 'Familia', 'Biography': 'Biografia', 'Sport': 'Deporte', 'Musical': 'Musical',
  'Sports': 'Deporte',
  'Accion': 'Accion', 'Acción': 'Accion', 'Animacion': 'Animacion', 'Animación': 'Animacion',
  'Biografia': 'Biografia', 'Biografía': 'Biografia',
  'Biográfico': 'Biografia', 'Fantasia': 'Fantasia', 'Fantasía': 'Fantasia',
  'Familiar': 'Familia',
  'Ciencia Ficción': 'Ciencia ficcion', 'Ciencia Ficcion': 'Ciencia ficcion',
  'Musica': 'Musica', 'Música': 'Musica', 'Deportes': 'Deporte',
  'Unknown': 'Otros', 'Desconocido': 'Otros',
}
const normalizarGenero = (g: string) => GENEROS_NORMALIZE[g] ?? g

type Tier = 'bronze' | 'silver' | 'gold' | null

type Achievement = {
  id: string
  name: string
  description: string
  icon: string
  unlocked: boolean
  progress: number
  total: number
  tier: Tier
  nextTierName: string | null
  nextTierTotal: number | null
}

function tiered(
  id: string,
  name: string,
  icon: string,
  count: number,
  bronzeReq: number,
  silverReq: number,
  goldReq: number,
  descBronze: string,
  descSilver: string,
  descGold: string,
  descLocked?: string,
): Achievement {
  let tier: Tier = null
  let total: number
  let nextTierName: string | null
  let nextTierTotal: number | null
  let description: string

  if (count >= goldReq) {
    tier = 'gold'
    total = goldReq
    nextTierName = null
    nextTierTotal = null
    description = descGold
  } else if (count >= silverReq) {
    tier = 'silver'
    total = goldReq
    nextTierName = 'Oro'
    nextTierTotal = goldReq
    description = descSilver
  } else if (count >= bronzeReq) {
    tier = 'bronze'
    total = silverReq
    nextTierName = 'Plata'
    nextTierTotal = silverReq
    description = descBronze
  } else {
    tier = null
    total = bronzeReq
    nextTierName = 'Bronce'
    nextTierTotal = bronzeReq
    description = descLocked ?? descBronze
  }

  return {
    id,
    name,
    icon,
    unlocked: tier !== null,
    progress: Math.min(count, total),
    total,
    tier,
    nextTierName,
    nextTierTotal,
    description,
  }
}

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Fetch all watched movies with their details
  const allRows: any[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('user_peliculas')
      .select('pelicula_id, rating, created_at, peliculas(titulo, anio, nota_imdb, oscars, collection_name, enriquecimiento(director, generos))')
      .eq('user_id', userId)
      .eq('visto', true)
      .range(from, from + pageSize - 1)
    if (error) {
      console.error('[CineQuest] Supabase error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  // Fetch watchlist count
  const { count: watchlistCount } = await supabase
    .from('user_peliculas')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('watchlist', true)

  const watched = allRows.filter((r: any) => r.peliculas)

  // Derived data
  const totalWatched = watched.length
  const ratings = watched.map((r: any) => r.rating).filter((r: any) => r != null) as number[]
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0

  // IMDB ratings for watched movies
  const imdbRatings = watched
    .filter((r: any) => r.rating != null && r.peliculas?.nota_imdb != null)
    .map((r: any) => ({ user: r.rating as number, imdb: r.peliculas.nota_imdb as number }))
  const avgUserForComparison = imdbRatings.length > 0 ? imdbRatings.reduce((a, b) => a + b.user, 0) / imdbRatings.length : 0
  const avgImdbForComparison = imdbRatings.length > 0 ? imdbRatings.reduce((a, b) => a + b.imdb, 0) / imdbRatings.length : 0
  const ratingDiff = Math.abs(avgUserForComparison - avgImdbForComparison)

  // Genre counts (normalized)
  const genreCounts: Record<string, number> = {}
  watched.forEach((r: any) => {
    const generos: string[] = r.peliculas?.enriquecimiento?.generos ?? []
    generos.forEach(g => {
      const norm = normalizarGenero(g)
      genreCounts[norm] = (genreCounts[norm] ?? 0) + 1
    })
  })
  const uniqueGenres = Object.keys(genreCounts).filter(g => g !== 'Otros')

  // Director counts
  const directorCounts: Record<string, number> = {}
  watched.forEach((r: any) => {
    const dir: string | null = r.peliculas?.enriquecimiento?.director
    if (dir) {
      dir.split(',').forEach(d => {
        const name = d.trim()
        if (name) directorCounts[name] = (directorCounts[name] ?? 0) + 1
      })
    }
  })

  // Max director count (for "any director" fan quest)
  const maxDirectorCount = Object.values(directorCounts).reduce((max, c) => Math.max(max, c), 0)

  // Cult movies (IMDB < 6.5)
  const cultCount = watched.filter((r: any) => {
    const imdb = r.peliculas?.nota_imdb
    return imdb != null && imdb < 6.5
  }).length

  // Decades
  const decades = new Set<number>()
  watched.forEach((r: any) => {
    const anio = r.peliculas?.anio
    if (anio) decades.add(Math.floor(anio / 10) * 10)
  })

  // Full decades check (1920s through 2020s = 11 decades)
  const fullDecades = [1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]
  const coveredDecades = fullDecades.filter(d => decades.has(d)).length

  // Pre-2000 movies
  const pre2000 = watched.filter((r: any) => {
    const anio = r.peliculas?.anio
    return anio != null && anio < 2000
  }).length

  // Current year movies
  const currentYear = new Date().getFullYear()
  const currentYearCount = watched.filter((r: any) => {
    const anio = r.peliculas?.anio
    return anio != null && anio === currentYear
  }).length

  // Oscar-winning movies
  const oscarCount = watched.filter((r: any) => {
    const oscars = r.peliculas?.oscars
    return oscars != null && oscars !== '' && oscars !== 'N/A'
  }).length

  // Collection counts (saga)
  const collectionCounts: Record<string, number> = {}
  watched.forEach((r: any) => {
    const col = r.peliculas?.collection_name
    if (col) collectionCounts[col] = (collectionCounts[col] ?? 0) + 1
  })
  const maxCollectionCount = Object.values(collectionCounts).reduce((max, c) => Math.max(max, c), 0)

  // Binge detection: 5+ movies in 7 days
  const watchDates = watched
    .map((r: any) => r.created_at ? new Date(r.created_at).getTime() : null)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b)

  let maxInWeek = 0
  if (watchDates.length >= 5) {
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000
    for (let i = 0; i < watchDates.length; i++) {
      const windowEnd = watchDates[i] + WEEK_MS
      let count = 0
      for (let j = i; j < watchDates.length && watchDates[j] <= windowEnd; j++) {
        count++
      }
      if (count > maxInWeek) maxInWeek = count
    }
  }

  // Director fan helper
  const directorFan = (name: string): number => {
    let count = 0
    Object.entries(directorCounts).forEach(([dir, c]) => {
      if (dir.toLowerCase().includes(name.toLowerCase())) count += c
    })
    return count
  }

  // Build achievements (~25)
  const achievements: Achievement[] = [
    // 1. Maratonista
    tiered('maratonista', 'Maratonista', 'film', totalWatched, 25, 100, 250,
      'Has visto 25+ peliculas. La maraton recien empieza.',
      'Has visto 100+ peliculas. Maquina imparable.',
      'Has visto 250+ peliculas. Leyenda total.',
    ),

    // 2. Cinefilo de culto
    tiered('cinefilo_culto', 'Cinefilo de culto', 'mask', cultCount, 5, 15, 30,
      '5+ peliculas con IMDB menor a 6.5.',
      '15+ peliculas de culto. El mainstream no es lo tuyo.',
      '30+ peliculas de culto. Visionario del cine marginal.',
    ),

    // 3. Explorador de decadas
    tiered('explorador', 'Explorador', 'compass', decades.size, 5, 8, 10,
      'Peliculas de 5+ decadas diferentes.',
      'Peliculas de 8+ decadas. Viajero del tiempo.',
      'Peliculas de 10+ decadas. Historiador cinematografico.',
    ),

    // 4. Nostalgico
    tiered('nostalgico', 'Nostalgico', 'clock', pre2000, 10, 30, 60,
      '10+ peliculas de antes del 2000.',
      '30+ peliculas clasicas. El cine clasico no muere.',
      '60+ peliculas clasicas. Guardian de la memoria.',
    ),

    // 5. Al dia
    tiered('al_dia', 'Al dia', 'calendar', currentYearCount, 5, 15, 30,
      `5+ peliculas del ${currentYear}.`,
      `15+ peliculas del ${currentYear}. Siempre al tanto.`,
      `30+ peliculas del ${currentYear}. Enciclopedia viviente.`,
    ),

    // 6. Eclectico
    tiered('eclectico', 'Eclectico', 'palette', uniqueGenres.length, 5, 8, 12,
      '5+ generos diferentes explorados.',
      '8+ generos. Paladar cinematografico amplio.',
      '12+ generos. Sin limites ni prejuicios.',
    ),

    // 7. Terror nocturno
    tiered('terror_nocturno', 'Terror nocturno', 'skull', genreCounts['Terror'] ?? 0, 10, 25, 50,
      '10+ peliculas de terror vistas.',
      '25+ peliculas de terror. Las pesadillas son tu zona de confort.',
      '50+ peliculas de terror. Maestro del miedo.',
    ),

    // 8. Comedia lover
    tiered('comedia_lover', 'Comedia lover', 'laugh', genreCounts['Comedia'] ?? 0, 10, 25, 50,
      '10+ comedias vistas.',
      '25+ comedias. La risa es tu terapia.',
      '50+ comedias. Embajador de la comedia.',
    ),

    // 9. Drama queen
    tiered('drama_queen', 'Drama queen', 'heart', genreCounts['Drama'] ?? 0, 10, 25, 50,
      '10+ dramas vistos.',
      '25+ dramas. Las lagrimas son arte.',
      '50+ dramas. Corazon de celuloide.',
    ),

    // 10. Accion total
    tiered('accion_total', 'Accion total', 'lightning', genreCounts['Accion'] ?? 0, 10, 25, 50,
      '10+ peliculas de accion.',
      '25+ peliculas de accion. Adicto a la adrenalina.',
      '50+ peliculas de accion. Heroe de accion.',
    ),

    // 11. Mente maestra (Thriller)
    tiered('mente_maestra', 'Mente maestra', 'brain', genreCounts['Thriller'] ?? 0, 10, 25, 50,
      '10+ thrillers vistos.',
      '25+ thrillers. Analista del suspenso.',
      '50+ thrillers. Cerebro de acero.',
    ),

    // 12. Documentalista
    tiered('documentalista', 'Documentalista', 'eye', genreCounts['Documental'] ?? 0, 5, 15, 30,
      '5+ documentales vistos.',
      '15+ documentales. Buscador de la verdad.',
      '30+ documentales. La realidad supera la ficcion.',
    ),

    // 13. Ciencia ficcion
    tiered('sci_fi_fan', 'Viajero espacial', 'rocket', genreCounts['Ciencia ficcion'] ?? 0, 10, 25, 50,
      '10+ peliculas de ciencia ficcion.',
      '25+ peliculas de sci-fi. Explorador de galaxias.',
      '50+ peliculas de sci-fi. Ciudadano del cosmos.',
    ),

    // 14-18. Director fans (tiered)
    ...([
      { key: 'kubrick', name: 'Kubrick Fan', director: 'Kubrick', icon: 'clapperboard' },
      { key: 'nolan', name: 'Nolan Fan', director: 'Nolan', icon: 'clapperboard' },
      { key: 'spielberg', name: 'Spielberg Fan', director: 'Spielberg', icon: 'clapperboard' },
      { key: 'tarantino', name: 'Tarantino Fan', director: 'Tarantino', icon: 'clapperboard' },
      { key: 'scorsese', name: 'Scorsese Fan', director: 'Scorsese', icon: 'clapperboard' },
    ] as const).map(({ key, name, director, icon }) => {
      const count = directorFan(director)
      return tiered(`fan_${key}`, name, icon, count, 3, 5, 8,
        `3+ peliculas de ${director}.`,
        `5+ peliculas de ${director}. Verdadero discipulo.`,
        `8+ peliculas de ${director}. Conocedor absoluto.`,
      )
    }),

    // 19. Binge Watcher
    tiered('binge_watcher', 'Binge Watcher', 'bolt', maxInWeek, 5, 8, 12,
      '5+ peliculas en una semana.',
      '8+ peliculas en una semana. Maraton extrema.',
      '12+ peliculas en una semana. Sin frenos.',
    ),

    // 20. Decada completa
    tiered('decada_completa', 'Decada completa', 'globe', coveredDecades, 5, 8, 11,
      'Peliculas de 5+ decadas clave (1920s-2020s).',
      'Peliculas de 8+ decadas clave. Casi completo.',
      'Todas las decadas cubiertas. Historiador total.',
    ),

    // 21. Oscar Obsession
    tiered('oscar_obsession', 'Oscar Obsession', 'trophy', oscarCount, 10, 25, 50,
      '10+ peliculas ganadoras de Oscar.',
      '25+ peliculas con Oscar. Votante de la academia.',
      '50+ peliculas con Oscar. Archivista del Oscar.',
    ),

    // 22. Saga Master
    tiered('saga_master', 'Saga Master', 'collection', maxCollectionCount, 3, 5, 8,
      '3+ peliculas de una misma saga.',
      '5+ peliculas de una saga. Fan dedicado.',
      '8+ peliculas de una saga. Completista absoluto.',
    ),

    // 23. Rating Machine
    tiered('rating_machine', 'Rating Machine', 'star', ratings.length, 25, 50, 100,
      '25+ peliculas calificadas.',
      '50+ peliculas calificadas. Maquina de ratings.',
      '100+ peliculas calificadas. Critico profesional.',
    ),

    // 24. Watchlist Warrior
    tiered('watchlist_warrior', 'Watchlist Warrior', 'bookmark', watchlistCount ?? 0, 20, 50, 100,
      '20+ peliculas en tu watchlist.',
      '50+ en watchlist. Acaparador cinematografico.',
      '100+ en watchlist. Coleccionista infinito.',
    ),

    // 25. Top Critic (aligned with IMDB)
    (() => {
      const hasEnoughData = imdbRatings.length >= 10
      const aligned = hasEnoughData && ratingDiff < 0.5
      return {
        id: 'top_critic',
        name: 'Top Critic',
        description: aligned
          ? 'Tu promedio difiere < 0.5 del promedio IMDB. Estas alineado con la critica.'
          : `Califica 10+ peliculas y alineate con IMDB (diff actual: ${hasEnoughData ? ratingDiff.toFixed(1) : '?'}).`,
        icon: 'badge',
        unlocked: aligned,
        progress: aligned ? 1 : 0,
        total: 1,
        tier: aligned ? 'gold' as Tier : null,
        nextTierName: aligned ? null : 'Oro',
        nextTierTotal: aligned ? null : 1,
      }
    })(),

    // 26. Contrarian
    (() => {
      const hasEnoughData = imdbRatings.length >= 10
      const contrarian = hasEnoughData && ratingDiff > 2.0
      return {
        id: 'contrarian',
        name: 'Contrarian',
        description: contrarian
          ? 'Tu promedio difiere > 2.0 del IMDB. Rebelde del cine.'
          : `Califica 10+ peliculas y desmarcate del IMDB (diff actual: ${hasEnoughData ? ratingDiff.toFixed(1) : '?'}).`,
        icon: 'rebel',
        unlocked: contrarian,
        progress: contrarian ? 1 : 0,
        total: 1,
        tier: contrarian ? 'gold' as Tier : null,
        nextTierName: contrarian ? null : 'Oro',
        nextTierTotal: contrarian ? null : 1,
      }
    })(),

    // 27. Critico exigente
    (() => {
      const enough = ratings.length >= 5
      const exigente = enough && avgRating < 6.0
      return {
        id: 'critico_exigente',
        name: 'Critico exigente',
        description: exigente
          ? 'Rating promedio menor a 6.0. Dificil de impresionar.'
          : 'Califica 5+ peliculas con promedio < 6.0.',
        icon: 'monocle',
        unlocked: exigente,
        progress: exigente ? 1 : 0,
        total: 1,
        tier: exigente ? 'gold' as Tier : null,
        nextTierName: exigente ? null : 'Oro',
        nextTierTotal: exigente ? null : 1,
      }
    })(),

    // 28. Fan incondicional
    (() => {
      const enough = ratings.length >= 5
      const fan = enough && avgRating > 8.5
      return {
        id: 'fan_incondicional',
        name: 'Fan incondicional',
        description: fan
          ? 'Rating promedio mayor a 8.5. Todo te parece una obra maestra.'
          : 'Califica 5+ peliculas con promedio > 8.5.',
        icon: 'sparkle',
        unlocked: fan,
        progress: fan ? 1 : 0,
        total: 1,
        tier: fan ? 'gold' as Tier : null,
        nextTierName: fan ? null : 'Oro',
        nextTierTotal: fan ? null : 1,
      }
    })(),
  ]

  // Count total tiers for overall level
  const tierCount = achievements.reduce((sum, a) => {
    if (a.tier === 'gold') return sum + 3
    if (a.tier === 'silver') return sum + 2
    if (a.tier === 'bronze') return sum + 1
    return sum
  }, 0)

  let overallLevel: string
  if (tierCount >= 50) overallLevel = 'Dios del celuloide'
  else if (tierCount >= 31) overallLevel = 'Leyenda del cine'
  else if (tierCount >= 16) overallLevel = 'Cinefilo veterano'
  else if (tierCount >= 6) overallLevel = 'Cinefilo en formacion'
  else overallLevel = 'Espectador casual'

  return NextResponse.json({
    achievements,
    stats: {
      totalWatched,
      avgRating: Math.round(avgRating * 10) / 10,
      uniqueGenres: uniqueGenres.length,
    },
    tierCount,
    overallLevel,
  })
}

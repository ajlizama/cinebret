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

  // Build achievements
  const achievements: Achievement[] = [
    // --- GENERAL ---
    tiered('maratonista', 'Maratonista', 'film', totalWatched, 50, 200, 500,
      '50+ peliculas vistas. La maraton recien empieza.',
      '200+ peliculas. Maquina imparable del cine.',
      '500+ peliculas. Leyenda viviente.',
    ),
    tiered('cinefilo_culto', 'Cinefilo de culto', 'mask', cultCount, 10, 30, 75,
      '10+ peliculas con IMDB menor a 6.5.',
      '30+ peliculas de culto. El mainstream no es lo tuyo.',
      '75+ peliculas de culto. Visionario del cine marginal.',
    ),
    tiered('explorador', 'Explorador', 'compass', decades.size, 5, 8, 10,
      'Peliculas de 5+ decadas diferentes.',
      'Peliculas de 8+ decadas. Viajero del tiempo.',
      'Peliculas de 10+ decadas. Historiador cinematografico.',
    ),
    tiered('nostalgico', 'Nostalgico', 'clock', pre2000, 20, 60, 150,
      '20+ peliculas de antes del 2000.',
      '60+ peliculas clasicas. El cine clasico no muere.',
      '150+ clasicas. Guardian de la memoria cinematografica.',
    ),
    tiered('al_dia', 'Al dia', 'calendar', currentYearCount, 10, 30, 60,
      `10+ peliculas del ${currentYear}.`,
      `30+ peliculas del ${currentYear}. Siempre al tanto.`,
      `60+ peliculas del ${currentYear}. Enciclopedia viviente.`,
    ),
    tiered('eclectico', 'Eclectico', 'palette', uniqueGenres.length, 6, 10, 14,
      '6+ generos diferentes explorados.',
      '10+ generos. Paladar cinematografico amplio.',
      '14+ generos. Sin limites ni prejuicios.',
    ),
    tiered('binge_watcher', 'Binge Watcher', 'bolt', maxInWeek, 5, 10, 15,
      '5+ peliculas en una semana.',
      '10+ peliculas en una semana. Maraton extrema.',
      '15+ peliculas en una semana. Ritmo sobrehumano.',
    ),
    tiered('decada_completa', 'Decada completa', 'globe', coveredDecades, 5, 8, 11,
      'Peliculas de 5+ decadas clave (1920s-2020s).',
      'Peliculas de 8+ decadas clave.',
      'Todas las decadas cubiertas. Historiador total.',
    ),
    tiered('oscar_obsession', 'Oscar Obsession', 'trophy', oscarCount, 15, 50, 100,
      '15+ peliculas ganadoras de Oscar.',
      '50+ peliculas con Oscar. Votante de la academia.',
      '100+ peliculas con Oscar. Archivista del Oscar.',
    ),
    tiered('saga_master', 'Saga Master', 'collection', maxCollectionCount, 3, 6, 10,
      '3+ peliculas de una misma saga.',
      '6+ peliculas de una saga. Fan dedicado.',
      '10+ peliculas de una saga. Completista absoluto.',
    ),
    tiered('rating_machine', 'Rating Machine', 'star', ratings.length, 50, 150, 300,
      '50+ peliculas calificadas.',
      '150+ peliculas calificadas. Maquina de ratings.',
      '300+ peliculas calificadas. Critico profesional.',
    ),
    tiered('watchlist_warrior', 'Watchlist Warrior', 'bookmark', watchlistCount ?? 0, 30, 100, 250,
      '30+ peliculas en tu watchlist.',
      '100+ en watchlist. Acaparador cinematografico.',
      '250+ en watchlist. Coleccionista infinito.',
    ),

    // --- GENEROS ---
    tiered('terror_nocturno', 'Terror nocturno', 'skull', genreCounts['Terror'] ?? 0, 15, 40, 80,
      '15+ peliculas de terror vistas.',
      '40+ peliculas de terror. Las pesadillas son tu zona de confort.',
      '80+ peliculas de terror. Maestro del miedo.',
    ),
    tiered('comedia_lover', 'Comedia lover', 'laugh', genreCounts['Comedia'] ?? 0, 15, 40, 80,
      '15+ comedias vistas.',
      '40+ comedias. La risa es tu terapia.',
      '80+ comedias. Embajador de la comedia.',
    ),
    tiered('drama_queen', 'Drama queen', 'heart', genreCounts['Drama'] ?? 0, 15, 50, 100,
      '15+ dramas vistos.',
      '50+ dramas. Las lagrimas son arte.',
      '100+ dramas. Corazon de celuloide.',
    ),
    tiered('accion_total', 'Accion total', 'lightning', genreCounts['Accion'] ?? 0, 15, 40, 80,
      '15+ peliculas de accion.',
      '40+ peliculas de accion. Adicto a la adrenalina.',
      '80+ peliculas de accion. Heroe de accion.',
    ),
    tiered('mente_maestra', 'Mente maestra', 'brain', genreCounts['Thriller'] ?? 0, 15, 40, 80,
      '15+ thrillers vistos.',
      '40+ thrillers. Analista del suspenso.',
      '80+ thrillers. Cerebro de acero.',
    ),
    tiered('documentalista', 'Documentalista', 'eye', genreCounts['Documental'] ?? 0, 10, 30, 60,
      '10+ documentales vistos.',
      '30+ documentales. Buscador de la verdad.',
      '60+ documentales. La realidad supera la ficcion.',
    ),
    tiered('sci_fi_fan', 'Viajero espacial', 'rocket', genreCounts['Ciencia ficcion'] ?? 0, 15, 40, 80,
      '15+ peliculas de ciencia ficcion.',
      '40+ peliculas de sci-fi. Explorador de galaxias.',
      '80+ peliculas de sci-fi. Ciudadano del cosmos.',
    ),
    tiered('romantico', 'Romantico empedernido', 'heart', genreCounts['Romance'] ?? 0, 10, 30, 60,
      '10+ peliculas de romance.',
      '30+ romances. Creyente del amor cinematografico.',
      '60+ romances. El amor es tu genero.',
    ),
    tiered('aventurero', 'Aventurero', 'compass', genreCounts['Aventura'] ?? 0, 15, 40, 80,
      '15+ peliculas de aventura.',
      '40+ aventuras. Explorador incansable.',
      '80+ aventuras. Indiana Jones seria tu aprendiz.',
    ),
    tiered('animacion_fan', 'Mundo animado', 'palette', genreCounts['Animacion'] ?? 0, 10, 25, 50,
      '10+ peliculas de animacion.',
      '25+ animadas. El arte no tiene edad.',
      '50+ animadas. Maestro de la animacion.',
    ),
    tiered('guerra_fan', 'Soldado de cine', 'badge', genreCounts['Guerra'] ?? 0, 5, 15, 30,
      '5+ peliculas de guerra.',
      '15+ belicas. Estratega de butaca.',
      '30+ belicas. General del cine belico.',
    ),
    tiered('crimen_fan', 'Mente criminal', 'eye', genreCounts['Crimen'] ?? 0, 10, 30, 60,
      '10+ peliculas de crimen.',
      '30+ de crimen. Conoces todos los trucos.',
      '60+ de crimen. El padrino te pediria consejo.',
    ),

    // --- DIRECTORES ---
    ...([
      { key: 'kubrick', name: 'Kubrick Fan', director: 'Kubrick', icon: 'dir_kubrick' },
      { key: 'nolan', name: 'Nolan Fan', director: 'Nolan', icon: 'dir_nolan' },
      { key: 'spielberg', name: 'Spielberg Fan', director: 'Spielberg', icon: 'dir_spielberg' },
      { key: 'tarantino', name: 'Tarantino Fan', director: 'Tarantino', icon: 'dir_tarantino' },
      { key: 'scorsese', name: 'Scorsese Fan', director: 'Scorsese', icon: 'dir_scorsese' },
      { key: 'fincher', name: 'Fincher Fan', director: 'Fincher', icon: 'dir_fincher' },
      { key: 'villeneuve', name: 'Villeneuve Fan', director: 'Denis Villeneuve', icon: 'dir_villeneuve' },
      { key: 'coppola', name: 'Coppola Fan', director: 'Coppola', icon: 'dir_coppola' },
      { key: 'hitchcock', name: 'Hitchcock Fan', director: 'Hitchcock', icon: 'dir_hitchcock' },
      { key: 'wes_anderson', name: 'Wes Anderson Fan', director: 'Wes Anderson', icon: 'dir_wes' },
      { key: 'ridley_scott', name: 'Ridley Scott Fan', director: 'Ridley Scott', icon: 'dir_ridley' },
      { key: 'coen', name: 'Coen Fan', director: 'Coen', icon: 'dir_coen' },
      { key: 'park_chanwook', name: 'Park Chan-wook Fan', director: 'Park Chan', icon: 'dir_park' },
      { key: 'miyazaki', name: 'Miyazaki Fan', director: 'Miyazaki', icon: 'dir_miyazaki' },
      { key: 'bong', name: 'Bong Joon-ho Fan', director: 'Bong Joon', icon: 'dir_bong' },
      { key: 'zemeckis', name: 'Zemeckis Fan', director: 'Zemeckis', icon: 'dir_zemeckis' },
      { key: 'cameron', name: 'James Cameron Fan', director: 'Cameron', icon: 'dir_cameron' },
      { key: 'lynch', name: 'David Lynch Fan', director: 'Lynch', icon: 'dir_lynch' },
      { key: 'woody_allen', name: 'Woody Allen Fan', director: 'Woody Allen', icon: 'dir_woody' },
      { key: 'clint', name: 'Clint Eastwood Fan', director: 'Eastwood', icon: 'dir_clint' },
    ] as const).map(({ key, name, director, icon }) => {
      const count = directorFan(director)
      return tiered(`fan_${key}`, name, icon, count, 3, 6, 10,
        `3+ peliculas de ${director}.`,
        `6+ peliculas de ${director}. Verdadero discipulo.`,
        `10+ peliculas de ${director}. Conocedor absoluto.`,
      )
    }),

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
  if (tierCount >= 80) overallLevel = 'Dios del celuloide'
  else if (tierCount >= 55) overallLevel = 'Leyenda del cine'
  else if (tierCount >= 35) overallLevel = 'Cinefilo veterano'
  else if (tierCount >= 15) overallLevel = 'Cinefilo en formacion'
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

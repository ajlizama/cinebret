import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY!

const GENEROS_NORMALIZE: Record<string, string> = {
  'Action': 'Acción', 'Adventure': 'Aventura', 'Animation': 'Animación',
  'Comedy': 'Comedia', 'Crime': 'Crimen', 'Documentary': 'Documental',
  'Drama': 'Drama', 'Fantasy': 'Fantasía', 'History': 'Historia',
  'Horror': 'Terror', 'Music': 'Música', 'Mystery': 'Misterio',
  'Romance': 'Romance', 'Science Fiction': 'Ciencia ficción', 'Sci-Fi': 'Ciencia ficción',
  'Thriller': 'Thriller', 'War': 'Guerra', 'Western': 'Western',
  'Family': 'Familia', 'Biography': 'Biografía', 'Sport': 'Deporte', 'Musical': 'Musical',
  'Sports': 'Deporte',
  'Accion': 'Acción', 'Animacion': 'Animación', 'Biografia': 'Biografía',
  'Biográfico': 'Biografía', 'Fantasia': 'Fantasía', 'Familiar': 'Familia',
  'Ciencia Ficción': 'Ciencia ficción', 'Ciencia Ficcion': 'Ciencia ficción',
  'Musica': 'Música', 'Deportes': 'Deporte',
  'Unknown': 'Otros', 'Desconocido': 'Otros',
}
const normalizarGenero = (g: string) => GENEROS_NORMALIZE[g] ?? g

type Achievement = {
  id: string
  name: string
  description: string
  icon: string
  unlocked: boolean
  progress: number
  total: number
  tier?: 'bronze' | 'silver' | 'gold' | null
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
      .select('pelicula_id, rating, peliculas(titulo, anio, nota_imdb, enriquecimiento(director, generos))')
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

  const watched = allRows.filter((r: any) => r.peliculas)

  // Derived data
  const totalWatched = watched.length
  const ratings = watched.map((r: any) => r.rating).filter((r: any) => r != null) as number[]
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0

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
    // 1. Maratonista (tiered)
    (() => {
      let tier: 'bronze' | 'silver' | 'gold' | null = null
      let total = 10
      if (totalWatched >= 100) { tier = 'gold'; total = 100 }
      else if (totalWatched >= 50) { tier = 'silver'; total = 50 }
      else if (totalWatched >= 10) { tier = 'bronze'; total = 10 }
      else { total = 10 }
      return {
        id: 'maratonista',
        name: 'Maratonista',
        description: tier === 'gold' ? '100+ películas vistas. Leyenda total.'
          : tier === 'silver' ? '50+ películas vistas. Máquina imparable.'
          : '10+ películas vistas. La maratón recién empieza.',
        icon: '🏃',
        unlocked: totalWatched >= 10,
        progress: Math.min(totalWatched, total),
        total,
        tier,
      }
    })(),

    // 2. Cinéfilo de culto
    {
      id: 'cinefilo_culto',
      name: 'Cinéfilo de culto',
      description: '5+ películas con IMDB menor a 6.5. El cine no es solo blockbusters.',
      icon: '🎭',
      unlocked: cultCount >= 5,
      progress: Math.min(cultCount, 5),
      total: 5,
    },

    // 3-7. Director fans
    ...[
      { key: 'kubrick', name: 'Kubrick Fan', director: 'Kubrick', icon: '🎬' },
      { key: 'nolan', name: 'Nolan Fan', director: 'Nolan', icon: '🌀' },
      { key: 'spielberg', name: 'Spielberg Fan', director: 'Spielberg', icon: '🦖' },
      { key: 'tarantino', name: 'Tarantino Fan', director: 'Tarantino', icon: '💉' },
      { key: 'scorsese', name: 'Scorsese Fan', director: 'Scorsese', icon: '🎰' },
    ].map(({ key, name, director, icon }) => {
      const count = directorFan(director)
      return {
        id: `fan_${key}`,
        name,
        description: `5+ películas de ${director}. Verdadero discípulo del maestro.`,
        icon,
        unlocked: count >= 5,
        progress: Math.min(count, 5),
        total: 5,
      }
    }),

    // 8. Explorador (10+ decades)
    {
      id: 'explorador',
      name: 'Explorador',
      description: 'Películas de 10+ décadas diferentes. Viajero del tiempo cinematográfico.',
      icon: '🧭',
      unlocked: decades.size >= 10,
      progress: Math.min(decades.size, 10),
      total: 10,
    },

    // 9. Nostálgico
    {
      id: 'nostalgico',
      name: 'Nostálgico',
      description: '10+ películas de antes del 2000. El cine clásico no muere.',
      icon: '📼',
      unlocked: pre2000 >= 10,
      progress: Math.min(pre2000, 10),
      total: 10,
    },

    // 10. Al día
    {
      id: 'al_dia',
      name: 'Al día',
      description: `10+ películas del ${currentYear}. Siempre al tanto de lo nuevo.`,
      icon: '🆕',
      unlocked: currentYearCount >= 10,
      progress: Math.min(currentYearCount, 10),
      total: 10,
    },

    // 11. Ecléctico
    {
      id: 'eclectico',
      name: 'Ecléctico',
      description: '5+ géneros diferentes. Tu paladar cinematográfico no tiene límites.',
      icon: '🎨',
      unlocked: uniqueGenres.length >= 5,
      progress: Math.min(uniqueGenres.length, 5),
      total: 5,
    },

    // 12. Crítico exigente
    {
      id: 'critico_exigente',
      name: 'Crítico exigente',
      description: 'Rating promedio menor a 6.0. Difícil de impresionar.',
      icon: '🧐',
      unlocked: ratings.length >= 5 && avgRating < 6.0,
      progress: ratings.length >= 5 ? (avgRating < 6.0 ? 1 : 0) : 0,
      total: 1,
    },

    // 13. Fan incondicional
    {
      id: 'fan_incondicional',
      name: 'Fan incondicional',
      description: 'Rating promedio mayor a 8.5. Todo te parece una obra maestra.',
      icon: '🤩',
      unlocked: ratings.length >= 5 && avgRating > 8.5,
      progress: ratings.length >= 5 ? (avgRating > 8.5 ? 1 : 0) : 0,
      total: 1,
    },

    // 14. Terror nocturno
    {
      id: 'terror_nocturno',
      name: 'Terror nocturno',
      description: '10+ películas de terror. Las pesadillas son tu zona de confort.',
      icon: '👻',
      unlocked: (genreCounts['Terror'] ?? 0) >= 10,
      progress: Math.min(genreCounts['Terror'] ?? 0, 10),
      total: 10,
    },

    // 15. Comedia lover
    {
      id: 'comedia_lover',
      name: 'Comedia lover',
      description: '10+ comedias vistas. La risa es tu terapia favorita.',
      icon: '😂',
      unlocked: (genreCounts['Comedia'] ?? 0) >= 10,
      progress: Math.min(genreCounts['Comedia'] ?? 0, 10),
      total: 10,
    },

    // 16. Drama queen
    {
      id: 'drama_queen',
      name: 'Drama queen',
      description: '10+ dramas vistos. Las lágrimas son arte.',
      icon: '💔',
      unlocked: (genreCounts['Drama'] ?? 0) >= 10,
      progress: Math.min(genreCounts['Drama'] ?? 0, 10),
      total: 10,
    },
  ]

  return NextResponse.json({ achievements, stats: { totalWatched, avgRating: Math.round(avgRating * 10) / 10, uniqueGenres: uniqueGenres.length } })
}

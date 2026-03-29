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
const norm = (g: string) => GENEROS_NORMALIZE[g] ?? g

export async function POST(request: NextRequest) {
  try {
    const { userIds, plataformas } = await request.json() as {
      userIds: string[]
      plataformas: string[]
    }

    if (!userIds || userIds.length < 2 || userIds.length > 4) {
      return NextResponse.json({ error: 'Se necesitan entre 2 y 4 participantes' }, { status: 400 })
    }
    if (!plataformas || plataformas.length === 0) {
      return NextResponse.json({ error: 'Selecciona al menos una plataforma' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Build taste profile for each user (genre weights from watched movies)
    const tasteProfiles: Record<string, Record<string, number>> = {}
    const watchedSets: Record<string, Set<string>> = {}

    for (const uid of userIds) {
      const genreCount: Record<string, number> = {}
      const watched = new Set<string>()
      let from = 0
      const pageSize = 1000

      while (true) {
        const { data } = await supabase
          .from('user_peliculas')
          .select('pelicula_id, rating, peliculas(enriquecimiento(generos))')
          .eq('user_id', uid)
          .eq('visto', true)
          .range(from, from + pageSize - 1)

        if (!data || data.length === 0) break

        for (const row of data as any[]) {
          watched.add(row.pelicula_id)
          const generos: string[] = row.peliculas?.enriquecimiento?.generos ?? []
          const weight = row.rating ? row.rating / 10 : 0.5
          for (const g of generos) {
            const ng = norm(g)
            genreCount[ng] = (genreCount[ng] ?? 0) + weight
          }
        }

        if (data.length < pageSize) break
        from += pageSize
      }

      // Normalize to 0-1 range
      const max = Math.max(...Object.values(genreCount), 1)
      const normalized: Record<string, number> = {}
      for (const [g, c] of Object.entries(genreCount)) {
        normalized[g] = c / max
      }
      tasteProfiles[uid] = normalized
      watchedSets[uid] = watched
    }

    // 2. Find movies already watched by ALL participants (exclude them)
    const allWatched = new Set<string>()
    for (const uid of userIds) {
      for (const pid of watchedSets[uid]) {
        // Only exclude if ALL users have watched it
        if (userIds.every(u => watchedSets[u].has(pid))) {
          allWatched.add(pid)
        }
      }
    }

    // 3. Find all genres that appear in at least 2 users' profiles
    const allGenres = new Set<string>()
    for (const profile of Object.values(tasteProfiles)) {
      for (const g of Object.keys(profile)) allGenres.add(g)
    }

    // 4. Get latest catalog date
    const { data: fechaRow } = await supabase
      .from('catalogos')
      .select('fecha')
      .eq('activo', true)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle()

    const fecha = (fechaRow as any)?.fecha ?? new Date().toISOString().split('T')[0]

    // 5. Get active catalog entries for selected platforms
    const { data: catEntries } = await supabase
      .from('catalogos')
      .select('pelicula_id, plataforma')
      .eq('fecha', fecha)
      .eq('activo', true)
      .in('plataforma', plataformas)

    if (!catEntries || catEntries.length === 0) {
      return NextResponse.json({ movies: [] })
    }

    // Build map: pelicula_id -> platforms
    const platMap: Record<string, string[]> = {}
    for (const c of catEntries) {
      if (!platMap[c.pelicula_id]) platMap[c.pelicula_id] = []
      if (!platMap[c.pelicula_id].includes(c.plataforma)) {
        platMap[c.pelicula_id].push(c.plataforma)
      }
    }

    // Get unique movie IDs available on platforms (excluding all-watched)
    const candidateIds = Object.keys(platMap).filter(id => !allWatched.has(id))

    if (candidateIds.length === 0) {
      return NextResponse.json({ movies: [] })
    }

    // 6. Fetch movie details + genres in batches
    type MovieCandidate = {
      id: string
      titulo: string
      titulo_ingles: string | null
      anio: number | null
      nota_imdb: number | null
      poster_path: string | null
      generos: string[]
      plataformas: string[]
      score: number
    }

    const candidates: MovieCandidate[] = []
    const batchSize = 500

    for (let i = 0; i < candidateIds.length; i += batchSize) {
      const batch = candidateIds.slice(i, i + batchSize)
      const { data: movies } = await supabase
        .from('peliculas')
        .select('id, titulo, titulo_ingles, anio, nota_imdb, poster_path, enriquecimiento(generos)')
        .in('id', batch)

      if (!movies) continue

      for (const m of movies as any[]) {
        const rawGeneros: string[] = m.enriquecimiento?.generos ?? []
        const generos = rawGeneros.map(norm)
        if (generos.length === 0) continue

        // Calculate group compatibility score
        // For each genre in the movie, get each user's affinity, then take the minimum
        // This ensures the movie works for EVERYONE, not just one person
        let totalScore = 0
        let genreCount = 0

        for (const g of generos) {
          // For this genre, calculate the geometric mean of all users' affinities
          // Use a small floor (0.05) so a genre one user hasn't seen doesn't kill the score
          const affinities = userIds.map(uid => Math.max(tasteProfiles[uid][g] ?? 0, 0.05))
          const minAffinity = Math.min(...affinities)
          const avgAffinity = affinities.reduce((a, b) => a + b, 0) / affinities.length
          // Blend: 60% minimum (ensures everyone likes it) + 40% average (reward high overall appeal)
          totalScore += minAffinity * 0.6 + avgAffinity * 0.4
          genreCount++
        }

        const genreScore = genreCount > 0 ? totalScore / genreCount : 0

        // Boost for IMDB rating
        const imdbBoost = m.nota_imdb ? (m.nota_imdb - 5) / 5 * 0.15 : 0

        const finalScore = Math.min(Math.max((genreScore + imdbBoost) * 100, 0), 99)

        candidates.push({
          id: m.id,
          titulo: m.titulo,
          titulo_ingles: m.titulo_ingles,
          anio: m.anio,
          nota_imdb: m.nota_imdb,
          poster_path: m.poster_path,
          generos,
          plataformas: platMap[m.id] ?? [],
          score: Math.round(finalScore),
        })
      }
    }

    // Sort by score descending, take top 20
    candidates.sort((a, b) => b.score - a.score)
    const top = candidates.slice(0, 20)

    return NextResponse.json({ movies: top })
  } catch (err: any) {
    console.error('Error in /api/juntos:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

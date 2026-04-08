/*
  CREATE TABLE juntos_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    code text UNIQUE NOT NULL,
    user1_prefs jsonb DEFAULT '{}'::jsonb,
    user2_prefs jsonb DEFAULT '{}'::jsonb,
    user1_swipes jsonb DEFAULT '{}'::jsonb,
    user2_swipes jsonb DEFAULT '{}'::jsonb,
    movie_pool jsonb DEFAULT '[]'::jsonb,
    results jsonb DEFAULT '[]'::jsonb,
    user2_joined boolean DEFAULT false,
    pool_ready boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
  );

  CREATE INDEX idx_juntos_sessions_code ON juntos_sessions(code);
*/

import { NextRequest } from 'next/server'
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
  'Acción': 'Accion', 'Animación': 'Animacion', 'Biografía': 'Biografia',
  'Biográfico': 'Biografia', 'Fantasía': 'Fantasia', 'Familiar': 'Familia',
  'Ciencia Ficción': 'Ciencia ficcion', 'Ciencia ficción': 'Ciencia ficcion',
  'Música': 'Musica', 'Deportes': 'Deporte', 'Desconocido': 'Otros', 'Unknown': 'Otros',
}
const norm = (g: string) => GENEROS_NORMALIZE[g] ?? g

// Mood → genre affinity weights
const MOOD_GENRES: Record<string, Record<string, number>> = {
  bajon: { Comedia: 1, Animacion: 0.8, Familia: 0.7, Aventura: 0.6, Fantasia: 0.5 },
  sillon: { Accion: 1, Thriller: 0.9, Aventura: 0.8, 'Ciencia ficcion': 0.7, Guerra: 0.5 },
  licuadora: { 'Ciencia ficcion': 1, Thriller: 0.9, Misterio: 0.8, Drama: 0.6, Terror: 0.5 },
  llorar: { Drama: 1, Romance: 0.9, Historia: 0.7, Biografia: 0.6, Musical: 0.4 },
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1 to avoid confusion
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  if (!code) {
    return Response.json({ error: 'Falta el codigo de sala' }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data, error } = await supabase
    .from('juntos_sessions')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle()

  if (error) {
    console.error('GET juntos_sessions error:', error)
    return Response.json({ error: 'Error interno' }, { status: 500 })
  }
  if (!data) {
    return Response.json({ error: 'Sala no encontrada' }, { status: 404 })
  }

  return Response.json({ room: data })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body
    const supabase = createClient(supabaseUrl, supabaseKey)

    // ── CREATE ROOM ──
    if (action === 'create') {
      // Try up to 5 times for a unique code
      let code = ''
      for (let attempt = 0; attempt < 5; attempt++) {
        code = generateCode()
        const { data: existing } = await supabase
          .from('juntos_sessions')
          .select('code')
          .eq('code', code)
          .maybeSingle()
        if (!existing) break
      }

      const { error } = await supabase
        .from('juntos_sessions')
        .insert({ code })

      if (error) {
        console.error('Create room error:', error)
        return Response.json({ error: 'Error al crear sala' }, { status: 500 })
      }

      return Response.json({ code })
    }

    // ── JOIN ROOM ──
    if (action === 'join') {
      const code = (body.code as string || '').toUpperCase().trim()
      if (!code || code.length !== 6) {
        return Response.json({ error: 'Codigo invalido' }, { status: 400 })
      }

      const { data: room } = await supabase
        .from('juntos_sessions')
        .select('*')
        .eq('code', code)
        .maybeSingle()

      if (!room) {
        return Response.json({ error: 'Sala no encontrada' }, { status: 404 })
      }

      const { error } = await supabase
        .from('juntos_sessions')
        .update({ user2_joined: true })
        .eq('code', code)

      if (error) {
        console.error('Join room error:', error)
        return Response.json({ error: 'Error al unirse' }, { status: 500 })
      }

      return Response.json({ ok: true })
    }

    // ── SUBMIT PREFERENCES ──
    if (action === 'submit_prefs') {
      const code = (body.code as string || '').toUpperCase()
      const slot = body.slot as 'user1' | 'user2'
      const prefs = body.prefs as { mood: string; genres: string[]; platforms: string[] }

      if (!code || !slot || !prefs) {
        return Response.json({ error: 'Datos incompletos' }, { status: 400 })
      }

      const col = slot === 'user1' ? 'user1_prefs' : 'user2_prefs'
      const { error } = await supabase
        .from('juntos_sessions')
        .update({ [col]: prefs })
        .eq('code', code)

      if (error) {
        console.error('Submit prefs error:', error)
        return Response.json({ error: 'Error al guardar preferencias' }, { status: 500 })
      }

      return Response.json({ ok: true })
    }

    // ── SUBMIT SWIPES ──
    if (action === 'submit_swipes') {
      const code = (body.code as string || '').toUpperCase()
      const slot = body.slot as 'user1' | 'user2'
      const swipes = body.swipes as Record<string, boolean> // movie_id → liked

      if (!code || !slot || !swipes) {
        return Response.json({ error: 'Datos incompletos' }, { status: 400 })
      }

      const col = slot === 'user1' ? 'user1_swipes' : 'user2_swipes'
      const { error } = await supabase
        .from('juntos_sessions')
        .update({ [col]: swipes })
        .eq('code', code)

      if (error) {
        console.error('Submit swipes error:', error)
        return Response.json({ error: 'Error al guardar swipes' }, { status: 500 })
      }

      return Response.json({ ok: true })
    }

    // ── GENERATE MOVIE POOL ──
    if (action === 'generate_pool') {
      const code = (body.code as string || '').toUpperCase()

      // Fetch room
      const { data: room } = await supabase
        .from('juntos_sessions')
        .select('*')
        .eq('code', code)
        .maybeSingle()

      if (!room) {
        return Response.json({ error: 'Sala no encontrada' }, { status: 404 })
      }

      const u1 = room.user1_prefs as { mood: string; genres: string[]; platforms: string[] }
      const u2 = room.user2_prefs as { mood: string; genres: string[]; platforms: string[] }

      if (!u1?.mood || !u2?.mood) {
        return Response.json({ error: 'Ambos deben enviar preferencias primero' }, { status: 400 })
      }

      // Merge platforms (union)
      const platSet = new Set([...(u1.platforms || []), ...(u2.platforms || [])])
      const allPlatforms = Array.from(platSet)
      // Shared platforms get a bonus
      const u2Plats = new Set(u2.platforms || [])
      const sharedPlatforms = new Set(
        (u1.platforms || []).filter(p => u2Plats.has(p))
      )

      // Merge genres (union)
      const genreSet = new Set([...(u1.genres || []), ...(u2.genres || [])])
      const allGenres = Array.from(genreSet)
      const u2Genres = new Set(u2.genres || [])
      const sharedGenres = new Set(
        (u1.genres || []).filter(g => u2Genres.has(g))
      )

      // Build mood affinity
      const mood1 = MOOD_GENRES[u1.mood] || {}
      const mood2 = MOOD_GENRES[u2.mood] || {}

      // Get watch providers (TMDB - accurate)
      if (allPlatforms.length === 0) {
        return Response.json({ error: 'No hay plataformas seleccionadas' }, { status: 400 })
      }

      const platMap: Record<string, string[]> = {}
      let wpFrom = 0
      const wpPageSize = 1000

      while (true) {
        const { data: wpEntries } = await supabase
          .from('watch_providers')
          .select('pelicula_id, platform_key')
          .eq('provider_type', 'flatrate')
          .not('platform_key', 'is', null)
          .in('platform_key', allPlatforms)
          .range(wpFrom, wpFrom + wpPageSize - 1)

        if (!wpEntries || wpEntries.length === 0) break

        for (const w of wpEntries) {
          if (!platMap[w.pelicula_id]) platMap[w.pelicula_id] = []
          if (!platMap[w.pelicula_id].includes(w.platform_key)) {
            platMap[w.pelicula_id].push(w.platform_key)
          }
        }

        if (wpEntries.length < wpPageSize) break
        wpFrom += wpPageSize
      }

      const candidateIds = Object.keys(platMap)
      if (candidateIds.length === 0) {
        await supabase
          .from('juntos_sessions')
          .update({ movie_pool: [] })
          .eq('code', code)
        return Response.json({ ok: true, count: 0 })
      }

      // Fetch movie details in batches
      type PoolMovie = {
        id: string
        titulo: string
        titulo_ingles: string | null
        anio: number | null
        nota_imdb: number | null
        poster_path: string | null
        backdrop_path: string | null
        generos: string[]
        plataformas: string[]
        score: number
      }

      const scored: PoolMovie[] = []
      const batchSize = 500

      for (let i = 0; i < candidateIds.length; i += batchSize) {
        const batch = candidateIds.slice(i, i + batchSize)
        const { data: movies } = await supabase
          .from('peliculas')
          .select('id, titulo, titulo_ingles, anio, nota_imdb, poster_path, backdrop_path, enriquecimiento(generos)')
          .in('id', batch)

        if (!movies) continue

        for (const m of movies as any[]) {
          const rawGeneros: string[] = m.enriquecimiento?.generos ?? []
          const generos = rawGeneros.map(norm)
          if (generos.length === 0) continue

          let score = 0

          // Genre match score (0-40 pts)
          let genreScore = 0
          for (const g of generos) {
            if (sharedGenres.has(g)) genreScore += 10
            else if (allGenres.includes(g)) genreScore += 5
          }
          score += Math.min(genreScore, 40)

          // Mood affinity score (0-30 pts)
          let moodScore = 0
          for (const g of generos) {
            const m1 = mood1[g] || 0
            const m2 = mood2[g] || 0
            moodScore += (m1 + m2) / 2
          }
          score += Math.min(moodScore * 15, 30)

          // IMDB bonus (0-15 pts)
          if (m.nota_imdb) {
            score += Math.max(0, (m.nota_imdb - 5) / 5) * 15
          }

          // Shared platform bonus (0-10 pts)
          const moviePlats = platMap[m.id] || []
          const onShared = moviePlats.some(p => sharedPlatforms.has(p))
          if (onShared) score += 10

          // Recent movie bonus (0-5 pts)
          if (m.anio && m.anio >= 2020) score += 5
          else if (m.anio && m.anio >= 2015) score += 3

          scored.push({
            id: m.id,
            titulo: m.titulo,
            titulo_ingles: m.titulo_ingles,
            anio: m.anio,
            nota_imdb: m.nota_imdb,
            poster_path: m.poster_path,
            backdrop_path: m.backdrop_path,
            generos,
            plataformas: moviePlats,
            score: Math.round(Math.min(score, 100)),
          })
        }
      }

      // Sort by score, take top 20
      scored.sort((a, b) => b.score - a.score)
      const pool = scored.slice(0, 20)

      const { error } = await supabase
        .from('juntos_sessions')
        .update({ movie_pool: pool })
        .eq('code', code)

      if (error) {
        console.error('Generate pool error:', error)
        return Response.json({ error: 'Error al generar pool' }, { status: 500 })
      }

      return Response.json({ ok: true, count: pool.length })
    }

    // ── CALCULATE RESULTS ──
    if (action === 'calculate_results') {
      const code = (body.code as string || '').toUpperCase()

      const { data: room } = await supabase
        .from('juntos_sessions')
        .select('*')
        .eq('code', code)
        .maybeSingle()

      if (!room) {
        return Response.json({ error: 'Sala no encontrada' }, { status: 404 })
      }

      const pool = (room.movie_pool || []) as any[]
      const s1 = (room.user1_swipes || {}) as Record<string, boolean>
      const s2 = (room.user2_swipes || {}) as Record<string, boolean>

      if (Object.keys(s1).length === 0 || Object.keys(s2).length === 0) {
        return Response.json({ error: 'Ambos deben completar los swipes' }, { status: 400 })
      }

      // Calculate results
      type ResultMovie = {
        id: string
        titulo: string
        titulo_ingles: string | null
        anio: number | null
        nota_imdb: number | null
        poster_path: string | null
        backdrop_path: string | null
        generos: string[]
        plataformas: string[]
        match_score: number
      }

      const results: ResultMovie[] = []

      for (const movie of pool) {
        const liked1 = s1[movie.id] === true
        const liked2 = s2[movie.id] === true

        // Both liked = 100%, one liked = 50%, neither = 0%
        let matchScore = 0
        if (liked1 && liked2) matchScore = 100
        else if (liked1 || liked2) matchScore = 50
        else continue // skip movies nobody liked

        // Bonus from original pool score
        const poolBonus = (movie.score || 0) / 100 * 20
        if (liked1 && liked2) {
          matchScore = Math.min(Math.round(80 + poolBonus), 99)
        } else {
          matchScore = Math.min(Math.round(30 + poolBonus), 60)
        }

        results.push({
          id: movie.id,
          titulo: movie.titulo,
          titulo_ingles: movie.titulo_ingles,
          anio: movie.anio,
          nota_imdb: movie.nota_imdb,
          poster_path: movie.poster_path,
          backdrop_path: movie.backdrop_path,
          generos: movie.generos,
          plataformas: movie.plataformas,
          match_score: matchScore,
        })
      }

      // Sort: both-liked first (higher match_score), then by match_score
      results.sort((a, b) => b.match_score - a.match_score)
      const top10 = results.slice(0, 10)

      const { error } = await supabase
        .from('juntos_sessions')
        .update({ results: top10 })
        .eq('code', code)

      if (error) {
        console.error('Calculate results error:', error)
        return Response.json({ error: 'Error al calcular resultados' }, { status: 500 })
      }

      return Response.json({ results: top10 })
    }

    return Response.json({ error: 'Accion desconocida' }, { status: 400 })
  } catch (err: any) {
    console.error('Error in /api/juntos:', err)
    return Response.json({ error: 'Error interno' }, { status: 500 })
  }
}

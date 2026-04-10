#!/usr/bin/env node
/**
 * Adds missing movies from catalogo_peliculas_v2.xlsx to the DB.
 * For each movie:
 *   1. Search TMDB by English title + year
 *   2. Fetch full TMDB details (poster, backdrop, credits, keywords, etc.)
 *   3. Ask Claude Haiku for the real IMDb rating + Chilean slang sinopsis
 *   4. Insert into peliculas + enriquecimiento
 *
 * Run: node scripts/add-missing-catalog.mjs [--offset=0] [--limit=999]
 * Requires: .env.local with TMDB_API_KEY, ANTHROPIC_API_KEY, Supabase keys
 */

import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import { randomUUID } from 'crypto'

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace('--', '').split('=')
    return [k, v ?? 'true']
  })
)
const OFFSET = parseInt(args.offset || '0')
const LIMIT = parseInt(args.limit || '999')

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
const TMDB_KEY = process.env.TMDB_API_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

if (!TMDB_KEY || !ANTHROPIC_KEY) {
  console.error('Missing TMDB_API_KEY or ANTHROPIC_API_KEY')
  process.exit(1)
}

// Read catalog
const wb = XLSX.readFile('catalogo_peliculas_v2.xlsx')
const ws = wb.Sheets[wb.SheetNames[0]]
const catalog = XLSX.utils.sheet_to_json(ws)

// Fetch all existing movies from DB
const allPels = []
let offset = 0
while (true) {
  const { data } = await sb.from('peliculas')
    .select('id, titulo, titulo_ingles, tmdb_id')
    .range(offset, offset + 999)
  if (!data || data.length === 0) break
  allPels.push(...data)
  if (data.length < 1000) break
  offset += 1000
}

const byTitleEn = new Map()
const byTmdbId = new Map()
for (const p of allPels) {
  if (p.titulo_ingles) byTitleEn.set(p.titulo_ingles.toLowerCase().trim(), p)
  if (p.tmdb_id) byTmdbId.set(p.tmdb_id, p)
  byTitleEn.set(p.titulo.toLowerCase().trim(), p)
}

// Find missing movies
const missing = []
for (const row of catalog) {
  const titleEn = (row['Título (EN)'] || '').trim()
  const year = row['Año']
  const key = titleEn.toLowerCase()
  let match = byTitleEn.get(key)
  if (!match && key.startsWith('the ')) match = byTitleEn.get(key.slice(4))
  if (!match) match = byTitleEn.get('the ' + key)
  if (!match) {
    missing.push({ titleEn, year, genre: row['Género'], category: row['Categoría'], difficulty: row['Dificultad'] })
  }
}

console.log(`Missing movies: ${missing.length}`)
const batch = missing.slice(OFFSET, OFFSET + LIMIT)
console.log(`Processing ${batch.length} (offset ${OFFSET}, limit ${LIMIT})`)

// Helper: delay
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Helper: ask Claude for IMDb rating + sinopsis
async function askClaude(titleEn, year, director, genres) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `For the movie "${titleEn}" (${year}), directed by ${director || 'unknown'}, genres: ${genres || 'unknown'}:

1. What is its IMDb rating? Just the number (e.g. 7.8). If you don't know, estimate based on its reputation.
2. Write a sinopsis in heavy Chilean slang (max 1 sentence, ~15-25 words). Use "wea", "weon", "pega", "cachar", "po", etc. Be funny and irreverent. No formal Spanish.

Respond ONLY with JSON: {"imdb": 7.8, "sinopsis": "..."}`
        }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data.content?.[0]?.text ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0])
  } catch {
    return null
  }
}

let added = 0
let failed = 0

for (let i = 0; i < batch.length; i++) {
  const movie = batch[i]
  console.log(`\n[${i + 1}/${batch.length}] ${movie.titleEn} (${movie.year})`)

  // 1. Search TMDB
  const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(movie.titleEn)}&year=${movie.year}&language=es-CL`
  const searchRes = await fetch(searchUrl)
  const searchData = await searchRes.json()
  const tmdbMovie = searchData.results?.[0]

  if (!tmdbMovie) {
    console.log('  ❌ Not found on TMDB')
    failed++
    continue
  }

  // Check if tmdb_id already exists in DB (different title)
  if (byTmdbId.has(tmdbMovie.id)) {
    console.log(`  ⚠ TMDB ${tmdbMovie.id} already in DB as "${byTmdbId.get(tmdbMovie.id).titulo_ingles}"`)
    continue
  }

  // 2. Fetch full details
  const [detailRes, creditsRes, videosRes, imagesRes, enDetailRes] = await Promise.all([
    fetch(`https://api.themoviedb.org/3/movie/${tmdbMovie.id}?api_key=${TMDB_KEY}&language=es-CL&append_to_response=keywords`),
    fetch(`https://api.themoviedb.org/3/movie/${tmdbMovie.id}/credits?api_key=${TMDB_KEY}&language=es-CL`),
    fetch(`https://api.themoviedb.org/3/movie/${tmdbMovie.id}/videos?api_key=${TMDB_KEY}&language=en-US`),
    fetch(`https://api.themoviedb.org/3/movie/${tmdbMovie.id}/images?api_key=${TMDB_KEY}&include_image_language=en,es,null`),
    fetch(`https://api.themoviedb.org/3/movie/${tmdbMovie.id}?api_key=${TMDB_KEY}&language=en-US`),
  ])

  const detail = await detailRes.json()
  const credits = await creditsRes.json()
  const videos = await videosRes.json()
  const images = await imagesRes.json()
  const enDetail = await enDetailRes.json()

  const director = credits.crew?.find(c => c.job === 'Director')
  const compositor = credits.crew?.find(c => c.job === 'Original Music Composer')
  const trailer = videos.results?.find(v => v.type === 'Trailer')
  const logo = images.logos?.[0]
  const generos = detail.genres?.map(g => g.name) || []
  const actores = credits.cast?.slice(0, 10).map(c => c.name) || []
  const keywords = detail.keywords?.keywords?.map(k => k.name) || []
  const castJson = credits.cast?.slice(0, 15).map(c => ({
    name: c.name,
    character: c.character,
    profile_path: c.profile_path,
  })) || []

  // 3. Ask Claude for IMDb + sinopsis
  const claude = await askClaude(movie.titleEn, movie.year, director?.name, generos.join(', '))
  const imdbRating = claude?.imdb ? Math.round(claude.imdb * 10) / 10 : (detail.vote_average ? Math.round(detail.vote_average * 10) / 10 : null)
  const sinopsis = claude?.sinopsis || null

  console.log(`  TMDB ${tmdbMovie.id} | IMDb ${imdbRating} | Dir: ${director?.name} | Sinopsis: ${sinopsis?.slice(0, 50)}...`)

  // 4. Insert into peliculas
  const pelId = randomUUID()
  const { error: pelErr } = await sb.from('peliculas').insert({
    id: pelId,
    tmdb_id: tmdbMovie.id,
    titulo: detail.title || movie.titleEn,
    titulo_ingles: enDetail.title || movie.titleEn,
    anio: parseInt(detail.release_date?.split('-')[0] || String(movie.year)),
    nota_imdb: imdbRating,
    runtime: detail.runtime || null,
    poster_path: detail.poster_path,
    backdrop_path: detail.backdrop_path,
    logo_path: logo?.file_path || null,
    youtube_trailer_key: trailer?.key || null,
    tagline: detail.tagline || null,
    oscars: 'N/A',
    imdb_id: detail.imdb_id || null,
    boxoffice: detail.revenue || null,
    categoria: null,
  })

  if (pelErr) {
    console.log(`  ❌ DB insert error: ${pelErr.message}`)
    failed++
    continue
  }

  // 5. Insert enrichment
  const { error: enrErr } = await sb.from('enriquecimiento').insert({
    pelicula_id: pelId,
    director: director?.name || null,
    director_oscars: 0,
    compositor: compositor?.name || null,
    compositor_oscars: 0,
    actores: actores,
    actores_oscars: {},
    generos: generos,
    keywords: keywords,
    sinopsis_chilensis: sinopsis,
    review_autor: null,
    es_review_autor: false,
    cast_json: castJson,
  })

  if (enrErr) {
    console.log(`  ⚠ Enrichment error: ${enrErr.message}`)
  }

  added++
  byTmdbId.set(tmdbMovie.id, { id: pelId, titulo_ingles: movie.titleEn })

  // Rate limit: TMDB allows 40 req/10s, Claude has its own limits
  if (i % 5 === 4) await sleep(1500)
}

console.log(`\n═══ DONE ═══`)
console.log(`Added: ${added}`)
console.log(`Failed: ${failed}`)
console.log(`Skipped (already in DB by tmdb_id): ${batch.length - added - failed}`)

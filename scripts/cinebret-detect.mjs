// CineBret Strategist — Opportunity Detection
// Scans Supabase, TMDB, IG history, and editorial calendar to detect content opportunities.
// Output: .wiki/sources/strategist-proposal-YYYY-MM-DD.json
// Usage: node scripts/cinebret-detect.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

try {
  const envFile = readFileSync(join(ROOT, '.env.local'), 'utf-8')
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
} catch {}

const TMDB_KEY = process.env.TMDB_API_KEY
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1'
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY
const ADMIN_USER_ID = 'b5eafe05-9ec8-4b23-b0b4-137148ecbac2' // ajlizama

const today = new Date().toISOString().slice(0, 10)

async function supaAll(table, query = '') {
  const PAGE = 1000
  const all = []
  let offset = 0
  while (true) {
    const sep = query ? '&' : ''
    const url = `${SUPA_URL}/${table}?${query}${sep}limit=${PAGE}&offset=${offset}`
    const res = await fetch(url, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } })
    if (!res.ok) throw new Error(`${table}: ${res.status}`)
    const rows = await res.json()
    all.push(...rows)
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return all
}

async function tmdb(path) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`https://api.themoviedb.org/3${path}${sep}api_key=${TMDB_KEY}`)
  if (!res.ok) return null
  return res.json()
}

console.log(`🎯 CineBret Strategist — Detection (${today})\n`)

// ─────────────────────────────────────────────────────────
// 1. LOAD ALL DATA
// ─────────────────────────────────────────────────────────

console.log('Loading data...')
const [peliculas, enriquecimiento, catalogos, userPelis, ig] = await Promise.all([
  supaAll('peliculas', 'select=id,titulo,titulo_ingles,anio,nota_imdb,categoria,imdb_id,tmdb_id'),
  supaAll('enriquecimiento', 'select=pelicula_id,review_autor,sello_bret,es_review_autor,director,generos,actores'),
  supaAll('catalogos', 'select=pelicula_id,plataforma,activo&activo=eq.true'),
  supaAll('user_peliculas', `select=pelicula_id,rating,visto&user_id=eq.${ADMIN_USER_ID}`),
  Promise.resolve(JSON.parse(readFileSync(join(ROOT, '.wiki/sources/instagram-posts.json'), 'utf-8'))),
])

const peliMap = Object.fromEntries(peliculas.map(p => [p.id, p]))
const enrMap = Object.fromEntries(enriquecimiento.map(e => [e.pelicula_id, e]))
const userMap = Object.fromEntries(userPelis.map(u => [u.pelicula_id, u]))

const catByPeli = {}
for (const c of catalogos) {
  if (!catByPeli[c.pelicula_id]) catByPeli[c.pelicula_id] = []
  catByPeli[c.pelicula_id].push(c.plataforma)
}

console.log(`  ${peliculas.length} peliculas, ${enriquecimiento.length} enriquecidas, ${catalogos.length} catalogos activos, ${userPelis.length} ratings, ${ig.posts.length} posts IG\n`)

// ─────────────────────────────────────────────────────────
// 2. DETECTOR: PENDING REVIEWS (high priority)
// ─────────────────────────────────────────────────────────

console.log('🔍 Detector: pending high-priority reviews...')
// Movies with sello_bret OR rating >= 9, no review yet, available on at least 1 platform
const pendingReviews = []
for (const p of peliculas) {
  const e = enrMap[p.id]
  const u = userMap[p.id]
  if (!e || e.review_autor) continue // already reviewed

  const sello = e.sello_bret
  const rating = u?.rating
  const platforms = catByPeli[p.id] || []
  const hasPlatform = platforms.length > 0
  if (!hasPlatform) continue

  // Priority score
  let priority = 0
  if (rating === 10) priority += 100
  else if (rating === 9) priority += 80
  else if (rating === 8) priority += 50
  if (sello) priority += 30
  if ((p.nota_imdb || 0) >= 8) priority += 20
  if ((p.nota_imdb || 0) >= 7.5) priority += 10
  // Recent year bonus
  if ((p.anio || 0) >= 2024) priority += 25
  if ((p.anio || 0) >= 2025) priority += 20

  if (priority < 50) continue

  pendingReviews.push({
    pelicula_id: p.id,
    titulo: p.titulo_ingles || p.titulo,
    anio: p.anio,
    nota_imdb: p.nota_imdb,
    director: e.director,
    generos: e.generos,
    rating_alberto: rating,
    sello_bret: sello,
    platforms,
    priority,
  })
}
pendingReviews.sort((a, b) => b.priority - a.priority)
console.log(`  Found ${pendingReviews.length} candidates\n`)

// ─────────────────────────────────────────────────────────
// 3. DETECTOR: TMDB TRENDING (Chile + global)
// ─────────────────────────────────────────────────────────

console.log('🔍 Detector: TMDB trending...')
const trendingGlobal = await tmdb('/trending/movie/week?language=es-CL&region=CL')
const trendingDay = await tmdb('/trending/movie/day?language=es-CL&region=CL')
const nowPlaying = await tmdb('/movie/now_playing?language=es-CL&region=CL')

// Cross-reference with our DB
const tmdbToPeli = Object.fromEntries(peliculas.filter(p => p.tmdb_id).map(p => [p.tmdb_id, p]))

function enrichTrendingItem(item) {
  const peli = tmdbToPeli[item.id]
  return {
    tmdb_id: item.id,
    title: item.title,
    original_title: item.original_title,
    release_date: item.release_date,
    vote_average: item.vote_average,
    in_cinebret: !!peli,
    pelicula_id: peli?.id || null,
    has_review: peli ? !!enrMap[peli.id]?.review_autor : false,
    platforms: peli ? (catByPeli[peli.id] || []) : [],
  }
}

const trending = {
  weekly: (trendingGlobal?.results || []).slice(0, 15).map(enrichTrendingItem),
  daily: (trendingDay?.results || []).slice(0, 10).map(enrichTrendingItem),
  now_playing: (nowPlaying?.results || []).slice(0, 10).map(enrichTrendingItem),
}
console.log(`  Trending weekly: ${trending.weekly.length}, daily: ${trending.daily.length}, now playing: ${trending.now_playing.length}\n`)

// ─────────────────────────────────────────────────────────
// 4. DETECTOR: NEWLY AVAILABLE ON PLATFORM (compare snapshots)
// ─────────────────────────────────────────────────────────

console.log('🔍 Detector: newly added to platforms...')
const snapshotDir = join(ROOT, '.wiki/snapshots')
if (!existsSync(snapshotDir)) mkdirSync(snapshotDir, { recursive: true })

const todaySnapshot = {}
for (const c of catalogos) {
  if (!todaySnapshot[c.pelicula_id]) todaySnapshot[c.pelicula_id] = new Set()
  todaySnapshot[c.pelicula_id].add(c.plataforma)
}

// Try to load yesterday's or last available snapshot
let lastSnapshot = null
let lastSnapshotDate = null
try {
  const fs = await import('fs')
  const files = fs.readdirSync(snapshotDir).filter(f => f.startsWith('catalogos-') && f.endsWith('.json')).sort().reverse()
  if (files[0]) {
    lastSnapshot = JSON.parse(readFileSync(join(snapshotDir, files[0]), 'utf-8'))
    lastSnapshotDate = files[0].replace('catalogos-', '').replace('.json', '')
  }
} catch {}

const newlyAdded = []
if (lastSnapshot) {
  for (const [peliId, platforms] of Object.entries(todaySnapshot)) {
    const yesterday = new Set(lastSnapshot[peliId] || [])
    for (const p of platforms) {
      if (!yesterday.has(p)) {
        const peli = peliMap[peliId]
        const enr = enrMap[peliId]
        if (!peli) continue
        newlyAdded.push({
          pelicula_id: peliId,
          titulo: peli.titulo_ingles || peli.titulo,
          anio: peli.anio,
          nota_imdb: peli.nota_imdb,
          plataforma: p,
          has_review: !!enr?.review_autor,
          rating_alberto: userMap[peliId]?.rating,
          sello_bret: enr?.sello_bret || false,
        })
      }
    }
  }
}

// Save today's snapshot for next run
const snapshotToSave = {}
for (const [k, v] of Object.entries(todaySnapshot)) snapshotToSave[k] = [...v]
writeFileSync(join(snapshotDir, `catalogos-${today}.json`), JSON.stringify(snapshotToSave))

console.log(`  Newly added since ${lastSnapshotDate || 'never (first run)'}: ${newlyAdded.length}\n`)

// ─────────────────────────────────────────────────────────
// 5. DETECTOR: AWARDS CALENDAR
// ─────────────────────────────────────────────────────────

console.log('🔍 Detector: upcoming awards / events...')
const todayDate = new Date()
const year = todayDate.getFullYear()
const awards = [
  { name: 'Globos de Oro', month: 0, day: 7 },
  { name: 'Critics Choice Awards', month: 0, day: 14 },
  { name: 'BAFTA', month: 1, day: 18 },
  { name: 'Premios Oscar', month: 2, day: 4 },
  { name: 'Festival de Cannes', month: 4, day: 13 },
  { name: 'Festival de Venecia', month: 7, day: 27 },
  { name: 'Festival de Toronto', month: 8, day: 5 },
  { name: 'Festival de San Sebastián', month: 8, day: 19 },
]
const upcomingAwards = []
for (const a of awards) {
  let date = new Date(year, a.month, a.day)
  if (date < todayDate) date = new Date(year + 1, a.month, a.day)
  const daysUntil = Math.round((date - todayDate) / (1000 * 60 * 60 * 24))
  if (daysUntil <= 60) {
    upcomingAwards.push({ ...a, date: date.toISOString().slice(0, 10), days_until: daysUntil })
  }
}
upcomingAwards.sort((a, b) => a.days_until - b.days_until)
console.log(`  Upcoming awards (next 60 days): ${upcomingAwards.length}\n`)

// ─────────────────────────────────────────────────────────
// 6. ANALYZER: IG EDITORIAL GAPS
// ─────────────────────────────────────────────────────────

console.log('🔍 Analyzer: editorial gaps...')
const igPosts = ig.posts
const classifyPost = (caption) => {
  const c = caption || ''
  if (c.match(/^\W*[^(]+\(\d{4}\)/m) && c.includes('🎬 Director')) return 'review'
  if (c.includes('TOP de 15') || c.includes('TOP 15')) return 'top_plataforma'
  if (c.includes('15 otras pel') || c.includes('A qué se parecen')) return 'conexiones'
  if (c.includes('oscar') || c.includes('Oscar')) return 'oscars'
  if (c.includes('cinebret.cl') || c.includes('No sabes')) return 'promo_app'
  if (c.match(/\d+ pel.+ula.+ para/i)) return 'lista_tematica'
  return 'otro'
}

const postsByType = { review: [], top_plataforma: [], conexiones: [], oscars: [], promo_app: [], lista_tematica: [], otro: [] }
for (const p of igPosts) {
  const type = classifyPost(p.caption)
  postsByType[type].push({ date: p.timestamp.slice(0, 10), permalink: p.permalink })
}

const gaps = {}
for (const [type, posts] of Object.entries(postsByType)) {
  posts.sort((a, b) => b.date.localeCompare(a.date))
  const lastDate = posts[0]?.date || null
  const daysSince = lastDate ? Math.round((todayDate - new Date(lastDate)) / (1000 * 60 * 60 * 24)) : null
  gaps[type] = { last: lastDate, days_since: daysSince, total_posts: posts.length }
}

const lastPostDate = igPosts[0]?.timestamp.slice(0, 10)
const daysSinceLastPost = lastPostDate ? Math.round((todayDate - new Date(lastPostDate)) / (1000 * 60 * 60 * 24)) : null

console.log(`  Last IG post: ${lastPostDate} (${daysSinceLastPost} days ago)`)
for (const [type, g] of Object.entries(gaps)) {
  if (g.days_since !== null) console.log(`    ${type}: ${g.days_since}d ago (${g.total_posts} total)`)
}
console.log()

// ─────────────────────────────────────────────────────────
// 7. ANALYZER: TOP 15 BY PLATFORM (always-fresh data)
// ─────────────────────────────────────────────────────────

console.log('🔍 Analyzer: top 15 candidates by platform...')
const platformsToCheck = ['netflix', 'hbo_max', 'amazon_prime', 'disney_plus', 'paramount_plus']
const topByPlatform = {}
for (const platform of platformsToCheck) {
  const moviesOnPlatform = peliculas
    .filter(p => (catByPeli[p.id] || []).includes(platform))
    .filter(p => p.nota_imdb && p.nota_imdb >= 7.5)
    .sort((a, b) => (b.nota_imdb || 0) - (a.nota_imdb || 0))
    .slice(0, 20)
  topByPlatform[platform] = moviesOnPlatform.map(p => ({
    pelicula_id: p.id,
    titulo: p.titulo_ingles || p.titulo,
    anio: p.anio,
    nota_imdb: p.nota_imdb,
  }))
}
console.log()

// ─────────────────────────────────────────────────────────
// 8. WRITE PROPOSAL
// ─────────────────────────────────────────────────────────

const proposal = {
  generated_at: new Date().toISOString(),
  date: today,
  summary: {
    days_since_last_ig_post: daysSinceLastPost,
    last_post_date: lastPostDate,
    pending_reviews_count: pendingReviews.length,
    newly_added_to_platforms: newlyAdded.length,
    upcoming_awards: upcomingAwards.length,
    trending_in_cinebret: trending.weekly.filter(t => t.in_cinebret && !t.has_review).length,
  },
  pending_reviews: pendingReviews.slice(0, 30),
  trending,
  newly_added: newlyAdded.slice(0, 30),
  upcoming_awards: upcomingAwards,
  editorial_gaps: gaps,
  top_by_platform: topByPlatform,
}

const outDir = join(ROOT, '.wiki/sources')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, `strategist-proposal-${today}.json`)
writeFileSync(outPath, JSON.stringify(proposal, null, 2))

// Also overwrite the "latest" file for easy access
writeFileSync(join(outDir, 'strategist-proposal-latest.json'), JSON.stringify(proposal, null, 2))

console.log('═'.repeat(70))
console.log(' DETECTION COMPLETE')
console.log('═'.repeat(70))
console.log(`\n  📊 Summary:`)
console.log(`     Days since last IG post: ${daysSinceLastPost}`)
console.log(`     Pending high-priority reviews: ${pendingReviews.length}`)
console.log(`     Newly added to platforms: ${newlyAdded.length}`)
console.log(`     Upcoming awards (60d): ${upcomingAwards.length}`)
console.log(`     Trending in CineBret without review: ${proposal.summary.trending_in_cinebret}`)
console.log(`\n  💾 Proposal saved to:`)
console.log(`     ${outPath}`)
console.log(`     .wiki/sources/strategist-proposal-latest.json (always latest)\n`)

// CineBret Propose — converts raw signals into ACTIONABLE proposals using Alberto's taste filter
// Output: .wiki/sources/proposals-latest.json
// Strategy: see .wiki/reviews/AGENT-STRATEGY.md
// Usage: node scripts/cinebret-propose.mjs [--cycle=am|pm]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CYCLE = process.argv.find(a => a.startsWith('--cycle='))?.split('=')[1] || 'am'

try {
  const envFile = readFileSync(join(ROOT, '.env.local'), 'utf-8')
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch {}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1'
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY

// Alberto's taste profile — used as filter (from taste-profile.md)
const FAVORITE_DIRECTORS = [
  // Olimpo
  'Christopher Nolan', 'Martin Scorsese', 'Denis Villeneuve', 'Quentin Tarantino',
  'Steven Spielberg', 'David Fincher',
  // Muy respetados
  'Ridley Scott', 'Peter Jackson', 'James Cameron', 'Clint Eastwood', 'Danny Boyle',
  'Guy Ritchie',
  // Autores admirados
  'Bong Joon-ho', 'Park Chan-wook', 'Hayao Miyazaki', 'Damien Chazelle',
  'Martin McDonagh', 'Darren Aronofsky', 'Edgar Wright', 'Wes Anderson',
  'Ben Affleck', 'Mel Gibson', 'Sam Mendes',
  // Recientes que admira
  'Greta Gerwig', 'Ari Aster', 'Robert Eggers', 'Yorgos Lanthimos',
  'Josh Safdie', 'Edward Berger', 'Sean Baker',
]

// Tier 1-2 genres from taste-profile
const TIER_1_GENRES = ['Crimen', 'Crime', 'Ciencia ficción', 'Sci-Fi', 'Thriller', 'Misterio', 'Mystery', 'Animación', 'Animation']
const TIER_2_GENRES = ['Drama', 'Guerra', 'War', 'Biografía', 'Biography', 'Aventura', 'Adventure']

function read(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return null }
}

const sources = {
  proposal: read(join(ROOT, '.wiki/sources/strategist-proposal-latest.json')),
  news: read(join(ROOT, '.wiki/sources/news-feed-latest.json')),
  reddit: read(join(ROOT, '.wiki/sources/reddit-pulse-latest.json')),
  trailers: read(join(ROOT, '.wiki/sources/trailers-latest.json')),
  ig: read(join(ROOT, '.wiki/sources/instagram-posts.json')),
}

console.log(`💡 CineBret Propose [${CYCLE.toUpperCase()}]\n`)

// ─── Helper: normalize text for fuzzy matching against IG posts ───
function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/^\s*review\s*[:\-—]\s*/i, '')           // strip "Review:" prefix
    .replace(/[^\w\s]/g, ' ')                         // strip punctuation/emojis
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Build set of recently-published IG titles (last 45 days) ───
const RECENT_IG_DAYS = 45
const cutoffMs = Date.now() - RECENT_IG_DAYS * 86400 * 1000
const recentIgTitles = []
for (const post of (sources.ig?.posts || [])) {
  const ts = new Date(post.timestamp).getTime()
  if (ts < cutoffMs) continue
  const firstLine = (post.caption || '').split('\n')[0].trim()
  if (firstLine) recentIgTitles.push(normalize(firstLine))
}
console.log(`  Recent IG posts (last ${RECENT_IG_DAYS} days): ${recentIgTitles.length}`)

// True if a candidate title matches a recently-published IG post (substring either way)
function alreadyPostedRecently(candidateTitle) {
  const norm = normalize(candidateTitle)
  if (!norm) return false
  return recentIgTitles.some(ig => ig === norm || ig.includes(norm) || norm.includes(ig))
}

// ─── Helper: passes Alberto's taste filter ───
function passesTasteFilter({ director, generos, anio, sello_bret, rating_alberto, nota_imdb, title }) {
  // Director match
  if (director && FAVORITE_DIRECTORS.some(fav => director.toLowerCase().includes(fav.toLowerCase()))) return { pass: true, reason: 'director_favorito' }
  // Sello bret + rating
  if (sello_bret && rating_alberto && rating_alberto >= 8) return { pass: true, reason: 'sello_bret + rating_alto' }
  // Top tier genre + recent + decent IMDb
  if (Array.isArray(generos) && generos.some(g => TIER_1_GENRES.includes(g)) && (anio || 0) >= 2024 && (nota_imdb || 0) >= 7.5) {
    return { pass: true, reason: 'tier1_genero_reciente' }
  }
  // High rating Alberto only
  if (rating_alberto >= 9) return { pass: true, reason: 'rating_alberto_alto' }
  return { pass: false, reason: null }
}

// ─── Filter: trailers in STORY ───
function isLikelyMovieTrailer(t) {
  if (!t.is_trailer) return false
  const title = (t.title || '').toLowerCase()
  const exclusions = [
    'season ', 'episode', 'finale', 'series',
    'behind the scenes', 'making of', 'featurette', 'interview',
    'commercial', 'spot', 'cast reveal', 'recap',
    'pop culture', 'jeopardy', 'thank you next', 'jackass',
    'daily fix', 'voice acting', 'voice cast', 'pop quiz',
    'deleted scene', 'easter egg',
  ]
  if (exclusions.some(e => title.includes(e))) return false
  return true
}

// ─── Build catalog index ───
console.log('Loading catalog...')
let allMovies = []
{
  let offset = 0
  while (true) {
    const r = await fetch(`${SUPA_URL}/peliculas?select=id,titulo,titulo_ingles,anio,nota_imdb&limit=1000&offset=${offset}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    })
    const batch = await r.json()
    if (!Array.isArray(batch)) break
    allMovies.push(...batch)
    if (batch.length < 1000) break
    offset += 1000
  }
}
console.log(`  ${allMovies.length} movies loaded`)

// Strict fuzzy match (require min 3 word overlap, ≥ 70%)
function strictMatch(query, movies) {
  const queryWords = query.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4)
  if (queryWords.length < 2) return null
  let best = null, bestOverlap = 0
  for (const m of movies) {
    const titleWords = (m.titulo + ' ' + (m.titulo_ingles || '')).toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4)
    if (titleWords.length === 0) continue
    const overlap = queryWords.filter(q => titleWords.includes(q)).length
    const ratio = overlap / Math.min(queryWords.length, titleWords.length)
    if (overlap >= 2 && ratio >= 0.7 && overlap > bestOverlap) {
      bestOverlap = overlap
      best = m
    }
  }
  return best
}

const proposals = []

// ─── 1. STORY: tier-1 trailers, fresh, taste-aligned ───
console.log('\nFiltering trailers for STORY...')
if (sources.trailers?.videos) {
  const cutoffHours = CYCLE === 'pm' ? 8 : 12 // PM is more reactive — only very fresh
  const candidates = sources.trailers.videos
    .filter(t => t.channel_tier === 1)
    .filter(isLikelyMovieTrailer)
    .filter(t => {
      const ageH = (Date.now() - new Date(t.published).getTime()) / 36e5
      return ageH <= cutoffHours
    })

  for (const t of candidates) {
    const ageHours = Math.round((Date.now() - new Date(t.published).getTime()) / 36e5)
    const movieMatch = t.cinebret_match || strictMatch(t.title, allMovies)
    // Taste filter: must match a movie in our catalog OR have a known director (not detectable from trailer alone), so require match
    if (!movieMatch) continue
    const movieName = (t.title.split(/\s*[|\-—]\s*/)[0] || t.title).trim()
    proposals.push({
      type: 'STORY',
      priority: 'alta',
      action: 'share_trailer_in_story',
      title: movieName,
      reasoning: `Trailer de ${t.channel} salió hace ${ageHours}h. Película "${movieMatch.titulo}" ya está en tu catálogo.`,
      suggested_caption: `Trailer de "${movieMatch.titulo}" 🎬\n[tu reacción aquí]`,
      source_url: t.url,
      source_name: t.channel,
      cinebret_movie: movieMatch.titulo,
      score: 90 - ageHours * 2,
      skill_to_invoke: 'cinebret-share-story',
      skill_args: { url: t.url, angle: 'hype' },
    })
  }
  console.log(`  ${proposals.filter(p => p.action === 'share_trailer_in_story').length} trailer STORY proposals (filtered to taste)`)
}

// ─── 2. FEED: thematic TOP (replaces generic platform TOP) ───
console.log('\nGenerating thematic TOP proposals...')
if (sources.proposal?.editorial_gaps) {
  const topGap = sources.proposal.editorial_gaps.top_plataforma?.days_since || 0
  // Use thematic topics — rotate by day of week
  const dayOfWeek = new Date().getDay() // 0=Sun ... 6=Sat
  const TOPIC_ROTATION = [
    { name: 'TOP 10 thrillers psicológicos', skill_args: { topic_type: 'genre', topic: 'thriller psicológico' }, day: 0 }, // Sun
    { name: 'TOP 10 películas coreanas', skill_args: { topic_type: 'country', topic: 'corea' }, day: 1 }, // Mon
    { name: 'TOP 10 películas con plot twist', skill_args: { topic_type: 'theme', topic: 'plot twist' }, day: 2 }, // Tue
    { name: 'Ranking películas de Nolan', skill_args: { topic_type: 'director', topic: 'Christopher Nolan' }, day: 3 }, // Wed
    { name: 'TOP 10 películas A24', skill_args: { topic_type: 'studio', topic: 'A24' }, day: 4 }, // Thu
    { name: 'TOP 10 películas de mafia ranqueadas', skill_args: { topic_type: 'genre', topic: 'mafia' }, day: 5 }, // Fri
    { name: 'TOP 10 películas francesas', skill_args: { topic_type: 'country', topic: 'francia' }, day: 6 }, // Sat
  ]
  // Rotate through topics starting at today's day-of-week, skipping any topic
  // that already appears in a recent IG post.
  let todayTopic = null
  for (let offset = 0; offset < 7; offset++) {
    const candidate = TOPIC_ROTATION.find(t => t.day === (dayOfWeek + offset) % 7)
    if (!candidate) continue
    if (alreadyPostedRecently(candidate.name)) {
      console.log(`  Skipping topic "${candidate.name}" — already posted recently on IG`)
      continue
    }
    todayTopic = candidate
    break
  }

  if (topGap > 7 && todayTopic) {
    proposals.push({
      type: 'FEED',
      priority: topGap > 14 ? 'alta' : 'media',
      action: 'generate_carousel_topic',
      title: todayTopic.name,
      reasoning: `${topGap} días sin TOP/lista. Tema rotado por día de la semana — más curado que TOP de plataforma. Datos disponibles en catálogo.`,
      suggested_caption: null,
      source_name: 'editorial_gap',
      score: 75 + topGap,
      skill_to_invoke: 'cinebret-carousel-topic',
      skill_args: todayTopic.skill_args,
    })
  }

  // Mood gap (separate from TOP gap — different content)
  const moodGap = sources.proposal.editorial_gaps.lista_tematica?.days_since || 0
  if (moodGap > 21) {
    const month = new Date().getMonth()
    let mood = "Pa'l domingo de bajón"
    let listTitle = '10 películas para una noche tranquila'
    if (month >= 4 && month <= 7) { // May-Aug (winter Chile)
      listTitle = '10 películas para el frío del invierno'
    } else if (month === 9) { // Oct
      mood = "Pa' quedar con el cerebro como licuadora"
      listTitle = '10 películas perturbadoras para Halloween'
    } else if (month === 11) { // Dec
      listTitle = '10 películas para terminar el año'
    }
    proposals.push({
      type: 'FEED',
      priority: 'media',
      action: 'generate_carousel_mood',
      title: listTitle,
      reasoning: `${moodGap} días sin lista temática/mood. "${mood}" alineado con época del año.`,
      suggested_caption: null,
      source_name: 'mood_gap',
      score: 60 + moodGap / 2,
      skill_to_invoke: 'cinebret-carousel-mood',
      skill_args: { mood, count: 10 },
    })
  }
}

// ─── 3. FEED: pending review (max 1 per email, top priority) ───
console.log('Generating review proposals...')
if (sources.proposal?.pending_reviews) {
  // Pick the BEST pending review: rating 10 + recent + on platform
  const candidates = sources.proposal.pending_reviews
    .filter(r => r.rating_alberto === 10)
    .filter(r => (r.platforms || []).length > 0)
    .filter(r => {
      const taste = passesTasteFilter({
        director: r.director, generos: r.generos, anio: r.anio,
        sello_bret: r.sello_bret, rating_alberto: r.rating_alberto, nota_imdb: r.nota_imdb,
      })
      return taste.pass
    })
    .slice(0, 1) // ONLY 1 review per email

  for (const r of candidates) {
    const platforms = [...new Set(r.platforms.map(p => p.replace('_', ' ')))].slice(0, 3).join(', ')
    proposals.push({
      type: 'FEED',
      priority: 'alta',
      action: 'generate_review',
      title: `Review: ${r.titulo} (${r.anio})`,
      reasoning: `Tu rating 10 (favorita) sin review, en ${platforms}. ${r.director ? 'Dirigida por ' + r.director + '. ' : ''}Es la review pendiente que más impacto te traería.`,
      suggested_caption: null,
      source_name: 'pending_review',
      score: 85,
      skill_to_invoke: 'cinebret-review',
      skill_args: { titulo: r.titulo, anio: r.anio, pelicula_id: r.pelicula_id },
    })
  }
}

// ─── 4. Awards calendar coverage ───
if (sources.proposal?.upcoming_awards) {
  for (const a of sources.proposal.upcoming_awards) {
    if (a.days_until <= 14 && a.days_until >= 3) {
      proposals.push({
        type: 'FEED',
        priority: 'alta',
        action: 'generate_carousel_awards',
        title: `Preview ${a.name}`,
        reasoning: `${a.name} en ${a.days_until} días. Carrusel preview con películas relevantes.`,
        suggested_caption: null,
        source_name: 'awards_calendar',
        score: 80 + (14 - a.days_until),
        skill_to_invoke: 'cinebret-list-from-news',
        skill_args: { trigger: a.name },
      })
    }
  }
}

// ─── DEDUP & DIVERSIFY ───
// Final dedup pass:
//   1. Drop internal duplicates (same action+title)
//   2. Drop anything whose title matches a recent IG post (defense in depth —
//      individual generators already check, but this guards new sources too).
const seen = new Set()
const droppedByIg = []
const unique = proposals.filter(p => {
  if (alreadyPostedRecently(p.title)) {
    droppedByIg.push(p.title)
    return false
  }
  const key = `${p.action}:${p.title}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})
if (droppedByIg.length) {
  console.log(`  Dropped ${droppedByIg.length} proposals matching recent IG posts:`)
  for (const t of droppedByIg) console.log(`    - ${t}`)
}

unique.sort((a, b) => b.score - a.score)

// Diversity: 1 STORY + 1 FEED-thematic + 1 FEED-other
const stories = unique.filter(p => p.type === 'STORY')
const feedThematic = unique.filter(p => p.type === 'FEED' && p.action.startsWith('generate_carousel'))
const feedOther = unique.filter(p => p.type === 'FEED' && !p.action.startsWith('generate_carousel'))

const top3 = []
if (stories[0]) top3.push(stories[0])
if (feedThematic[0]) top3.push(feedThematic[0])
if (feedOther[0]) top3.push(feedOther[0])
while (top3.length < 3) {
  const next = unique.find(p => !top3.includes(p))
  if (!next) break
  top3.push(next)
}
const rest = unique.filter(p => !top3.includes(p)).slice(0, 5)

// QUALITY GATE: pass if there's at least 1 high-priority proposal AND max score >= 75
const hasHighPriority = top3.some(p => p.priority === 'alta')
const maxScore = Math.max(0, ...top3.map(p => p.score))
const passesQualityGate = top3.length > 0 && hasHighPriority && maxScore >= 75

console.log(`\n📊 Proposals: ${unique.length} total, ${top3.length} top, ${rest.length} FYI`)
console.log(`   Quality gate: ${passesQualityGate ? '✅ PASS' : '❌ FAIL'} (high priority: ${hasHighPriority}, max score: ${maxScore})`)

const out = {
  generated_at: new Date().toISOString(),
  cycle: CYCLE,
  total: unique.length,
  passes_quality_gate: passesQualityGate,
  top: top3,
  rest,
  raw_signal_counts: {
    news_items: sources.news?.items?.length || 0,
    reddit_posts: sources.reddit?.posts?.length || 0,
    trailers: sources.trailers?.videos?.length || 0,
    pending_reviews: sources.proposal?.pending_reviews?.length || 0,
  },
}

const outDir = join(ROOT, '.wiki/sources')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'proposals-latest.json'), JSON.stringify(out, null, 2))
console.log(`\n✅ Saved → proposals-latest.json`)

if (passesQualityGate) {
  console.log('\n🎯 TOP:')
  for (let i = 0; i < top3.length; i++) {
    const p = top3[i]
    console.log(`\n  ${i + 1}. [${p.type}] ${p.title}`)
    console.log(`     Por qué: ${p.reasoning}`)
    if (p.suggested_caption) console.log(`     Caption: ${p.suggested_caption.replace(/\n/g, ' / ').slice(0, 80)}...`)
  }
} else {
  console.log('\n⚠️  Quality gate not met. Email will NOT be sent this cycle.')
}

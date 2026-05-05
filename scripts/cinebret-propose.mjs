// CineBret Propose — generates the daily content proposals.
//
// SOURCE OF TRUTH: .wiki/reviews/AGENT-STRATEGY.md (mix, filters, discard rules)
// Don't change this without re-reading that document.
//
// Mix per cycle (reflects Alberto's real publishing distribution):
//   3 × REVIEW       — rating-10 movies with platform, no review yet
//   1 × LISTA/TOP    — topic from weighted pool
//   1 × REACTIVA     — only if there's a strong signal
//                      (trailer/news for olimpo director or rating-9+ catalog film)
//
// What we never propose:
//   - News about TV series, reality TV, TV festivals, Boeing docs
//   - Catalog matches against rating-<8 movies or movies without sello_bret
//   - Trailers from non-tier-1 channels
//   - Festival previews unless the festival itself is happening
//
// Output: .wiki/sources/proposals-latest.json
// Usage: node scripts/cinebret-propose.mjs [--cycle=am|pm]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  loadHistory, saveHistory, reconcileHistory, shouldSuppress,
  recordProposal, getBacklog, gcHistory, normalizeForMatch,
} from './cinebret-history.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CYCLE = process.argv.find(a => a.startsWith('--cycle='))?.split('=')[1] || 'am'
const NOW = new Date()
const NOW_ISO = NOW.toISOString()
const HISTORY_PATH = join(ROOT, '.wiki/sources/proposal-history.json')

try {
  const envFile = readFileSync(join(ROOT, '.env.local'), 'utf-8')
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch {}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1'
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY
const ADMIN_USER_ID = 'b5eafe05-9ec8-4b23-b0b4-137148ecbac2'

// ─────────────────────────────────────────────────────────────────────────────
// Taste profile (from .wiki/reviews/taste-profile.md)
// ─────────────────────────────────────────────────────────────────────────────

// Olimpo: directors with multiple sello bret + reviews + rating-10s. Highest weight.
const OLIMPO = [
  'Christopher Nolan', 'Martin Scorsese', 'Denis Villeneuve', 'Quentin Tarantino',
  'Steven Spielberg', 'David Fincher',
]
// Highly respected: multiple sello bret. High weight.
const HIGHLY_RESPECTED = [
  'Ridley Scott', 'Peter Jackson', 'James Cameron', 'Clint Eastwood', 'Danny Boyle',
  'Guy Ritchie',
]
// Auteurs admired (multiple rating-10s in their filmography or single review)
const ADMIRED_AUTEURS = [
  'Bong Joon-ho', 'Park Chan-wook', 'Hayao Miyazaki', 'Damien Chazelle',
  'Martin McDonagh', 'Darren Aronofsky', 'Edgar Wright', 'Wes Anderson',
  'Ben Affleck', 'Mel Gibson', 'Sam Mendes', 'Greta Gerwig', 'Ari Aster',
  'Robert Eggers', 'Yorgos Lanthimos', 'Josh Safdie', 'Edward Berger', 'Sean Baker',
]

const ALL_FAVORITE_DIRECTORS = [...OLIMPO, ...HIGHLY_RESPECTED, ...ADMIRED_AUTEURS]

function directorTier(name) {
  if (!name) return 0
  const lc = name.toLowerCase()
  if (OLIMPO.some(d => lc.includes(d.toLowerCase()))) return 3
  if (HIGHLY_RESPECTED.some(d => lc.includes(d.toLowerCase()))) return 2
  if (ADMIRED_AUTEURS.some(d => lc.includes(d.toLowerCase()))) return 1
  return 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Source loading
// ─────────────────────────────────────────────────────────────────────────────

function read(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return null }
}

const sources = {
  proposal: read(join(ROOT, '.wiki/sources/strategist-proposal-latest.json')),
  news:     read(join(ROOT, '.wiki/sources/news-feed-latest.json')),
  reddit:   read(join(ROOT, '.wiki/sources/reddit-pulse-latest.json')),
  newsapi:  read(join(ROOT, '.wiki/sources/newsapi-latest.json')),
  trailers: read(join(ROOT, '.wiki/sources/trailers-latest.json')),
  ig:       read(join(ROOT, '.wiki/sources/instagram-posts.json')),
}

console.log(`💡 CineBret Propose [${CYCLE.toUpperCase()}] — ${NOW_ISO}\n`)

// ─────────────────────────────────────────────────────────────────────────────
// History reconciliation
// ─────────────────────────────────────────────────────────────────────────────

const history = loadHistory(HISTORY_PATH)
const RECENT_IG_DAYS = 45
const recentIgPosts = (sources.ig?.posts || []).filter(p => {
  return new Date(p.timestamp).getTime() >= Date.now() - RECENT_IG_DAYS * 86400 * 1000
})

const reconStats = reconcileHistory(history, recentIgPosts, NOW_ISO)
gcHistory(history, NOW_ISO)
console.log(`📋 History: ${history.proposals.length} entries · ${reconStats.accepted} accepted, ${reconStats.becameBacklog} → backlog, ${reconStats.expired} expired\n`)

// Used for IG-recency dedup at proposal generation
const recentIgNorm = recentIgPosts.map(p => normalizeForMatch((p.caption || '').split('\n')[0]))
function alreadyPostedRecently(title) {
  const norm = normalizeForMatch(title)
  if (!norm) return false
  return recentIgNorm.some(ig => ig === norm || ig.includes(norm) || norm.includes(ig))
}

// Build a list of dominant themes from recent IG (last 14 days only).
// Used to boost reviews that thematically continue the latest editorial line.
const recentThemes = (() => {
  const last14 = (sources.ig?.posts || []).filter(p => {
    return new Date(p.timestamp).getTime() >= Date.now() - 14 * 86400 * 1000
  })
  const blob = last14.map(p => (p.caption || '').toLowerCase()).join(' ')
  return {
    blob,
    has(...keywords) { return keywords.some(k => blob.includes(k.toLowerCase())) },
    countDirectors() {
      return ALL_FAVORITE_DIRECTORS.filter(d => blob.includes(d.toLowerCase()))
    }
  }
})()
const recentDirectors = recentThemes.countDirectors()
console.log(`📅 Last 14d IG: directors mentioned = [${recentDirectors.join(', ') || '—'}]\n`)

// IG-reviewed titles (for review-candidate filtering — same logic as detect.mjs)
const igReviewedTitles = new Set()
for (const post of (sources.ig?.posts || [])) {
  const cap = post.caption || ''
  const m = cap.match(/^\s*([^\n(]+?)\s*\((\d{4})\)/m)
  if (m && cap.includes('🎬 Director')) {
    igReviewedTitles.add(`${m[1].trim().toLowerCase()}|${m[2]}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog: load and build a HIGH-QUALITY index for cross-reference
// (only rating ≥ 7 OR sello_bret — these are the films we'd actually post about)
// ─────────────────────────────────────────────────────────────────────────────

console.log('Loading catalog...')

async function supaFetchAll(table, query) {
  const out = []
  let offset = 0
  while (true) {
    const sep = query.includes('?') ? '&' : '?'
    const r = await fetch(`${SUPA_URL}/${table}${query}${sep}limit=1000&offset=${offset}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    })
    if (!r.ok) throw new Error(`${table}: ${r.status}`)
    const batch = await r.json()
    out.push(...batch)
    if (batch.length < 1000) break
    offset += 1000
  }
  return out
}

const [allMovies, enriqs, catalogos, userPelis] = await Promise.all([
  supaFetchAll('peliculas', '?select=id,titulo,titulo_ingles,anio,nota_imdb'),
  supaFetchAll('enriquecimiento', '?select=pelicula_id,review_autor,sello_bret,director,generos,actores'),
  supaFetchAll('catalogos', '?select=pelicula_id,plataforma&activo=eq.true'),
  supaFetchAll('user_peliculas', `?select=pelicula_id,rating&user_id=eq.${ADMIN_USER_ID}`),
])

const enrMap = Object.fromEntries(enriqs.map(e => [e.pelicula_id, e]))
const userMap = Object.fromEntries(userPelis.map(u => [u.pelicula_id, u]))
const catMap = {}
for (const c of catalogos) {
  if (!catMap[c.pelicula_id]) catMap[c.pelicula_id] = []
  catMap[c.pelicula_id].push(c.plataforma)
}

// Index of HIGH-QUALITY films only (used for cross-reference in news/trailers).
// Heuristic: rating ≥ 7 OR sello_bret OR director_olimpo. Anything else
// could match a news item but the resulting proposal wouldn't pass our taste.
const qualityIndex = {} // normTitle → {peli, rating, sello, director}
for (const p of allMovies) {
  const e = enrMap[p.id]
  const u = userMap[p.id]
  const rating = u?.rating || 0
  const sello = !!e?.sello_bret
  const tier = directorTier(e?.director || '')
  const isQuality = rating >= 7 || sello || tier >= 2
  if (!isQuality) continue
  for (const t of [p.titulo_ingles, p.titulo]) {
    if (!t) continue
    const key = t.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
    if (key.length < 6) continue
    if (!qualityIndex[key]) {
      qualityIndex[key] = {
        pelicula_id: p.id,
        titulo: p.titulo,
        titulo_ingles: p.titulo_ingles,
        anio: p.anio,
        nota_imdb: p.nota_imdb,
        director: e?.director,
        rating, sello, tier,
      }
    }
  }
}
console.log(`  catalog: ${allMovies.length} movies, ${Object.keys(qualityIndex).length} quality-indexed (≥7 OR sello OR olimpo dir)\n`)

// ─────────────────────────────────────────────────────────────────────────────
// Catalog match — strict: requires word boundaries + year/director context for
// short or generic titles, to avoid false positives like
// "her decision to leave..." matching the movie "Decision to Leave".
// ─────────────────────────────────────────────────────────────────────────────

const COMMON_TITLE_WORDS = new Set([
  'decision', 'spotlight', 'following', 'her', 'soul', 'up', 'inside',
  'doc', 'the', 'ride', 'down', 'bound', 'stalker', 'witness',
])

function isCommonShortTitle(titleKey) {
  const words = titleKey.split(/\s+/).filter(Boolean)
  if (words.length === 1) return true
  if (words.length <= 2 && words.every(w => COMMON_TITLE_WORDS.has(w))) return true
  return false
}

function findCatalogMatch(text) {
  const haystackRaw = (text || '').toLowerCase()
  const haystack = ' ' + haystackRaw.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ') + ' '
  let best = null
  for (const [key, peli] of Object.entries(qualityIndex)) {
    if (!haystack.includes(' ' + key + ' ')) continue
    // For ambiguous short titles, require year mention OR director mention
    if (isCommonShortTitle(key)) {
      const yearOk = peli.anio && new RegExp(`\\b${peli.anio}\\b`).test(haystackRaw)
      const directorOk = peli.director && haystackRaw.includes(peli.director.toLowerCase())
      // Also allow if title appears in original quotes (smart-quote style)
      const quoted = new RegExp(`['"‘“]\\s*${escapeRegex(key)}\\s*['"’”]`, 'i')
      const inQuotes = quoted.test(text || '')
      if (!yearOk && !directorOk && !inQuotes) continue
    }
    if (!best || (peli.rating > (best.rating || 0))) best = peli
  }
  return best
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// ─────────────────────────────────────────────────────────────────────────────
// News pre-filter: drop noise we'd never use
// ─────────────────────────────────────────────────────────────────────────────

function isMovieRelevantNews(item) {
  const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase()
  // TV-only: drop unless cinema event
  if (/\b(season \d+|episode \d+|s\d+ premiere|tv series|tv fest|television fest|streaming series)\b/.test(text)) return false
  if (/\b(reality (show|tv)|game show|talk show|podcast)\b/.test(text)) return false
  if (/\b(mormon wives|kardashians|love island|big brother)\b/.test(text)) return false
  // Doc-only: drop unless it's about cinema/director-olimpo
  if (/\b(boeing|stock market|crypto|nft|inflation)\b/.test(text)) return false
  // Industry inside-baseball without movie context
  if (/\b(maverick award|honorary award.*tv|exec.*joins)\b/.test(text)) return false
  // Generic announcements that aren't film events
  if (/\b(spring season|broadway season|public tv|public policy)\b/.test(text)) return false
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// CANDIDATE GENERATORS — REVIEWS FIRST
// ─────────────────────────────────────────────────────────────────────────────

const candidates = []

// ── 1. REVIEW candidates (the backbone, 60% of feed)
console.log('Generator: review candidates (rating 10, on platform, no review yet)...')
{
  const reviewCandidates = []
  for (const p of allMovies) {
    const e = enrMap[p.id]
    const u = userMap[p.id]
    if (u?.rating !== 10) continue
    if (e?.review_autor) continue
    const titulo = p.titulo_ingles || p.titulo
    const titleKey = `${(titulo || '').trim().toLowerCase()}|${p.anio}`
    if (igReviewedTitles.has(titleKey)) continue
    const platforms = catMap[p.id] || []
    if (platforms.length === 0) continue
    const tier = directorTier(e?.director || '')

    // Score
    let score = 90
    if (tier === 3) score += 15      // Olimpo
    else if (tier === 2) score += 10 // Highly respected
    else if (tier === 1) score += 7  // Admired
    if (e?.sello_bret) score += 5
    if ((p.nota_imdb || 0) >= 8.5) score += 5
    if ((p.anio || 0) >= 2024) score += 5

    // Thematic continuity boost: if this film's director/genre matches recent IG themes
    if (e?.director && recentDirectors.some(d => e.director.toLowerCase().includes(d.toLowerCase()))) {
      score += 10 // we just talked about this director
    }
    // Korean continuity: if recent IG posted "coreanas" carousel, boost Park/Bong
    if (recentThemes.has('coreana', 'corean', 'corea')) {
      if (/park chan|bong joon/i.test(e?.director || '')) score += 12
    }
    // Plot twist continuity
    if (recentThemes.has('plot twist', 'giro')) {
      if (/Misterio|Mystery|Thriller/i.test((e?.generos || []).join(' '))) score += 5
    }

    reviewCandidates.push({
      pelicula_id: p.id,
      titulo, anio: p.anio, director: e?.director, generos: e?.generos,
      sello_bret: !!e?.sello_bret, tier, platforms, nota_imdb: p.nota_imdb, score,
    })
  }
  reviewCandidates.sort((a, b) => b.score - a.score)

  // Diversity: max 1 per director, mix of decades
  const seenDirectors = new Set()
  const decades = new Set()
  let picked = 0
  for (const r of reviewCandidates) {
    if (picked >= 3) break
    const dirKey = (r.director || '').toLowerCase().split(',')[0].trim()
    if (dirKey && seenDirectors.has(dirKey)) continue
    const decade = r.anio ? Math.floor(r.anio / 10) * 10 : 0
    if (decades.has(decade) && decades.size >= 1 && picked >= 2) continue // 3rd pick must be new decade
    seenDirectors.add(dirKey)
    decades.add(decade)
    const platformStr = [...new Set(r.platforms.map(p => p.replace('_', ' ')))].slice(0, 3).join(', ')
    const tierLabel = r.tier === 3 ? 'Olimpo' : r.tier === 2 ? 'directores muy respetados' : r.tier === 1 ? 'autor admirado' : null
    const reasoning = [
      `Tu rating 10`,
      r.sello_bret ? '+ sello bret' : '',
      `en ${platformStr}.`,
      r.director ? `Dirigida por ${r.director.split(',')[0].trim()}${tierLabel ? ` (${tierLabel})` : ''}.` : '',
      r.score >= 105 ? 'Continuidad temática con tu última semana.' : '',
    ].filter(Boolean).join(' ')
    candidates.push({
      type: 'FEED',
      priority: 'alta',
      action: 'generate_review',
      title: `Review: ${r.titulo} (${r.anio})`,
      reasoning,
      suggested_caption: null,
      source_name: 'pending_review',
      score: r.score,
      skill_to_invoke: 'cinebret-review',
      skill_args: { titulo: r.titulo, anio: r.anio, pelicula_id: r.pelicula_id },
    })
    picked++
  }
  console.log(`  ${reviewCandidates.length} review candidates → picked ${picked} (max 1 per director, decade-diverse)`)
}

// ── 2. LISTA / TOP TEMÁTICO (1 pick, from weighted topic pool)
console.log('Generator: lista temática from topic pool...')
{
  const month = NOW.getMonth()
  const TOPIC_POOL = [
    // Country
    { kind: 'country', name: 'TOP 10 películas coreanas', triggers: ['korea','coreana','park chan','bong joon'], skill_args: { topic_type: 'country', topic: 'corea' } },
    { kind: 'country', name: 'TOP 10 películas japonesas', triggers: ['japan','japón','miyazaki','ghibli'], skill_args: { topic_type: 'country', topic: 'japón' } },
    { kind: 'country', name: 'TOP 10 películas francesas', triggers: ['france','francia','french','cannes'], skill_args: { topic_type: 'country', topic: 'francia' } },
    { kind: 'country', name: 'TOP 10 películas españolas', triggers: ['spain','españa','almodovar','goya'], skill_args: { topic_type: 'country', topic: 'españa' } },
    { kind: 'country', name: 'TOP 10 películas británicas', triggers: ['british','bafta'], skill_args: { topic_type: 'country', topic: 'reino unido' } },
    // Genre
    { kind: 'genre', name: 'TOP 10 thrillers psicológicos', triggers: ['thriller','psychological'], skill_args: { topic_type: 'genre', topic: 'thriller psicológico' } },
    { kind: 'genre', name: 'TOP 10 películas con plot twist', triggers: ['plot twist','giro'], skill_args: { topic_type: 'theme', topic: 'plot twist' } },
    { kind: 'genre', name: 'TOP 10 películas de mafia', triggers: ['mafia','gangster'], skill_args: { topic_type: 'genre', topic: 'mafia' } },
    { kind: 'genre', name: 'TOP 10 sci-fi cerebral', triggers: ['sci-fi','science fiction','dune','villeneuve'], skill_args: { topic_type: 'genre', topic: 'sci-fi cerebral' } },
    { kind: 'genre', name: 'TOP 10 películas de animación', triggers: ['animation','animated','pixar','ghibli','dreamworks'], skill_args: { topic_type: 'genre', topic: 'animación' } },
    { kind: 'genre', name: 'TOP 10 dramas que te dejan pensando', triggers: ['drama'], skill_args: { topic_type: 'genre', topic: 'drama' } },
    { kind: 'genre', name: 'TOP 10 películas de guerra', triggers: ['war film','spielberg','schindler'], skill_args: { topic_type: 'genre', topic: 'guerra' } },
    // Director
    { kind: 'director', name: 'Ranking películas de Christopher Nolan', triggers: ['nolan'], skill_args: { topic_type: 'director', topic: 'Christopher Nolan' } },
    { kind: 'director', name: 'Ranking películas de Martin Scorsese', triggers: ['scorsese'], skill_args: { topic_type: 'director', topic: 'Martin Scorsese' } },
    { kind: 'director', name: 'Ranking películas de Denis Villeneuve', triggers: ['villeneuve','dune'], skill_args: { topic_type: 'director', topic: 'Denis Villeneuve' } },
    { kind: 'director', name: 'Ranking películas de Quentin Tarantino', triggers: ['tarantino'], skill_args: { topic_type: 'director', topic: 'Quentin Tarantino' } },
    { kind: 'director', name: 'Ranking películas de David Fincher', triggers: ['fincher'], skill_args: { topic_type: 'director', topic: 'David Fincher' } },
    { kind: 'director', name: 'Ranking películas de Spielberg', triggers: ['spielberg'], skill_args: { topic_type: 'director', topic: 'Steven Spielberg' } },
    // Studio
    { kind: 'studio', name: 'TOP 10 películas A24', triggers: ['a24'], skill_args: { topic_type: 'studio', topic: 'A24' } },
    { kind: 'studio', name: 'TOP 10 películas Pixar', triggers: ['pixar'], skill_args: { topic_type: 'studio', topic: 'Pixar' } },
    // Theme
    { kind: 'theme', name: '10 películas con plot twist legendario', triggers: ['plot twist'], skill_args: { topic_type: 'theme', topic: 'plot twist' } },
    { kind: 'theme', name: '10 películas que ganaron Oscar Mejor Película', triggers: ['oscar','best picture'], skill_args: { topic_type: 'theme', topic: 'oscar mejor pelicula' } },
    // Era
    { kind: 'era', name: '10 mejores películas de los 90s', triggers: [], skill_args: { topic_type: 'era', topic: 'años 90' } },
    { kind: 'era', name: '10 mejores películas del siglo XXI', triggers: [], skill_args: { topic_type: 'era', topic: 'siglo xxi' } },
    // Mood (seasonal)
    { kind: 'mood', name: '10 películas para el frío del invierno', triggers: [], season: [4,5,6,7], skill_args: { mood: "Pa'l domingo de bajón", count: 10 } },
    { kind: 'mood', name: '10 películas perturbadoras para Halloween', triggers: ['halloween'], season: [9], skill_args: { mood: "Pa' quedar con el cerebro como licuadora", count: 10 } },
    { kind: 'mood', name: '10 películas para terminar el año', triggers: [], season: [11], skill_args: { mood: "Pa' fin de año", count: 10 } },
  ]

  const newsBlob = [
    ...(sources.news?.items || []).map(i => i.title + ' ' + (i.description || '')),
    ...(sources.newsapi?.items || []).map(i => i.title + ' ' + (i.description || '')),
  ].join(' ').toLowerCase()

  const scored = TOPIC_POOL.map(t => {
    let score = 50
    if (alreadyPostedRecently(t.name)) score -= 60 // hard suppress 45d
    for (const trig of t.triggers) {
      if (newsBlob.includes(trig.toLowerCase())) score += 8
    }
    if (recentThemes.has(...t.triggers)) score -= 20 // already in recent IG topic
    if (t.season && t.season.includes(month)) score += 12
    if (t.season && !t.season.includes(month)) score -= 25
    return { topic: t, score }
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score)

  const topTopic = scored[0]
  if (topTopic) {
    candidates.push({
      type: 'FEED',
      priority: topTopic.score >= 70 ? 'alta' : 'media',
      action: topTopic.topic.kind === 'mood' ? 'generate_carousel_mood' : 'generate_carousel_topic',
      title: topTopic.topic.name,
      reasoning: topTopic.score >= 65
        ? `Tema con tracción (${topTopic.score} pts: news + estacional + sin posts recientes).`
        : `Tema rotativo del pool. Datos disponibles en catálogo.`,
      suggested_caption: null,
      source_name: 'topic_pool',
      score: 70 + Math.min(topTopic.score / 4, 12),
      skill_to_invoke: topTopic.topic.kind === 'mood' ? 'cinebret-carousel-mood' : 'cinebret-carousel-topic',
      skill_args: topTopic.topic.skill_args,
    })
    console.log(`  topic pool top: "${topTopic.topic.name}" (raw=${topTopic.score})`)
  }
}

// ── 3. REACTIVA — only if STRONG signal (1 pick max)
console.log('Generator: reactiva (strict — olimpo trailer or rating-9+ catalog match)...')
{
  const reactives = []

  // Trailer drops — tier-1 channels, last 24h, must match olimpo director OR rating-9+ catalog
  for (const t of (sources.trailers?.videos || [])) {
    if (!t.is_trailer || t.channel_tier !== 1) continue
    const ageH = (Date.now() - new Date(t.published).getTime()) / 36e5
    if (ageH > 24) continue
    if (!isMovieRelevantNews({ title: t.title, description: '' })) continue
    const text = (t.title || '').toLowerCase()
    // Catalog match — only count high-quality ones
    const match = findCatalogMatch(t.title)
    const matchRatingHigh = match && (userMap[match.pelicula_id]?.rating || 0) >= 9
    const matchSello = match && match.sello
    // Director hit — only olimpo
    const olimpoHit = OLIMPO.find(d => text.includes(d.toLowerCase()))
    if (!matchRatingHigh && !matchSello && !olimpoHit) continue
    reactives.push({
      type: 'STORY',
      priority: 'alta',
      action: 'share_trailer_in_story',
      title: `Trailer: ${match?.titulo || olimpoHit || (t.title.split(/[|\-—]/)[0].trim())}`,
      reasoning: `${t.channel} subió trailer hace ${Math.round(ageH)}h. ${match ? `Match con catálogo (rating ${userMap[match.pelicula_id]?.rating || '?'}, ${match.titulo}).` : olimpoHit ? `Director olimpo: ${olimpoHit}.` : ''}`.trim(),
      suggested_caption: null,
      source_name: t.channel,
      source_url: t.url,
      score: 100 - ageH,
      skill_to_invoke: 'cinebret-share-story',
      skill_args: { url: t.url, angle: 'hype' },
    })
  }

  // News events — same strict bar
  const newsItems = [
    ...(sources.news?.items || []),
    ...(sources.newsapi?.items || []),
  ]
  const cutoffH = CYCLE === 'pm' ? 24 : 36
  for (const item of newsItems) {
    if (!item.published_iso) continue
    const ageH = (Date.now() - new Date(item.published_iso).getTime()) / 36e5
    if (ageH > cutoffH) continue
    if (!isMovieRelevantNews(item)) continue
    const text = (item.title + ' ' + (item.description || '')).toLowerCase()
    const match = findCatalogMatch(item.title + ' ' + (item.description || ''))
    const matchHighSignal = match && ((userMap[match.pelicula_id]?.rating || 0) >= 9 || match.sello)
    const olimpoHit = OLIMPO.find(d => text.includes(d.toLowerCase()))
    if (!matchHighSignal && !olimpoHit) continue

    // Angle detection
    let angle = 'mention', titlePrefix = 'Noticia'
    if (/trailer|teaser/i.test(item.title)) { angle = 'trailer-drop'; titlePrefix = 'Trailer' }
    else if (/(dies|dead at|passed away|murió|fallecio)/i.test(text)) { angle = 'obituary'; titlePrefix = 'Tributo' }
    else if (/(oscar|academy award)/i.test(text) && match) { angle = 'oscar'; titlePrefix = 'Oscar' }
    else if (/(sequel|follow-?up|next chapter|prequel)/i.test(text) && match) { angle = 'sequel'; titlePrefix = 'Secuela' }

    const subject = match?.titulo || olimpoHit || (item.title.split(/[:\-—|]/)[0].trim())
    reactives.push({
      type: angle === 'trailer-drop' ? 'STORY' : 'FEED',
      priority: 'alta',
      action: angle === 'trailer-drop' ? 'share_trailer_in_story' : 'react_to_news',
      title: `${titlePrefix}: ${subject}`.slice(0, 90),
      reasoning: `${item.source} (${Math.round(ageH)}h): "${item.title.slice(0, 100)}". ${match ? `Match catálogo: ${match.titulo} (rating ${userMap[match.pelicula_id]?.rating || '?'}).` : olimpoHit ? `Director olimpo: ${olimpoHit}.` : ''}`.trim(),
      suggested_caption: null,
      source_name: item.source,
      source_url: item.link,
      score: 80 + (matchHighSignal ? 10 : 0) + (olimpoHit ? 5 : 0) - ageH * 0.3,
      skill_to_invoke: angle === 'trailer-drop' ? 'cinebret-share-story' : 'cinebret-list-from-news',
      skill_args: { url: item.link, angle, headline: item.title },
    })
  }

  // Awards window (only currently happening, last 7 days only)
  for (const a of (sources.proposal?.upcoming_awards || [])) {
    if (a.days_until <= 7 && a.days_until >= 0) {
      reactives.push({
        type: 'FEED',
        priority: 'alta',
        action: 'generate_carousel_awards',
        title: `Cobertura ${a.name}`,
        reasoning: `${a.name} se está realizando (${a.days_until <= 0 ? 'en curso' : 'en ' + a.days_until + ' días'}).`,
        suggested_caption: null,
        source_name: 'awards_calendar',
        score: 85,
        skill_to_invoke: 'cinebret-list-from-news',
        skill_args: { trigger: a.name },
      })
    }
  }

  // Pick top 1
  reactives.sort((a, b) => b.score - a.score)
  if (reactives[0]) {
    candidates.push(reactives[0])
    console.log(`  reactiva top: "${reactives[0].title}" (score=${Math.round(reactives[0].score)})`)
    console.log(`  ${reactives.length - 1} other reactives discarded (only 1 per cycle)`)
  } else {
    console.log(`  no strong reactive signal this cycle`)
  }
}

console.log(`\n  total candidates: ${candidates.length}`)

// ─────────────────────────────────────────────────────────────────────────────
// Filter against IG + history, then pick final 5
// ─────────────────────────────────────────────────────────────────────────────

const filtered = []
for (const c of candidates) {
  if (alreadyPostedRecently(c.title)) continue
  const sup = shouldSuppress(history, c, NOW_ISO)
  if (sup.suppress) continue
  filtered.push(c)
}

// Final ordering: reviews together (top), then lista, then reactiva
const reviews = filtered.filter(c => c.action === 'generate_review').sort((a, b) => b.score - a.score)
const listas = filtered.filter(c => c.action === 'generate_carousel_topic' || c.action === 'generate_carousel_mood')
const reactivas = filtered.filter(c => c.action === 'share_trailer_in_story' || c.action === 'react_to_news' || c.action === 'generate_carousel_awards')

const top = []
top.push(...reviews.slice(0, 3))
if (listas[0]) top.push(listas[0])
if (reactivas[0]) top.push(reactivas[0])

console.log(`\n📊 TOP ${top.length}: ${reviews.slice(0,3).length} reviews + ${listas[0]?1:0} lista + ${reactivas[0]?1:0} reactiva\n`)

// Record fresh proposals in history
for (const t of top) recordProposal(history, t, NOW_ISO)
saveHistory(HISTORY_PATH, history)

// ─────────────────────────────────────────────────────────────────────────────
// News block (informational) — strict catalog/director quality bar
// ─────────────────────────────────────────────────────────────────────────────

console.log('Building news block (strict filter)...')
const newsBlock = []
{
  const allNews = [
    ...(sources.news?.items || []),
    ...(sources.newsapi?.items || []),
  ]
  const fresh = allNews.filter(i => {
    if (!i.published_iso) return false
    const ageH = (Date.now() - new Date(i.published_iso).getTime()) / 36e5
    if (ageH > 30) return false
    return isMovieRelevantNews(i)
  })

  for (const item of fresh) {
    const text = (item.title + ' ' + (item.description || '')).toLowerCase()
    const match = findCatalogMatch(item.title + ' ' + (item.description || ''))
    const olimpoHit = OLIMPO.find(d => text.includes(d.toLowerCase()))
    const respectedHit = HIGHLY_RESPECTED.find(d => text.includes(d.toLowerCase()))
    const auteurHit = ADMIRED_AUTEURS.find(d => text.includes(d.toLowerCase()))
    const directorHit = olimpoHit || respectedHit || auteurHit
    const isTrade = ['Variety', 'Deadline', 'Hollywood Reporter', 'IndieWire', 'The Wrap'].includes(item.source)

    // STRICT bar: must have catalog match (high quality by design of qualityIndex) OR director match
    if (!match && !directorHit) continue

    let score = 0
    if (match) {
      const r = userMap[match.pelicula_id]?.rating || 0
      if (r >= 10) score += 50
      else if (r >= 9) score += 40
      else if (r >= 8) score += 30
      else score += 20
      if (match.sello) score += 10
    }
    if (olimpoHit) score += 35
    else if (respectedHit) score += 20
    else if (auteurHit) score += 15
    if (isTrade) score += 5
    const ageH = (Date.now() - new Date(item.published_iso).getTime()) / 36e5
    score -= ageH * 0.4

    if (score < 25) continue
    newsBlock.push({ ...item, _score: score, _catalog: match, _director: directorHit })
  }
  newsBlock.sort((a, b) => b._score - a._score)

  // Dedup by approximate subject (lowercase first 6 words of title)
  const seenSubjects = new Set()
  const deduped = []
  for (const n of newsBlock) {
    const subj = (n.title || '').toLowerCase().split(/\s+/).slice(0, 6).join(' ')
    if (seenSubjects.has(subj)) continue
    seenSubjects.add(subj)
    deduped.push(n)
    if (deduped.length >= 8) break
  }
  newsBlock.length = 0
  newsBlock.push(...deduped)
  console.log(`  ${newsBlock.length} news items kept (strict filter)`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Backlog
// ─────────────────────────────────────────────────────────────────────────────

const backlog = getBacklog(history, 8)
console.log(`📋 Backlog: ${backlog.length} pending\n`)

// ─────────────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────────────

const passesQualityGate = top.length >= 1 || backlog.length >= 1

const out = {
  generated_at: NOW_ISO,
  cycle: CYCLE,
  passes_quality_gate: passesQualityGate,
  top_count: top.length,
  backlog_count: backlog.length,
  news_count: newsBlock.length,
  top, backlog, news: newsBlock,
  raw_signal_counts: {
    news_items:     sources.news?.items?.length || 0,
    newsapi_items:  sources.newsapi?.items?.length || 0,
    reddit_posts:   sources.reddit?.posts?.length || 0,
    trailers:       sources.trailers?.videos?.length || 0,
  },
  reconciliation_stats: reconStats,
}

const outDir = join(ROOT, '.wiki/sources')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'proposals-latest.json'), JSON.stringify(out, null, 2))
console.log(`✅ Saved → proposals-latest.json (gate=${passesQualityGate ? 'PASS' : 'FAIL'})\n`)

if (top.length) {
  console.log('🎯 TOP:')
  top.forEach((p, i) => {
    console.log(`  ${i + 1}. [${p.type}] ${p.title}  (score=${Math.round(p.score)})`)
    console.log(`     ${p.reasoning}`)
  })
}
if (backlog.length) {
  console.log('\n📋 BACKLOG:')
  backlog.forEach(b => console.log(`  - [${b.type}] ${b.title}`))
}
if (newsBlock.length) {
  console.log('\n📰 NEWS:')
  newsBlock.forEach(n => {
    const tag = n._catalog ? `[${n._catalog.titulo}]` : `[${n._director}]`
    console.log(`  - ${n.source}: ${n.title.slice(0, 80)} ${tag}`)
  })
}

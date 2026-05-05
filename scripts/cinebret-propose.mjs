// CineBret Propose — converts raw signals into ACTIONABLE proposals using
// Alberto's taste filter + memory of past proposals.
//
// Major rewrite (2026-05-05):
//   - Reads news/reddit/newsapi/trailers as proposal sources (not just stats)
//   - Memory: proposal-history.json tracks fresh/backlog/accepted/expired
//     so we never re-propose what's already been shown or posted
//   - Topic pool: replaces hard-coded day-of-week rotation with weighted pool
//     scored by news pulse + IG history + seasonal alignment
//   - Output: 5 reactive (this cycle) + news (informational) + backlog
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
const TOP_N = 5

try {
  const envFile = readFileSync(join(ROOT, '.env.local'), 'utf-8')
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch {}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1'
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY

// ─────────────────────────────────────────────────────────────────────────────
// Taste profile (used to weight news/festival candidates)
// ─────────────────────────────────────────────────────────────────────────────

const FAVORITE_DIRECTORS = [
  'Christopher Nolan', 'Martin Scorsese', 'Denis Villeneuve', 'Quentin Tarantino',
  'Steven Spielberg', 'David Fincher', 'Ridley Scott', 'Peter Jackson',
  'James Cameron', 'Clint Eastwood', 'Danny Boyle', 'Guy Ritchie',
  'Bong Joon-ho', 'Park Chan-wook', 'Hayao Miyazaki', 'Damien Chazelle',
  'Martin McDonagh', 'Darren Aronofsky', 'Edgar Wright', 'Wes Anderson',
  'Ben Affleck', 'Mel Gibson', 'Sam Mendes', 'Greta Gerwig', 'Ari Aster',
  'Robert Eggers', 'Yorgos Lanthimos', 'Josh Safdie', 'Edward Berger', 'Sean Baker',
]

const TIER_1_GENRES = ['Crimen', 'Crime', 'Ciencia ficción', 'Sci-Fi', 'Thriller', 'Misterio', 'Mystery', 'Animación', 'Animation']

function passesTasteFilter({ director, generos, anio, sello_bret, rating_alberto, nota_imdb }) {
  if (director && FAVORITE_DIRECTORS.some(fav => director.toLowerCase().includes(fav.toLowerCase()))) return true
  if (sello_bret && rating_alberto >= 8) return true
  if (Array.isArray(generos) && generos.some(g => TIER_1_GENRES.includes(g)) && (anio || 0) >= 2024 && (nota_imdb || 0) >= 7.5) return true
  if (rating_alberto >= 9) return true
  return false
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
// History reconciliation (Phase 1 of redesign)
// ─────────────────────────────────────────────────────────────────────────────

const history = loadHistory(HISTORY_PATH)
const RECENT_IG_DAYS = 45
const recentIgPosts = (sources.ig?.posts || []).filter(p => {
  const ts = new Date(p.timestamp).getTime()
  return ts >= Date.now() - RECENT_IG_DAYS * 86400 * 1000
})

const reconStats = reconcileHistory(history, recentIgPosts, NOW_ISO)
const gcDropped = gcHistory(history, NOW_ISO)

console.log(`📋 History reconciliation:`)
console.log(`   ${history.proposals.length} entries in history`)
console.log(`   ${reconStats.accepted} marked accepted (matched IG)`)
console.log(`   ${reconStats.becameBacklog} moved fresh → backlog`)
console.log(`   ${reconStats.expired} expired (>14d in backlog)`)
if (gcDropped) console.log(`   ${gcDropped} entries garbage-collected (>60d old)`)
console.log()

// Helper: fuzzy-match against recent IG (used when generating candidates)
const recentIgNorm = recentIgPosts.map(p => normalizeForMatch((p.caption || '').split('\n')[0]))
function alreadyPostedRecently(title) {
  const norm = normalizeForMatch(title)
  if (!norm) return false
  return recentIgNorm.some(ig => ig === norm || ig.includes(norm) || norm.includes(ig))
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog index (for news/trailer cross-reference)
// ─────────────────────────────────────────────────────────────────────────────

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
console.log(`  ${allMovies.length} movies loaded\n`)

// Strict fuzzy match (≥ 2 word overlap, ratio ≥ 70%)
function strictMatch(query, movies) {
  const queryWords = (query || '').toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4)
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

// ─────────────────────────────────────────────────────────────────────────────
// CANDIDATE GENERATORS — each returns an array of proposal candidates
// ─────────────────────────────────────────────────────────────────────────────

const candidates = []

// ── 1. Trailer drop (STORY) — highest priority for fresh trailers (<24h)
console.log('Generator: trailer drops...')
{
  const cutoffH = CYCLE === 'pm' ? 12 : 24 // PM = ultra-fresh; AM = up to last day
  const fresh = (sources.trailers?.videos || [])
    .filter(t => t.is_trailer && t.channel_tier === 1)
    .filter(t => {
      const title = (t.title || '').toLowerCase()
      const exclude = ['season ', 'episode', 'finale', 'series', 'behind the scenes',
                       'making of', 'featurette', 'interview', 'commercial', 'spot',
                       'recap', 'daily fix', 'voice acting']
      return !exclude.some(e => title.includes(e))
    })
    .filter(t => {
      const ageH = (Date.now() - new Date(t.published).getTime()) / 36e5
      return ageH <= cutoffH
    })

  for (const t of fresh) {
    const ageH = Math.round((Date.now() - new Date(t.published).getTime()) / 36e5)
    const movieMatch = t.cinebret_match || strictMatch(t.title, allMovies)
    const movieTitle = movieMatch?.titulo || (t.title.split(/\s*[|\-—]\s*/)[0] || t.title).trim()
    const inCatalog = !!movieMatch

    candidates.push({
      type: 'STORY',
      priority: ageH < 12 ? 'alta' : 'media',
      action: 'share_trailer_in_story',
      title: `Trailer: ${movieTitle}`,
      reasoning: `${t.channel} subió trailer hace ${ageH}h${inCatalog ? '. La peli ya está en tu catálogo.' : '.'}`,
      suggested_caption: inCatalog ? `Trailer de "${movieMatch.titulo}" 🎬\n[tu reacción aquí]` : null,
      source_name: t.channel,
      source_url: t.url,
      score: 100 - ageH * 1.5 + (inCatalog ? 10 : 0),
      skill_to_invoke: 'cinebret-share-story',
      skill_args: { url: t.url, angle: 'hype', cinebret_match: movieMatch },
    })
  }
  console.log(`  ${fresh.length} fresh trailers → candidates`)
}

// ── 2. News-driven proposals (FEED + STORY) — convert news/newsapi/reddit to actionable
console.log('Generator: news events...')
{
  const newsItems = [
    ...(sources.news?.items || []).map(i => ({ ...i, _src: 'news' })),
    ...(sources.newsapi?.items || []).map(i => ({ ...i, _src: 'newsapi' })),
    ...(sources.reddit?.posts || []).map(i => ({
      _src: 'reddit',
      title: i.title,
      description: i.body || '',
      published_iso: i.created_iso || null,
      source: `r/${i.subreddit}`,
      source_weight: 3,
      link: `https://reddit.com${i.permalink || ''}`,
      cinebret_matches: i.cinebret_matches,
    })),
  ]

  // Cutoff: AM uses last 24h; PM uses last 12h (more reactive)
  const cutoffH = CYCLE === 'pm' ? 12 : 30
  const fresh = newsItems.filter(i => {
    if (!i.published_iso) return false
    const ageH = (Date.now() - new Date(i.published_iso).getTime()) / 36e5
    return ageH <= cutoffH
  })

  // Score each news item; only the ones with a clear angle become proposals.
  const directorKeywords = FAVORITE_DIRECTORS.map(d => ({ name: d, lc: d.toLowerCase() }))
  const STOP_TITLES = /(jeopardy|jackass|recap|interview podcast|pop quiz)/i

  for (const item of fresh) {
    const text = (item.title + ' ' + (item.description || '')).toLowerCase()
    if (STOP_TITLES.test(text)) continue

    // Highest-signal: catalog match + tier-1 source
    const catalogMatch = (item.cinebret_matches || [])[0] || (item.cinebret_match || null)
    const directorHit = directorKeywords.find(d => text.includes(d.lc))
    const isTrade = ['Variety', 'Deadline', 'Hollywood Reporter', 'IndieWire', 'The Wrap'].includes(item.source)

    // Decide angle
    let angle = null
    if (/trailer|teaser/i.test(item.title)) angle = 'trailer-drop'
    else if (/casting|casts|cast as|joins/i.test(text)) angle = 'casting'
    else if (/sequel|follow-?up|next chapter|prequel/i.test(text)) angle = 'sequel-news'
    else if (/oscar|academy award|nomination/i.test(text)) angle = 'oscar-buzz'
    else if (/cannes|venice|venecia|toronto|sundance|festival/i.test(text)) angle = 'festival'
    else if (/dies|dead at|passed away|murió|fallecio/i.test(text)) angle = 'obituary'
    else if (catalogMatch || directorHit) angle = 'catalog-or-director-mention'
    else continue // No angle = no proposal

    // Build proposal
    let score = 0
    if (angle === 'trailer-drop') score = 85
    else if (angle === 'obituary') score = 95
    else if (angle === 'oscar-buzz') score = 75
    else if (angle === 'sequel-news') score = 70
    else if (angle === 'casting') score = 60
    else if (angle === 'festival') score = 70
    else if (angle === 'catalog-or-director-mention') score = 50

    if (catalogMatch) score += 15
    if (directorHit) score += 12
    if (isTrade) score += 8
    const ageH = Math.round((Date.now() - new Date(item.published_iso).getTime()) / 36e5)
    score -= ageH * 0.5

    if (score < 55) continue

    const titlePrefix = angle === 'trailer-drop' ? 'Trailer'
                      : angle === 'obituary' ? 'Tributo'
                      : angle === 'oscar-buzz' ? 'Oscar'
                      : angle === 'sequel-news' ? 'Secuela'
                      : angle === 'casting' ? 'Casting'
                      : angle === 'festival' ? 'Festival'
                      : 'Noticia'
    const angleSubject = catalogMatch?.titulo || directorHit?.name || (item.title || '').split(/[:\-—|]/)[0].trim()

    candidates.push({
      type: angle === 'trailer-drop' ? 'STORY' : 'FEED',
      priority: score >= 80 ? 'alta' : (score >= 65 ? 'media' : 'baja'),
      action: angle === 'trailer-drop' ? 'share_trailer_in_story' : 'react_to_news',
      title: `${titlePrefix}: ${angleSubject}`.slice(0, 90),
      reasoning: `${item.source} (${ageH}h): "${item.title.slice(0, 100)}". ${catalogMatch ? `Peli en tu catálogo: ${catalogMatch.titulo}.` : directorHit ? `Director favorito: ${directorHit.name}.` : ''}`.trim(),
      suggested_caption: null,
      source_name: item.source,
      source_url: item.link,
      score,
      skill_to_invoke: angle === 'trailer-drop' ? 'cinebret-share-story' : 'cinebret-list-from-news',
      skill_args: { url: item.link, angle, headline: item.title, cinebret_match: catalogMatch },
    })
  }
  console.log(`  ${candidates.filter(c => c.action === 'react_to_news' || (c.action === 'share_trailer_in_story' && c.skill_args?.angle)).length} news-event candidates`)
}

// ── 3. Awards / festival window (FEED) — within 14 days
console.log('Generator: awards window...')
if (sources.proposal?.upcoming_awards) {
  for (const a of sources.proposal.upcoming_awards) {
    if (a.days_until <= 14 && a.days_until >= 2) {
      candidates.push({
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
  console.log(`  ${candidates.filter(c => c.action === 'generate_carousel_awards').length} awards candidates`)
}

// ── 4. Pending review (FEED) — best rating-10 review still missing in IG/DB
console.log('Generator: pending reviews...')
if (sources.proposal?.pending_reviews) {
  const goodReviews = sources.proposal.pending_reviews
    .filter(r => r.rating_alberto === 10 && (r.platforms || []).length > 0)
    .filter(r => passesTasteFilter({
      director: r.director, generos: r.generos, anio: r.anio,
      sello_bret: r.sello_bret, rating_alberto: r.rating_alberto, nota_imdb: r.nota_imdb,
    }))
    .filter(r => !alreadyPostedRecently(`${r.titulo} (${r.anio})`))
    .slice(0, 3) // up to 3 pending reviews enter the candidate pool

  for (const r of goodReviews) {
    const platforms = [...new Set(r.platforms.map(p => p.replace('_', ' ')))].slice(0, 3).join(', ')
    candidates.push({
      type: 'FEED',
      priority: 'alta',
      action: 'generate_review',
      title: `Review: ${r.titulo} (${r.anio})`,
      reasoning: `Tu rating 10 (favorita) sin review, en ${platforms}. ${r.director ? 'Dirigida por ' + r.director + '. ' : ''}Review pendiente con alto impacto.`,
      suggested_caption: null,
      source_name: 'pending_review',
      score: 75,
      skill_to_invoke: 'cinebret-review',
      skill_args: { titulo: r.titulo, anio: r.anio, pelicula_id: r.pelicula_id },
    })
  }
  console.log(`  ${goodReviews.length} pending-review candidates`)
}

// ── 5. Topic pool (FEED) — replaces hard-coded TOPIC_ROTATION
console.log('Generator: topic pool...')
{
  // Each topic has trigger keywords that, when found in news, boost its score.
  const month = NOW.getMonth()
  const TOPIC_POOL = [
    // Country
    { kind: 'country', name: 'TOP 10 películas coreanas', triggers: ['korea','coreana','park chan','bong joon'], skill_args: { topic_type: 'country', topic: 'corea' } },
    { kind: 'country', name: 'TOP 10 películas japonesas', triggers: ['japan','japón','miyazaki','ghibli'], skill_args: { topic_type: 'country', topic: 'japón' } },
    { kind: 'country', name: 'TOP 10 películas francesas', triggers: ['france','francia','french','cannes'], skill_args: { topic_type: 'country', topic: 'francia' } },
    { kind: 'country', name: 'TOP 10 películas españolas', triggers: ['spain','españa','almodovar','goya'], skill_args: { topic_type: 'country', topic: 'españa' } },
    { kind: 'country', name: 'TOP 10 películas británicas', triggers: ['british','uk','bafta'], skill_args: { topic_type: 'country', topic: 'reino unido' } },
    // Genre
    { kind: 'genre', name: 'TOP 10 thrillers psicológicos', triggers: ['thriller','psychological'], skill_args: { topic_type: 'genre', topic: 'thriller psicológico' } },
    { kind: 'genre', name: 'TOP 10 películas con plot twist', triggers: ['plot twist','giro'], skill_args: { topic_type: 'theme', topic: 'plot twist' } },
    { kind: 'genre', name: 'TOP 10 películas de mafia', triggers: ['mafia','gangster','mob'], skill_args: { topic_type: 'genre', topic: 'mafia' } },
    { kind: 'genre', name: 'TOP 10 películas sci-fi', triggers: ['sci-fi','science fiction','space','denis villeneuve'], skill_args: { topic_type: 'genre', topic: 'sci-fi' } },
    { kind: 'genre', name: 'TOP 10 películas de terror', triggers: ['horror','terror','scream'], skill_args: { topic_type: 'genre', topic: 'terror' } },
    { kind: 'genre', name: 'TOP 10 películas de animación', triggers: ['animation','animated','pixar','ghibli','dreamworks'], skill_args: { topic_type: 'genre', topic: 'animación' } },
    { kind: 'genre', name: 'TOP 10 comedias negras', triggers: ['black comedy','dark comedy','satire'], skill_args: { topic_type: 'genre', topic: 'comedia negra' } },
    // Director
    { kind: 'director', name: 'Ranking películas de Christopher Nolan', triggers: ['nolan'], skill_args: { topic_type: 'director', topic: 'Christopher Nolan' } },
    { kind: 'director', name: 'Ranking películas de Martin Scorsese', triggers: ['scorsese'], skill_args: { topic_type: 'director', topic: 'Martin Scorsese' } },
    { kind: 'director', name: 'Ranking películas de Denis Villeneuve', triggers: ['villeneuve','dune'], skill_args: { topic_type: 'director', topic: 'Denis Villeneuve' } },
    { kind: 'director', name: 'Ranking películas de Quentin Tarantino', triggers: ['tarantino'], skill_args: { topic_type: 'director', topic: 'Quentin Tarantino' } },
    { kind: 'director', name: 'Ranking películas de David Fincher', triggers: ['fincher'], skill_args: { topic_type: 'director', topic: 'David Fincher' } },
    { kind: 'director', name: 'Ranking películas de Park Chan-wook', triggers: ['park chan'], skill_args: { topic_type: 'director', topic: 'Park Chan-wook' } },
    { kind: 'director', name: 'Ranking películas de Bong Joon-ho', triggers: ['bong joon'], skill_args: { topic_type: 'director', topic: 'Bong Joon-ho' } },
    // Studio
    { kind: 'studio', name: 'TOP 10 películas A24', triggers: ['a24'], skill_args: { topic_type: 'studio', topic: 'A24' } },
    { kind: 'studio', name: 'TOP 10 películas Pixar', triggers: ['pixar'], skill_args: { topic_type: 'studio', topic: 'Pixar' } },
    // Theme
    { kind: 'theme', name: 'TOP 10 películas de viajes en el tiempo', triggers: ['time travel','time loop'], skill_args: { topic_type: 'theme', topic: 'viajes en el tiempo' } },
    { kind: 'theme', name: 'TOP 10 películas distópicas', triggers: ['dystopi','dystopy'], skill_args: { topic_type: 'theme', topic: 'distopía' } },
    { kind: 'theme', name: 'TOP 10 películas sobre IA', triggers: ['artificial intelligence','ia','ai movie'], skill_args: { topic_type: 'theme', topic: 'IA' } },
    { kind: 'theme', name: 'TOP 10 robos y atracos', triggers: ['heist','robbery'], skill_args: { topic_type: 'theme', topic: 'atracos' } },
    // Mood (seasonal)
    { kind: 'mood', name: '10 películas para el frío del invierno', triggers: [], season: [4,5,6,7], skill_args: { mood: "Pa'l domingo de bajón", count: 10 } },
    { kind: 'mood', name: '10 películas perturbadoras para Halloween', triggers: ['halloween'], season: [9], skill_args: { mood: "Pa' quedar con el cerebro como licuadora", count: 10 } },
    { kind: 'mood', name: '10 películas para terminar el año', triggers: [], season: [11], skill_args: { mood: "Pa' fin de año", count: 10 } },
    { kind: 'mood', name: '10 películas para el domingo de bajón', triggers: [], season: null, skill_args: { mood: "Pa'l domingo de bajón", count: 10 } },
  ]

  // Score topics: -50 if posted within 45d, +N for trigger matches in news, +seasonal bonus
  const newsBlob = [
    ...(sources.news?.items || []).map(i => i.title + ' ' + (i.description || '')),
    ...(sources.newsapi?.items || []).map(i => i.title + ' ' + (i.description || '')),
  ].join(' ').toLowerCase()

  const scoredTopics = TOPIC_POOL.map(t => {
    let score = 50
    if (alreadyPostedRecently(t.name)) score -= 50
    for (const trig of t.triggers) {
      if (newsBlob.includes(trig.toLowerCase())) score += 10
    }
    if (t.season && t.season.includes(month)) score += 15
    if (t.season && !t.season.includes(month)) score -= 25
    return { topic: t, score }
  }).filter(s => s.score > 0)
   .sort((a, b) => b.score - a.score)

  const topTopic = scoredTopics[0]
  if (topTopic) {
    candidates.push({
      type: 'FEED',
      priority: topTopic.score >= 70 ? 'alta' : 'media',
      action: topTopic.topic.kind === 'mood' ? 'generate_carousel_mood' : 'generate_carousel_topic',
      title: topTopic.topic.name,
      reasoning: topTopic.score >= 65
        ? `Tema con tracción: ${topTopic.score} pts (news + estacional + sin posts recientes).`
        : `Tema rotativo. Datos disponibles en catálogo.`,
      suggested_caption: null,
      source_name: 'topic_pool',
      score: 60 + Math.min(topTopic.score / 2, 20),
      skill_to_invoke: topTopic.topic.kind === 'mood' ? 'cinebret-carousel-mood' : 'cinebret-carousel-topic',
      skill_args: topTopic.topic.skill_args,
    })
    console.log(`  topic pool top: "${topTopic.topic.name}" (score=${topTopic.score})`)
  }
}

console.log(`\n  total candidates before filter: ${candidates.length}`)

// ─────────────────────────────────────────────────────────────────────────────
// Filter candidates: drop anything matching IG OR suppressed by history
// ─────────────────────────────────────────────────────────────────────────────

const filtered = []
const dropped = { ig: 0, history: 0 }
for (const c of candidates) {
  if (alreadyPostedRecently(c.title)) {
    dropped.ig++
    continue
  }
  const sup = shouldSuppress(history, c, NOW_ISO)
  if (sup.suppress) {
    dropped.history++
    continue
  }
  filtered.push(c)
}
console.log(`  dropped: ${dropped.ig} matched IG, ${dropped.history} suppressed by history`)

// ─────────────────────────────────────────────────────────────────────────────
// Pick top N reactive proposals (mix of types, score-sorted)
// ─────────────────────────────────────────────────────────────────────────────

filtered.sort((a, b) => b.score - a.score)

// Internal dedup (same action+title only once)
const seen = new Set()
const unique = []
for (const c of filtered) {
  const key = `${c.action}::${normalizeForMatch(c.title)}`
  if (seen.has(key)) continue
  seen.add(key)
  unique.push(c)
}

// Diversity: prefer mix of STORY + FEED, avoid 5x same action
const top = []
const actionCounts = {}
for (const c of unique) {
  const cnt = actionCounts[c.action] || 0
  if (cnt >= 2 && top.length < TOP_N) continue // no more than 2 of the same action in TOP
  top.push(c)
  actionCounts[c.action] = cnt + 1
  if (top.length >= TOP_N) break
}

console.log(`\n📊 TOP ${top.length} reactive proposals selected`)

// ─────────────────────────────────────────────────────────────────────────────
// Record fresh proposals in history
// ─────────────────────────────────────────────────────────────────────────────

for (const t of top) recordProposal(history, t, NOW_ISO)
saveHistory(HISTORY_PATH, history)
console.log(`   history saved → proposal-history.json`)

// ─────────────────────────────────────────────────────────────────────────────
// Backlog (for the email "Backlog" block)
// ─────────────────────────────────────────────────────────────────────────────

const backlog = getBacklog(history, 8)
console.log(`📋 Backlog: ${backlog.length} pending proposals from past cycles`)

// ─────────────────────────────────────────────────────────────────────────────
// News block (informational, deduped)
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n📰 News block...`)
const newsBlock = []
{
  const allNews = [
    ...(sources.news?.items || []).map(i => ({ ...i, _src: i.source })),
    ...(sources.newsapi?.items || []).map(i => ({ ...i, _src: i.source })),
  ]
  // Filter to last 30h, drop noise
  const cutoffH = 30
  const fresh = allNews.filter(i => {
    if (!i.published_iso) return false
    const ageH = (Date.now() - new Date(i.published_iso).getTime()) / 36e5
    if (ageH > cutoffH) return false
    if (/(jeopardy|jackass|recap|pop quiz|deleted scene|easter egg)/i.test(i.title || '')) return false
    return true
  })
  // Score each: catalog match + tier-1 source + director hit + recency
  for (const item of fresh) {
    const text = (item.title + ' ' + (item.description || '')).toLowerCase()
    const catalogMatch = (item.cinebret_matches || [])[0] || null
    const directorHit = FAVORITE_DIRECTORS.find(d => text.includes(d.toLowerCase()))
    const isTrade = ['Variety', 'Deadline', 'Hollywood Reporter', 'IndieWire', 'The Wrap'].includes(item.source)
    let score = 0
    if (catalogMatch) score += 30
    if (directorHit) score += 25
    if (isTrade) score += 10
    const ageH = (Date.now() - new Date(item.published_iso).getTime()) / 36e5
    score -= ageH * 0.4
    if (score < 5) continue
    newsBlock.push({ ...item, _score: score, _catalog: catalogMatch, _director: directorHit })
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
    if (deduped.length >= 10) break
  }
  newsBlock.length = 0
  newsBlock.push(...deduped)
  console.log(`  ${newsBlock.length} news items (curated, deduped)`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Quality gate + output
// ─────────────────────────────────────────────────────────────────────────────

const hasContent = top.length > 0 || backlog.length > 0 || newsBlock.length >= 3
const passesQualityGate = top.length >= 1 || backlog.length >= 2

const out = {
  generated_at: NOW_ISO,
  cycle: CYCLE,
  passes_quality_gate: passesQualityGate,
  top_count: top.length,
  backlog_count: backlog.length,
  news_count: newsBlock.length,
  top,
  backlog,
  news: newsBlock,
  raw_signal_counts: {
    news_items:     sources.news?.items?.length || 0,
    newsapi_items:  sources.newsapi?.items?.length || 0,
    reddit_posts:   sources.reddit?.posts?.length || 0,
    trailers:       sources.trailers?.videos?.length || 0,
    pending_reviews: sources.proposal?.pending_reviews?.length || 0,
  },
  reconciliation_stats: reconStats,
}

const outDir = join(ROOT, '.wiki/sources')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'proposals-latest.json'), JSON.stringify(out, null, 2))
console.log(`\n✅ Saved → proposals-latest.json`)
console.log(`   Quality gate: ${passesQualityGate ? '✅ PASS' : '❌ FAIL'}`)

if (top.length > 0) {
  console.log(`\n🎯 TOP ${top.length}:`)
  for (let i = 0; i < top.length; i++) {
    const p = top[i]
    console.log(`\n  ${i + 1}. [${p.type}] ${p.title}  (score=${Math.round(p.score)})`)
    console.log(`     ${p.reasoning}`)
  }
}
if (backlog.length > 0) {
  console.log(`\n📋 BACKLOG (${backlog.length}):`)
  for (const b of backlog) {
    console.log(`  - [${b.type}] ${b.title}`)
  }
}
if (newsBlock.length > 0) {
  console.log(`\n📰 NEWS (${newsBlock.length}):`)
  for (const n of newsBlock.slice(0, 5)) {
    console.log(`  - ${n.source}: ${n.title.slice(0, 90)}`)
  }
}

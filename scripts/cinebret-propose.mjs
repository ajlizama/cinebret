// CineBret Propose — orchestrator. Generates candidates, asks the critic
// (cinebret-critic.mjs) for verdicts, then assembles top + backlog + news per
// AGENT-RULES.md §3 (3-1-2 cycle).
//
// Single source of decision: cinebret-critic.mjs. This file does NOT filter on
// its own (no regex hardcoded rules). It only:
//   1. gathers raw candidates from sources
//   2. computes the deficit (3 reviews / 1 contenido / 2 TOPs over last 6 IG posts)
//   3. batches them to the critic
//   4. assembles 5 propuestas + news block + backlog using the verdicts
//   5. runs retroactive GC on history (re-evaluates backlog with current rules)
//
// Output: .wiki/sources/proposals-latest.json
// Usage: node scripts/cinebret-propose.mjs [--cycle=am|pm]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  loadHistory, saveHistory, recordProposal,
  gcHistory, normalizeForMatch, proposalId,
} from './cinebret-history.mjs'
import { evaluateItems, indexVerdicts } from './cinebret-critic.mjs'

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
// Source loading
// ─────────────────────────────────────────────────────────────────────────────

function read(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return null }
}

const sources = {
  news:     read(join(ROOT, '.wiki/sources/news-feed-latest.json')),
  reddit:   read(join(ROOT, '.wiki/sources/reddit-pulse-latest.json')),
  newsapi:  read(join(ROOT, '.wiki/sources/newsapi-latest.json')),
  trailers: read(join(ROOT, '.wiki/sources/trailers-latest.json')),
  ig:       read(join(ROOT, '.wiki/sources/instagram-posts.json')),
}

console.log(`💡 CineBret Propose [${CYCLE.toUpperCase()}] — ${NOW_ISO}\n`)

// ─────────────────────────────────────────────────────────────────────────────
// IG context — last posts + classify into review|contenido|top|otro
// (per AGENT-RULES.md §3 — used to compute the 3-1-2 deficit)
// ─────────────────────────────────────────────────────────────────────────────

function classifyPost(caption) {
  const c = (caption || '')
  if (c.match(/^\W*[^(]+\(\d{4}\)/m) && c.includes('🎬 Director')) return 'review'
  if (c.match(/TOP\s*\d+/i) || c.match(/TOP de \d+/i) || c.match(/^\W*Ranking/im)) return 'top'
  if (c.match(/\d+ pel.+ula.+ para/i) || c.match(/^\d+ películas? para/im)) return 'top'
  // Anything else that looks like editorial / news / promo / oscars / connections / anniversaries
  return 'contenido'
}

const allPosts = (sources.ig?.posts || []).slice().sort((a, b) =>
  new Date(b.timestamp) - new Date(a.timestamp))
const last6 = allPosts.slice(0, 6).map(p => ({
  date: p.timestamp.slice(0, 10),
  type: classifyPost(p.caption),
  title: (p.caption || '').split('\n')[0].slice(0, 80),
}))
const counts = { review: 0, contenido: 0, top: 0 }
for (const p of last6) counts[p.type] = (counts[p.type] || 0) + 1
const target = { review: 3, contenido: 1, top: 2 }
const deficits = {
  review: Math.max(0, target.review - counts.review),
  contenido: Math.max(0, target.contenido - counts.contenido),
  top: Math.max(0, target.top - counts.top),
}

console.log(`📊 Mix de los últimos 6 posts:`)
console.log(`   review=${counts.review}/3   contenido=${counts.contenido}/1   top=${counts.top}/2`)
console.log(`   déficit: review=${deficits.review}, contenido=${deficits.contenido}, top=${deficits.top}\n`)

// ─────────────────────────────────────────────────────────────────────────────
// History reconciliation: detect IG-accepted, age fresh→backlog, expire >14d
// ─────────────────────────────────────────────────────────────────────────────

const history = loadHistory(HISTORY_PATH)
const RECENT_IG_DAYS = 45
const recentPosts = allPosts.filter(p =>
  new Date(p.timestamp).getTime() >= Date.now() - RECENT_IG_DAYS * 86400 * 1000)

const recentTitlesNorm = recentPosts.map(p =>
  normalizeForMatch((p.caption || '').split('\n')[0]))
function alreadyPostedRecently(title) {
  const norm = normalizeForMatch(title)
  if (!norm) return false
  return recentTitlesNorm.some(rt => rt === norm || rt.includes(norm) || norm.includes(rt))
}

let acceptedCount = 0, agedCount = 0, expiredByTime = 0
for (const p of history.proposals) {
  if (p.status === 'accepted' || p.status === 'expired') continue
  if (alreadyPostedRecently(p.title)) {
    p.status = 'accepted'
    p.accepted_at = NOW_ISO
    acceptedCount++
    continue
  }
  if (p.status === 'fresh' && p.last_proposed && p.last_proposed !== NOW_ISO) {
    p.status = 'backlog'
    p.became_backlog_at = NOW_ISO
    agedCount++
  }
  if (p.status === 'backlog') {
    const days = (Date.now() - new Date(p.first_proposed).getTime()) / 86400000
    if (days > 14) {
      p.status = 'expired'
      p.expired_at = NOW_ISO
      expiredByTime++
    }
  }
}
gcHistory(history, NOW_ISO)
console.log(`📋 History: ${history.proposals.length} entries (accepted=${acceptedCount}, aged=${agedCount}, expired_by_time=${expiredByTime})\n`)

// ─────────────────────────────────────────────────────────────────────────────
// Catalog (used for proposal generation, not for filtering)
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
  supaFetchAll('enriquecimiento', '?select=pelicula_id,review_autor,sello_bret,director,generos'),
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
console.log(`  ${allMovies.length} movies\n`)

// IG-already-reviewed (skip these in review candidate pool)
const igReviewed = new Set()
for (const p of allPosts) {
  const cap = p.caption || ''
  const m = cap.match(/^\s*([^\n(]+?)\s*\((\d{4})\)/m)
  if (m && cap.includes('🎬 Director')) {
    igReviewed.add(`${m[1].trim().toLowerCase()}|${m[2]}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate raw candidates (UNFILTERED — the critic decides)
// ─────────────────────────────────────────────────────────────────────────────

const candidates = []

// ── REVIEW candidates: rating-10, on platform, not in DB review_autor, not in IG
{
  const cands = []
  for (const p of allMovies) {
    const e = enrMap[p.id]
    const u = userMap[p.id]
    if (u?.rating !== 10) continue
    if (e?.review_autor) continue
    const titulo = p.titulo_ingles || p.titulo
    const titleKey = `${(titulo || '').trim().toLowerCase()}|${p.anio}`
    if (igReviewed.has(titleKey)) continue
    const platforms = catMap[p.id] || []
    if (platforms.length === 0) continue
    cands.push({
      pelicula_id: p.id, titulo, anio: p.anio,
      director: e?.director, generos: e?.generos,
      sello_bret: !!e?.sello_bret, nota_imdb: p.nota_imdb,
      platforms,
    })
  }
  // Sort: rating-10 + recent first, then by IMDb
  cands.sort((a, b) => (b.anio || 0) - (a.anio || 0) || (b.nota_imdb || 0) - (a.nota_imdb || 0))
  // Top-K (10) so the critic has options after suppression
  for (const r of cands.slice(0, 10)) {
    candidates.push({
      id: proposalId('generate_review', `Review: ${r.titulo} (${r.anio})`),
      type: 'proposal',
      action: 'generate_review',
      title: `Review: ${r.titulo} (${r.anio})`,
      reasoning: `Rating 10 + ${r.sello_bret ? 'sello bret + ' : ''}plataforma activa (${r.platforms.slice(0, 3).join(', ')}). Director: ${r.director || '?'}.`,
      proposed_category: 'review',
      skill_to_invoke: 'cinebret-review',
      skill_args: { titulo: r.titulo, anio: r.anio, pelicula_id: r.pelicula_id },
      _meta: { director: r.director, generos: r.generos, sello: r.sello_bret, anio: r.anio, imdb: r.nota_imdb },
    })
  }
}

// ── TOP / Lista candidates: from a topic pool, scored by news pulse + recency
{
  const month = NOW.getMonth()
  const TOPICS = [
    { kind: 'country', name: 'TOP 10 películas coreanas', triggers: ['korea','coreana','park chan','bong joon'], skill_args: { topic_type: 'country', topic: 'corea' } },
    { kind: 'country', name: 'TOP 10 películas japonesas', triggers: ['japan','japón','miyazaki','ghibli'], skill_args: { topic_type: 'country', topic: 'japón' } },
    { kind: 'country', name: 'TOP 10 películas francesas', triggers: ['france','francia','french','cannes'], skill_args: { topic_type: 'country', topic: 'francia' } },
    { kind: 'country', name: 'TOP 10 películas españolas', triggers: ['spain','españa','almodovar','goya'], skill_args: { topic_type: 'country', topic: 'españa' } },
    { kind: 'country', name: 'TOP 10 películas británicas', triggers: ['british','bafta'], skill_args: { topic_type: 'country', topic: 'reino unido' } },
    { kind: 'genre', name: 'TOP 10 thrillers psicológicos', triggers: ['thriller','psychological'], skill_args: { topic_type: 'genre', topic: 'thriller psicológico' } },
    { kind: 'genre', name: 'TOP 10 películas con plot twist', triggers: ['plot twist','giro'], skill_args: { topic_type: 'theme', topic: 'plot twist' } },
    { kind: 'genre', name: 'TOP 10 películas de mafia', triggers: ['mafia','gangster'], skill_args: { topic_type: 'genre', topic: 'mafia' } },
    { kind: 'genre', name: 'TOP 10 sci-fi cerebral', triggers: ['sci-fi','dune','villeneuve'], skill_args: { topic_type: 'genre', topic: 'sci-fi cerebral' } },
    { kind: 'genre', name: 'TOP 10 películas de animación', triggers: ['animation','animated','pixar','ghibli','dreamworks'], skill_args: { topic_type: 'genre', topic: 'animación' } },
    { kind: 'genre', name: 'TOP 10 dramas que te dejan pensando', triggers: ['drama'], skill_args: { topic_type: 'genre', topic: 'drama' } },
    { kind: 'genre', name: 'TOP 10 películas de guerra', triggers: ['war film','spielberg','schindler'], skill_args: { topic_type: 'genre', topic: 'guerra' } },
    { kind: 'director', name: 'Ranking películas de Christopher Nolan', triggers: ['nolan'], skill_args: { topic_type: 'director', topic: 'Christopher Nolan' } },
    { kind: 'director', name: 'Ranking películas de Martin Scorsese', triggers: ['scorsese'], skill_args: { topic_type: 'director', topic: 'Martin Scorsese' } },
    { kind: 'director', name: 'Ranking películas de Denis Villeneuve', triggers: ['villeneuve','dune'], skill_args: { topic_type: 'director', topic: 'Denis Villeneuve' } },
    { kind: 'director', name: 'Ranking películas de Quentin Tarantino', triggers: ['tarantino'], skill_args: { topic_type: 'director', topic: 'Quentin Tarantino' } },
    { kind: 'director', name: 'Ranking películas de David Fincher', triggers: ['fincher'], skill_args: { topic_type: 'director', topic: 'David Fincher' } },
    { kind: 'director', name: 'Ranking películas de Spielberg', triggers: ['spielberg'], skill_args: { topic_type: 'director', topic: 'Steven Spielberg' } },
    { kind: 'studio', name: 'TOP 10 películas A24', triggers: ['a24'], skill_args: { topic_type: 'studio', topic: 'A24' } },
    { kind: 'studio', name: 'TOP 10 películas Pixar', triggers: ['pixar'], skill_args: { topic_type: 'studio', topic: 'Pixar' } },
    { kind: 'theme', name: '10 películas con plot twist legendario', triggers: ['plot twist'], skill_args: { topic_type: 'theme', topic: 'plot twist' } },
    { kind: 'theme', name: '10 películas que ganaron Oscar Mejor Película', triggers: ['oscar','best picture'], skill_args: { topic_type: 'theme', topic: 'oscar mejor pelicula' } },
    { kind: 'era', name: '10 mejores películas de los 90s', triggers: [], skill_args: { topic_type: 'era', topic: 'años 90' } },
    { kind: 'era', name: '10 mejores películas del siglo XXI', triggers: [], skill_args: { topic_type: 'era', topic: 'siglo xxi' } },
    { kind: 'mood', name: '10 películas para el frío del invierno', triggers: [], season: [4,5,6,7], skill_args: { mood: "Pa'l domingo de bajón", count: 10 } },
    { kind: 'mood', name: '10 películas perturbadoras para Halloween', triggers: ['halloween'], season: [9], skill_args: { mood: "Pa' quedar con el cerebro como licuadora", count: 10 } },
    { kind: 'mood', name: '10 películas para terminar el año', triggers: [], season: [11], skill_args: { mood: "Pa' fin de año", count: 10 } },
  ]

  const newsBlob = [
    ...(sources.news?.items || []).map(i => i.title + ' ' + (i.description || '')),
    ...(sources.newsapi?.items || []).map(i => i.title + ' ' + (i.description || '')),
  ].join(' ').toLowerCase()

  const scored = TOPICS.map(t => {
    let s = 50
    if (alreadyPostedRecently(t.name)) s -= 60
    for (const trig of t.triggers) if (newsBlob.includes(trig.toLowerCase())) s += 10
    if (t.season && t.season.includes(month)) s += 12
    if (t.season && !t.season.includes(month)) s -= 30
    return { topic: t, s }
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s)

  // Top-K (3) so the critic can pick from variety
  for (const { topic } of scored.slice(0, 3)) {
    candidates.push({
      id: proposalId(topic.kind === 'mood' ? 'generate_carousel_mood' : 'generate_carousel_topic', topic.name),
      type: 'proposal',
      action: topic.kind === 'mood' ? 'generate_carousel_mood' : 'generate_carousel_topic',
      title: topic.name,
      reasoning: `Tema rotativo del pool. Datos disponibles en catálogo.`,
      proposed_category: 'top',
      skill_to_invoke: topic.kind === 'mood' ? 'cinebret-carousel-mood' : 'cinebret-carousel-topic',
      skill_args: topic.skill_args,
    })
  }
}

// ── NEWS / TRAILER candidates (raw — critic filters)
{
  const cutoffH = CYCLE === 'pm' ? 24 : 36
  const allNews = [
    ...(sources.news?.items || []).map(i => ({ ...i, _src: 'news' })),
    ...(sources.newsapi?.items || []).map(i => ({ ...i, _src: 'newsapi' })),
  ]
  const fresh = allNews.filter(i => {
    if (!i.published_iso) return false
    const ageH = (Date.now() - new Date(i.published_iso).getTime()) / 36e5
    return ageH <= cutoffH
  })
  for (const item of fresh.slice(0, 30)) {
    const ageH = Math.round((Date.now() - new Date(item.published_iso).getTime()) / 36e5)
    candidates.push({
      id: proposalId('news', `${item.source}|${(item.title || '').slice(0, 60)}`),
      type: 'news',
      title: item.title,
      description: item.description,
      source: item.source,
      published_iso: item.published_iso,
      age_hours: ageH,
      catalog_match: item.cinebret_matches?.[0] || null,
      url: item.link,
    })
  }

  // Trailers: tier-1 channels, last 36h (we let the critic decide if it's olimpo)
  const fresh_t = (sources.trailers?.videos || [])
    .filter(t => t.is_trailer && t.channel_tier === 1)
    .filter(t => (Date.now() - new Date(t.published).getTime()) / 36e5 <= 36)
    .slice(0, 15)
  for (const t of fresh_t) {
    const ageH = Math.round((Date.now() - new Date(t.published).getTime()) / 36e5)
    candidates.push({
      id: proposalId('trailer', `${t.channel}|${(t.title || '').slice(0, 60)}`),
      type: 'trailer',
      title: t.title,
      source: t.channel,
      tier: t.channel_tier,
      age_hours: ageH,
      catalog_match: t.cinebret_match || null,
      url: t.url,
    })
  }
}

// ── BACKLOG: re-evaluate active backlog entries (retroactive GC)
const backlogToReeval = history.proposals.filter(p => p.status === 'fresh' || p.status === 'backlog')
for (const b of backlogToReeval) {
  candidates.push({
    id: b.id,
    type: 'backlog',
    title: b.title,
    description: b.reasoning,
    proposed_category: b.category || (b.action === 'generate_review' ? 'review' : (b.action?.includes('carousel') ? 'top' : 'contenido')),
    age_days: Math.round((Date.now() - new Date(b.first_proposed).getTime()) / 86400000),
    action: b.action,
  })
}

console.log(`Generated ${candidates.length} raw candidates:`)
console.log(`  reviews=${candidates.filter(c => c.type === 'proposal' && c.proposed_category === 'review').length}`)
console.log(`  tops=${candidates.filter(c => c.type === 'proposal' && c.proposed_category === 'top').length}`)
console.log(`  news=${candidates.filter(c => c.type === 'news').length}`)
console.log(`  trailers=${candidates.filter(c => c.type === 'trailer').length}`)
console.log(`  backlog=${candidates.filter(c => c.type === 'backlog').length}\n`)

// ─────────────────────────────────────────────────────────────────────────────
// Send everything to the critic
// ─────────────────────────────────────────────────────────────────────────────

console.log(`Calling critic (Sonnet 4.6)...`)
const critStart = Date.now()
const verdicts = await evaluateItems(candidates, {
  cycle: CYCLE,
  deficits,
  last_ig_posts: last6,
})
const critTime = Math.round((Date.now() - critStart) / 1000)
const usage = verdicts._usage || {}
console.log(`  done in ${critTime}s · cache_read=${usage.cache_read} write=${usage.cache_write} input=${usage.input} output=${usage.output}\n`)
const verdictById = indexVerdicts(verdicts.filter(v => v.id))

// ─────────────────────────────────────────────────────────────────────────────
// Apply verdicts to backlog: discards become expired
// ─────────────────────────────────────────────────────────────────────────────

let expiredByCritic = 0
for (const b of backlogToReeval) {
  const v = verdictById.get(b.id)
  if (v && v.decision === 'discard') {
    b.status = 'expired'
    b.expired_at = NOW_ISO
    b.expired_reason = v.reason
    expiredByCritic++
  }
}
if (expiredByCritic) console.log(`📋 GC: ${expiredByCritic} backlog entries expired by critic\n`)

// ─────────────────────────────────────────────────────────────────────────────
// Pick TOP 5 from "propose" verdicts, biased by deficit
// ─────────────────────────────────────────────────────────────────────────────

const proposed = candidates
  .filter(c => c.type === 'proposal' || c.type === 'news' || c.type === 'trailer')
  .map(c => ({ candidate: c, verdict: verdictById.get(c.id) }))
  .filter(({ verdict }) => verdict && verdict.decision === 'propose')

// Group by category (using critic's verdict, fallback to candidate's proposed_category)
const grouped = { review: [], contenido: [], top: [] }
for (const item of proposed) {
  const cat = item.verdict.category || item.candidate.proposed_category || 'contenido'
  if (grouped[cat]) grouped[cat].push(item)
}
for (const cat of Object.keys(grouped)) {
  grouped[cat].sort((a, b) => (b.verdict.score || 0) - (a.verdict.score || 0))
}

// Diversity check: avoid two reviews with the same director
function reviewDirector(item) {
  const dir = item.candidate?._meta?.director || ''
  return dir.split(',')[0].trim().toLowerCase()
}

// Pop first item from grouped[cat] that doesn't violate director diversity
function popDiverse(cat, takenDirectors) {
  while (grouped[cat].length) {
    const next = grouped[cat].shift()
    if (cat !== 'review') return next
    const dir = reviewDirector(next)
    if (!dir || !takenDirectors.has(dir)) {
      if (dir) takenDirectors.add(dir)
      return next
    }
    // Same director already in TOP — skip but keep in pool for fallback if nothing else
  }
  return null
}

// Order: deficit-driven, diversity-aware (max 1 review per director)
function pickTop5() {
  const top = []
  const takenDirectors = new Set()
  const order = ['review', 'contenido', 'top']
  const want = { review: target.review, contenido: target.contenido, top: target.top }
  function picked(cat) { return top.filter(t => (t.verdict.category || t.candidate.proposed_category) === cat).length }
  // First pass: deficit-priority sweep
  const sweepOrder = order.slice().sort((a, b) => deficits[b] - deficits[a])
  for (const cat of sweepOrder) {
    const need = Math.min(deficits[cat], want[cat])
    while (grouped[cat].length && top.length < 5 && picked(cat) < need) {
      const item = popDiverse(cat, takenDirectors)
      if (!item) break
      top.push(item)
    }
  }
  // Second pass: fill up to 5, respecting category caps + director diversity
  for (const cat of order) {
    while (grouped[cat].length && top.length < 5 && picked(cat) < want[cat]) {
      const item = popDiverse(cat, takenDirectors)
      if (!item) break
      top.push(item)
    }
  }
  // Third pass: still <5, relax director diversity (allow same director if no other choice)
  for (const cat of order) {
    while (grouped[cat].length && top.length < 5) {
      top.push(grouped[cat].shift())
    }
  }
  return top
}
const topPicks = pickTop5()

// Convert to proposal objects (the email format)
const top = topPicks.map(({ candidate, verdict }) => {
  const cat = verdict.category || candidate.proposed_category || 'contenido'
  return {
    id: candidate.id,
    type: cat === 'top' || candidate.action?.includes('carousel') ? 'FEED' : (candidate.type === 'trailer' || verdict.angle === 'trailer-drop' ? 'STORY' : 'FEED'),
    priority: verdict.score >= 80 ? 'alta' : (verdict.score >= 65 ? 'media' : 'baja'),
    action: candidate.action || (verdict.angle === 'trailer-drop' ? 'share_trailer_in_story' : 'react_to_news'),
    title: verdict.rewrite_title_es || candidate.title,
    reasoning: verdict.rewrite_summary_es || verdict.reason,
    score: verdict.score,
    category: cat,
    angle: verdict.angle,
    source_name: candidate.source || candidate.skill_to_invoke,
    source_url: candidate.url || null,
    skill_to_invoke: candidate.skill_to_invoke || (verdict.angle === 'trailer-drop' ? 'cinebret-share-story' : 'cinebret-list-from-news'),
    skill_args: candidate.skill_args || { url: candidate.url, angle: verdict.angle },
    critic_reason: verdict.reason,
  }
})

// Record fresh proposals in history
for (const t of top) recordProposal(history, t, NOW_ISO)
saveHistory(HISTORY_PATH, history)

// ─────────────────────────────────────────────────────────────────────────────
// News block: items with decision == "news_only"
// ─────────────────────────────────────────────────────────────────────────────

const newsBlock = candidates
  .filter(c => c.type === 'news' || c.type === 'trailer')
  .map(c => ({ candidate: c, verdict: verdictById.get(c.id) }))
  .filter(({ verdict }) => verdict && verdict.decision === 'news_only')
  .sort((a, b) => (b.verdict.score || 0) - (a.verdict.score || 0))
  .slice(0, 8)
  .map(({ candidate, verdict }) => ({
    title_es: verdict.rewrite_title_es || candidate.title,
    summary_es: verdict.rewrite_summary_es || '',
    source: candidate.source,
    age_hours: candidate.age_hours,
    url: candidate.url,
    angle: verdict.angle,
    catalog_match: candidate.catalog_match,
    score: verdict.score,
    reason: verdict.reason,
  }))

// ─────────────────────────────────────────────────────────────────────────────
// Backlog (from history.status==='backlog')
// ─────────────────────────────────────────────────────────────────────────────

const backlog = history.proposals
  .filter(p => p.status === 'backlog')
  .sort((a, b) => (b.score || 0) - (a.score || 0))
  .slice(0, 8)
  .map(b => ({
    id: b.id,
    type: b.type,
    title: b.title,
    reasoning: b.reasoning,
    days_ago: Math.round((Date.now() - new Date(b.first_proposed).getTime()) / 86400000),
    skill_to_invoke: b.skill_to_invoke,
    category: b.category,
  }))

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
  ig_mix: { last6_counts: counts, target, deficits },
  top, backlog, news: newsBlock,
  raw_signal_counts: {
    news_items:    sources.news?.items?.length || 0,
    newsapi_items: sources.newsapi?.items?.length || 0,
    reddit_posts:  sources.reddit?.posts?.length || 0,
    trailers:      sources.trailers?.videos?.length || 0,
  },
  reconciliation_stats: { acceptedCount, agedCount, expiredByTime, expiredByCritic },
  critic_usage: usage,
}

const outDir = join(ROOT, '.wiki/sources')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'proposals-latest.json'), JSON.stringify(out, null, 2))
console.log(`✅ Saved → proposals-latest.json (gate=${passesQualityGate ? 'PASS' : 'FAIL'})`)
console.log(`   top=${top.length} (review=${top.filter(t => t.category === 'review').length}, contenido=${top.filter(t => t.category === 'contenido').length}, top=${top.filter(t => t.category === 'top').length})`)
console.log(`   backlog=${backlog.length}, news=${newsBlock.length}\n`)

if (top.length) {
  console.log('🎯 TOP:')
  top.forEach((p, i) => {
    console.log(`  ${i + 1}. [${p.category}/${p.type}] ${p.title}  (score=${p.score})`)
    console.log(`     ${p.reasoning}`)
    console.log(`     critic: ${p.critic_reason}`)
  })
}
if (backlog.length) {
  console.log('\n📋 BACKLOG:')
  backlog.forEach(b => console.log(`  - [${b.category}] ${b.title} (${b.days_ago}d)`))
}
if (newsBlock.length) {
  console.log('\n📰 NEWS:')
  newsBlock.forEach(n => {
    console.log(`  - ${n.source} (${n.age_hours}h): ${n.title_es}`)
    console.log(`    → ${n.summary_es}`)
  })
}

// CineBret Reddit Pulse — top discussions from r/movies, r/television, r/MovieDetails
// Uses Reddit API if credentials available, falls back to public JSON endpoint
// Output: .wiki/sources/reddit-pulse-latest.json

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

try {
  const envFile = readFileSync(join(ROOT, '.env.local'), 'utf-8')
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch {}

const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET
const REDDIT_USER_AGENT = process.env.REDDIT_USER_AGENT || 'CineBretAgent/1.0'

const SUBREDDITS = [
  { name: 'movies',         tier: 1, weight: 5 },
  { name: 'television',     tier: 1, weight: 4 },
  { name: 'MovieDetails',   tier: 2, weight: 3 },
  { name: 'TrueFilm',       tier: 2, weight: 4 },
  { name: 'criterion',      tier: 2, weight: 3 },
  { name: 'flicks',         tier: 3, weight: 2 },
]

let token = null
async function getToken() {
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) return null
  const auth = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64')
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': REDDIT_USER_AGENT,
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) {
    console.log(`  ⚠️  Auth failed (${res.status}), falling back to public endpoint`)
    return null
  }
  const data = await res.json()
  return data.access_token
}

async function fetchSub(name, useAuth) {
  const path = `/r/${name}/top.json?t=day&limit=20`
  const url = useAuth && token ? `https://oauth.reddit.com${path}` : `https://www.reddit.com${path}`
  const headers = { 'User-Agent': REDDIT_USER_AGENT }
  if (useAuth && token) headers.Authorization = `Bearer ${token}`
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
    if (!res.ok) {
      console.log(`  ⚠️  r/${name}: ${res.status}`)
      return []
    }
    const data = await res.json()
    return (data.data?.children || []).map(c => c.data)
  } catch (e) {
    console.log(`  ⚠️  r/${name}: ${e.message}`)
    return []
  }
}

console.log(`👥 CineBret Reddit Pulse — top posts last 24h\n`)
token = await getToken()
console.log(token ? '  Using OAuth (auth)\n' : '  Using public endpoint (no auth)\n')

const allPosts = []
for (const sub of SUBREDDITS) {
  const posts = await fetchSub(sub.name, !!token)
  for (const p of posts) {
    if (!p.title) continue
    allPosts.push({
      subreddit: sub.name,
      subreddit_tier: sub.tier,
      subreddit_weight: sub.weight,
      title: p.title,
      url: `https://reddit.com${p.permalink}`,
      external_url: p.url_overridden_by_dest || p.url,
      flair: p.link_flair_text,
      score: p.score,
      num_comments: p.num_comments,
      upvote_ratio: p.upvote_ratio,
      author: p.author,
      created_utc: p.created_utc,
      created_iso: new Date(p.created_utc * 1000).toISOString(),
      is_video: p.is_video || /trailer|teaser/i.test(p.title),
      is_news: /article|news/i.test(p.link_flair_text || '') || /\.(com|org|net)/.test(p.url || ''),
      selftext: p.selftext ? p.selftext.slice(0, 600) : null,
    })
  }
  console.log(`  ${posts.length.toString().padStart(2)} posts — r/${sub.name}`)
}

// Sort by engagement: score * comments density
allPosts.sort((a, b) => {
  const scoreA = a.score * a.subreddit_weight + a.num_comments * 2
  const scoreB = b.score * b.subreddit_weight + b.num_comments * 2
  return scoreB - scoreA
})

// Cross-reference with CineBret catalog (paginated)
console.log(`\n🔎 Cross-referencing with CineBret catalog...`)
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1'
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY

let titleIndex = {}
try {
  let offset = 0
  while (true) {
    const res = await fetch(`${SUPA_URL}/peliculas?select=id,titulo,titulo_ingles,anio&limit=1000&offset=${offset}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    })
    const batch = await res.json()
    for (const p of batch) {
      for (const t of [p.titulo, p.titulo_ingles]) {
        if (!t) continue
        const key = t.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
        if (!key || key.length < 8) continue
        const hasLongWord = key.split(' ').some(w => w.length >= 5)
        if (!hasLongWord) continue
        if (!titleIndex[key]) titleIndex[key] = p
      }
    }
    if (batch.length < 1000) break
    offset += 1000
  }
} catch (e) { console.log(`  ⚠️  ${e.message}`) }

let matched = 0
const STOP_PATTERNS = /^(the|a|an|el|la|los|las|de|in|on|at)\s/
for (const p of allPosts) {
  const haystackRaw = ((p.title || '') + ' ' + (p.selftext || '')).toLowerCase()
  const haystack = ' ' + haystackRaw.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ') + ' '
  const matches = []
  for (const [key, peli] of Object.entries(titleIndex)) {
    if (key.length < 8) continue
    if (STOP_PATTERNS.test(key) && key.length < 12) continue
    if (haystack.includes(' ' + key + ' ')) {
      matches.push({ pelicula_id: peli.id, titulo: peli.titulo, anio: peli.anio })
    }
  }
  if (matches.length > 0) {
    p.cinebret_matches = matches.slice(0, 3)
    matched++
  }
}
console.log(`  ${matched} posts mention CineBret movies\n`)

const outDir = join(ROOT, '.wiki/sources')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'reddit-pulse-latest.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  total_posts: allPosts.length,
  matched_to_cinebret: matched,
  posts: allPosts,
}, null, 2))

console.log(`✅ Saved ${allPosts.length} posts → reddit-pulse-latest.json\n`)

console.log('🔥 Top 5 by engagement:')
for (const p of allPosts.slice(0, 5)) {
  const matchTag = p.cinebret_matches ? ` [📚 ${p.cinebret_matches.map(m => m.titulo).join(', ')}]` : ''
  console.log(`   • r/${p.subreddit} — ${p.score} ⬆️ ${p.num_comments} 💬${matchTag}`)
  console.log(`     ${p.title.slice(0, 80)}`)
}

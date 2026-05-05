// CineBret Trailers Watch — detecta nuevos trailers de major studios via YouTube Data API
// Output: .wiki/sources/trailers-latest.json
// Usage: node scripts/cinebret-trailers-watch.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
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

// YouTube RSS endpoints don't require an API key.
// YT_KEY is only needed for richer queries (view counts, search by keyword) — optional.
const YT_KEY = process.env.YOUTUBE_API_KEY || null

// Major studio + streaming trailer channels (resolved via find-youtube-channels.mjs)
const CHANNELS = [
  { id: 'UCq0OueAsdxH6b8nyAspwViw', name: 'Universal Pictures', tier: 1 },
  { id: 'UCjmJDM5pRKbUlVIzDYYWb6g', name: 'Warner Bros. Pictures', tier: 1 },
  { id: 'UCuPivVjnfNo4mb3Oog_frZg', name: 'A24', tier: 1 },
  { id: 'UCyQWPkU7yKh79EAsp9cLJAA', name: 'Walt Disney Studios', tier: 1 },
  { id: 'UCz97F7dMxBNOfGYu3rx8aCw', name: 'Sony Pictures', tier: 1 },
  { id: 'UCF9imwPMSGz4Vq1NiTWCC7g', name: 'Paramount Pictures', tier: 1 },
  { id: 'UCWOA1ZGywLbqmigxE4Qlvuw', name: 'Netflix', tier: 1 },
  { id: 'UC1Myj674wRVXB9I4c6Hm5zA', name: 'Apple TV', tier: 1 },
  { id: 'UCVTQuK2CaWaTgSsoNkn5AiQ', name: 'HBO Max', tier: 1 },
  { id: 'UCQJWtTnAHhEG5w4uN0udnUQ', name: 'Prime Video', tier: 1 },
  { id: 'UCor9rW6PgxSQ9vUPWQdnaYQ', name: 'Searchlight Pictures', tier: 2 },
  { id: 'UCU4SM3j_9TNWaSu8KdGV50g', name: 'Focus Features', tier: 2 },
  { id: 'UCb6-VM5UQ4Czj_d3m9EPGfg', name: 'Mubi', tier: 2 },
  { id: 'UCQLoE622e815Kj8IzOOoLjQ', name: 'Neon', tier: 2 },
  { id: 'UCJ6nMHaJPZvsJ-HmUmj1SeA', name: 'Lionsgate', tier: 2 },
  { id: 'UCE0Wkd9Jcn2-TNo5G8bLQrA', name: 'Rotten Tomatoes', tier: 1 },
  { id: 'UCKy1dAqELo0zrOtPkf0eTMw', name: 'IGN', tier: 2 },
]

async function fetchChannelLatest(channelId) {
  // YouTube Data API: list latest uploads via the channel's "uploads" playlist
  // The uploads playlist ID is just the channel ID with first 'UC' replaced by 'UU'
  if (!YT_KEY) return []
  const playlistId = 'UU' + channelId.slice(2)
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=5&key=${YT_KEY}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return []
    const data = await res.json()
    return (data.items || []).map(it => ({
      video_id: it.contentDetails?.videoId,
      title: it.snippet?.title,
      url: `https://www.youtube.com/watch?v=${it.contentDetails?.videoId}`,
      published: it.contentDetails?.videoPublishedAt || it.snippet?.publishedAt,
      thumbnail: it.snippet?.thumbnails?.high?.url || it.snippet?.thumbnails?.default?.url,
    })).filter(v => v.video_id && v.title)
  } catch {
    return []
  }
}

console.log(`🎬 CineBret Trailers Watch — checking ${CHANNELS.length} channels via YouTube RSS...\n`)

const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000 // last 7 days
const allTrailers = []

for (const channel of CHANNELS) {
  const videos = await fetchChannelLatest(channel.id)
  const recent = videos.filter(v => {
    if (!v.published) return false
    return new Date(v.published).getTime() >= cutoff
  })
  // Heurística: prioriza videos que tengan "trailer" en el título
  for (const v of recent) {
    const isTrailer = /trailer|teaser/i.test(v.title)
    allTrailers.push({
      ...v,
      channel: channel.name,
      channel_tier: channel.tier,
      is_trailer: isTrailer,
    })
  }
  console.log(`  ${recent.length.toString().padStart(2)} new videos (${recent.filter(v => /trailer|teaser/i.test(v.title)).length} trailers) — ${channel.name}`)
}

// Sort by date desc
allTrailers.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime())

// Cross-reference with CineBret upcoming releases
console.log(`\n🔎 Cross-referencing trailers with upcoming releases...`)
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
        const key = t.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
        // Strict: key must be non-empty, >= 8 chars, contain at least one word with 5+ chars
        if (!key || key.length < 8) continue
        const hasLongWord = key.split(' ').some(w => w.length >= 5)
        if (!hasLongWord) continue
        if (!titleIndex[key]) titleIndex[key] = p
      }
    }
    if (batch.length < 1000) break
    offset += 1000
  }
} catch (e) {
  console.log(`  ⚠️  ${e.message}`)
}

const STOP_PATTERNS = /^(the|a|an|el|la|los|las|de|in|on|at)\s/
let matched = 0
for (const t of allTrailers) {
  const haystackRaw = t.title.toLowerCase()
  const haystack = ' ' + haystackRaw.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ') + ' '
  for (const [key, peli] of Object.entries(titleIndex)) {
    if (STOP_PATTERNS.test(key) && key.length < 14) continue
    if (haystack.includes(' ' + key + ' ')) {
      t.cinebret_match = { pelicula_id: peli.id, titulo: peli.titulo, anio: peli.anio }
      matched++
      break
    }
  }
}
console.log(`  ${matched} trailers match a CineBret movie\n`)

// Output
const outDir = join(ROOT, '.wiki/sources')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
const out = {
  generated_at: new Date().toISOString(),
  total_videos: allTrailers.length,
  trailers_count: allTrailers.filter(t => t.is_trailer).length,
  matched_to_cinebret: matched,
  videos: allTrailers,
}
writeFileSync(join(outDir, 'trailers-latest.json'), JSON.stringify(out, null, 2))

console.log(`✅ Saved ${allTrailers.length} videos (${out.trailers_count} trailers) → trailers-latest.json\n`)

// Highlight notable
const hot = allTrailers.filter(t => t.is_trailer && t.channel_tier === 1).slice(0, 5)
if (hot.length > 0) {
  console.log('🔥 Top trailers (last 7 days):')
  for (const t of hot) {
    const matchTag = t.cinebret_match ? ` [📚 ${t.cinebret_match.titulo}]` : ''
    console.log(`   • ${t.title}${matchTag}`)
    console.log(`     ${t.channel} — ${t.published?.slice(0, 10)} — ${t.url}`)
  }
}

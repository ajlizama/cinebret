// CineBret News Sync — RSS feeds de fuentes de cine en inglés
// Output: .wiki/sources/news-feed-latest.json
// Usage: node scripts/cinebret-news-sync.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const FEEDS = [
  // Industry trades
  { name: 'Variety',         url: 'https://variety.com/feed/',                       weight: 5, lang: 'en', category: 'industry' },
  { name: 'Hollywood Reporter', url: 'https://www.hollywoodreporter.com/feed/',      weight: 5, lang: 'en', category: 'industry' },
  { name: 'Deadline',        url: 'https://deadline.com/feed/',                      weight: 5, lang: 'en', category: 'industry' },
  { name: 'The Wrap',        url: 'https://www.thewrap.com/feed/',                   weight: 4, lang: 'en', category: 'industry' },
  { name: 'IndieWire',       url: 'https://www.indiewire.com/feed/',                 weight: 4, lang: 'en', category: 'auteur' },
  // Reviews / criticism
  { name: 'Roger Ebert',     url: 'https://www.rogerebert.com/feed',                 weight: 4, lang: 'en', category: 'reviews' },
  // Reddit (RSS oficial)
  { name: 'r/movies',        url: 'https://www.reddit.com/r/movies/top.rss?t=day',   weight: 3, lang: 'en', category: 'pulse' },
  { name: 'r/MovieDetails',  url: 'https://www.reddit.com/r/MovieDetails/top.rss?t=week', weight: 2, lang: 'en', category: 'pulse' },
  { name: 'r/television',    url: 'https://www.reddit.com/r/television/top.rss?t=day', weight: 2, lang: 'en', category: 'pulse' },
  // Letterboxd
  { name: 'Letterboxd Popular Week', url: 'https://letterboxd.com/films/popular/this/week/rss/', weight: 5, lang: 'en', category: 'cinephile' },
]

// Naive XML parser — extracts items from RSS/Atom
function parseFeed(xml, feedName) {
  const items = []
  // RSS 2.0 <item> blocks
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let m
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1]
    const get = (tag) => {
      const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
      const r = block.match(re)
      if (!r) return null
      let val = r[1].trim()
      // Strip CDATA
      val = val.replace(/^<!\[CDATA\[|\]\]>$/g, '')
      // Strip HTML
      val = val.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      // Decode common entities
      val = val.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
      return val
    }
    const title = get('title')
    const link = get('link') || (block.match(/<link[^>]*href="([^"]+)"/i)?.[1])
    const description = get('description') || get('summary') || get('content:encoded')
    const pubDate = get('pubDate') || get('updated') || get('published')
    if (!title) continue
    items.push({
      source: feedName,
      title,
      link,
      description: description ? description.slice(0, 600) : null,
      published: pubDate,
      published_iso: pubDate ? new Date(pubDate).toISOString() : null,
    })
  }
  // Atom <entry> blocks if no <item>
  if (items.length === 0) {
    const entryRe = /<entry[^>]*>([\s\S]*?)<\/entry>/gi
    let n
    while ((n = entryRe.exec(xml)) !== null) {
      const block = n[1]
      const get = (tag) => {
        const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
        const r = block.match(re)
        if (!r) return null
        return r[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().replace(/^<!\[CDATA\[|\]\]>$/g, '')
      }
      const title = get('title')
      const linkMatch = block.match(/<link[^>]*href="([^"]+)"/i)
      const link = linkMatch ? linkMatch[1] : null
      const description = get('summary') || get('content')
      const pubDate = get('updated') || get('published')
      if (!title) continue
      items.push({
        source: feedName,
        title,
        link,
        description: description ? description.slice(0, 600) : null,
        published: pubDate,
        published_iso: pubDate ? new Date(pubDate).toISOString() : null,
      })
    }
  }
  return items
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'CineBretAgent/1.0 (+https://cinebret.cl)' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      console.log(`  ⚠️  ${feed.name}: ${res.status}`)
      return []
    }
    const xml = await res.text()
    const items = parseFeed(xml, feed.name)
    return items.map(it => ({ ...it, source_weight: feed.weight, source_lang: feed.lang, source_category: feed.category }))
  } catch (e) {
    console.log(`  ⚠️  ${feed.name}: ${e.message}`)
    return []
  }
}

console.log(`📰 CineBret News Sync — fetching ${FEEDS.length} feeds...\n`)

const results = await Promise.all(FEEDS.map(async f => {
  const items = await fetchFeed(f)
  console.log(`  ${items.length.toString().padStart(3)} items — ${f.name}`)
  return items
}))

const allItems = results.flat()

// Filter: only items from last 7 days
const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
const fresh = allItems.filter(it => {
  if (!it.published_iso) return true
  return new Date(it.published_iso).getTime() >= cutoff
})

// Sort newest first
fresh.sort((a, b) => {
  const ta = a.published_iso ? new Date(a.published_iso).getTime() : 0
  const tb = b.published_iso ? new Date(b.published_iso).getTime() : 0
  return tb - ta
})

// ─── Cross-reference with CineBret catalog ───
console.log(`\n🔎 Cross-referencing with CineBret catalog...`)
try {
  const envFile = readFileSync(join(ROOT, '.env.local'), 'utf-8')
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch {}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1'
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY

let titleIndex = {}
try {
  let offset = 0
  let totalCount = 0
  while (true) {
    const res = await fetch(`${SUPA_URL}/peliculas?select=id,titulo,titulo_ingles,anio&limit=1000&offset=${offset}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    })
    const peliculas = await res.json()
    if (!Array.isArray(peliculas)) break
    totalCount += peliculas.length
    for (const p of peliculas) {
      for (const t of [p.titulo, p.titulo_ingles]) {
        if (!t) continue
        const key = t.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
        if (!key || key.length < 8) continue
        const hasLongWord = key.split(' ').some(w => w.length >= 5)
        if (!hasLongWord) continue
        if (!titleIndex[key]) titleIndex[key] = { id: p.id, titulo: p.titulo, titulo_ingles: p.titulo_ingles, anio: p.anio }
      }
    }
    if (peliculas.length < 1000) break
    offset += 1000
  }
  console.log(`  ${totalCount} movies indexed (${Object.keys(titleIndex).length} unique title keys)`)
} catch (e) {
  console.log(`  ⚠️  catalog cross-ref skipped: ${e.message}`)
}

// Tag items that mention movies in CineBret (with word-boundary matching to reduce false positives)
let tagged = 0
const STOP_PATTERNS = /^(the|a|an|el|la|los|las|de|in|on|at)\s/
for (const item of fresh) {
  const haystackRaw = ((item.title || '') + ' ' + (item.description || '')).toLowerCase()
  const haystack = ' ' + haystackRaw.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ') + ' '
  const matches = []
  for (const [key, peli] of Object.entries(titleIndex)) {
    if (key.length < 8) continue // require longer titles
    if (STOP_PATTERNS.test(key) && key.length < 12) continue // skip short generic titles
    if (haystack.includes(' ' + key + ' ')) {
      matches.push({ pelicula_id: peli.id, titulo: peli.titulo, anio: peli.anio })
    }
  }
  if (matches.length > 0) {
    item.cinebret_matches = matches.slice(0, 3)
    tagged++
  }
}
console.log(`  ${tagged} items mention CineBret movies\n`)

// ─── Output ───
const outDir = join(ROOT, '.wiki/sources')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

const today = new Date().toISOString().slice(0, 10)
const output = {
  generated_at: new Date().toISOString(),
  feeds_count: FEEDS.length,
  total_items: fresh.length,
  items_with_cinebret_match: tagged,
  by_source: Object.fromEntries(FEEDS.map(f => [f.name, fresh.filter(x => x.source === f.name).length])),
  items: fresh,
}

const outPath = join(outDir, 'news-feed-latest.json')
writeFileSync(outPath, JSON.stringify(output, null, 2))
writeFileSync(join(outDir, `news-feed-${today}.json`), JSON.stringify(output, null, 2))

console.log(`✅ Saved ${fresh.length} fresh items → ${outPath}`)
console.log(`   ${tagged} mention movies in CineBret catalog\n`)

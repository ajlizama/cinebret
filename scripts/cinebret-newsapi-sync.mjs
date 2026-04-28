// CineBret NewsAPI Sync — fetches movie/entertainment news via NewsAPI.org
// Output: .wiki/sources/newsapi-latest.json
// Usage: node scripts/cinebret-newsapi-sync.mjs

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

const NEWS_KEY = process.env.NEWSAPI_KEY
if (!NEWS_KEY) {
  console.error('⚠️  Missing NEWSAPI_KEY in .env.local — skipping')
  console.error('   Get one at: https://newsapi.org/register')
  process.exit(0) // exit 0 so cron doesn't fail
}

// Free tier: 100 req/day. Use targeted queries.
const QUERIES = [
  { q: '"new trailer" movie', sortBy: 'publishedAt', label: 'trailers' },
  { q: 'film festival OR Cannes OR Venice OR Sundance', sortBy: 'publishedAt', label: 'festivals' },
  { q: 'Oscar OR "Academy Award" OR Globes', sortBy: 'publishedAt', label: 'awards' },
  { q: 'Netflix OR HBO OR Disney "new movie"', sortBy: 'publishedAt', label: 'streaming_releases' },
  { q: '"box office"', sortBy: 'publishedAt', label: 'box_office' },
]

async function fetchQuery(q, sortBy, label) {
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=${sortBy}&language=en&pageSize=20&apiKey=${NEWS_KEY}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) {
      console.log(`  ⚠️  ${label}: ${res.status}`)
      return []
    }
    const data = await res.json()
    return (data.articles || []).map(a => ({
      query_label: label,
      title: a.title,
      description: a.description,
      url: a.url,
      source: a.source?.name,
      author: a.author,
      published_at: a.publishedAt,
      image: a.urlToImage,
    }))
  } catch (e) {
    console.log(`  ⚠️  ${label}: ${e.message}`)
    return []
  }
}

console.log(`📰 CineBret NewsAPI Sync — ${QUERIES.length} queries\n`)

const all = []
for (const q of QUERIES) {
  const items = await fetchQuery(q.q, q.sortBy, q.label)
  console.log(`  ${items.length.toString().padStart(2)} items — ${q.label}`)
  all.push(...items)
}

// Dedup by URL
const seen = new Set()
const deduped = all.filter(x => {
  if (seen.has(x.url)) return false
  seen.add(x.url)
  return true
})

deduped.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())

const outDir = join(ROOT, '.wiki/sources')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'newsapi-latest.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  queries_used: QUERIES.length,
  total_unique_items: deduped.length,
  items: deduped,
}, null, 2))

console.log(`\n✅ Saved ${deduped.length} unique articles → newsapi-latest.json`)

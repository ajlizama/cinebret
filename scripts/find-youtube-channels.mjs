// Find real YouTube channel IDs for major studios using YouTube Data API
// Usage: node scripts/find-youtube-channels.mjs

import { readFileSync, writeFileSync } from 'fs'
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

const YT_KEY = process.env.YOUTUBE_API_KEY
if (!YT_KEY) { console.error('Missing YOUTUBE_API_KEY'); process.exit(1) }

// Studios with their official handles or canonical names
const STUDIOS = [
  { name: 'Universal Pictures', handle: '@UniversalPictures', tier: 1 },
  { name: 'Warner Bros. Pictures', handle: '@WarnerBrosPictures', tier: 1 },
  { name: 'A24', handle: '@A24', tier: 1 },
  { name: 'Walt Disney Studios', handle: '@DisneyStudios', tier: 1 },
  { name: 'Sony Pictures', handle: '@SonyPictures', tier: 1 },
  { name: 'Paramount Pictures', handle: '@ParamountPictures', tier: 1 },
  { name: 'Netflix', handle: '@Netflix', tier: 1 },
  { name: 'Apple TV', handle: '@AppleTV', tier: 1 },
  { name: 'HBO Max', handle: '@HBO', tier: 1 },
  { name: 'Prime Video', handle: '@PrimeVideo', tier: 1 },
  { name: 'Searchlight Pictures', handle: '@searchlightpictures', tier: 2 },
  { name: 'Focus Features', handle: '@FocusFeatures', tier: 2 },
  { name: 'Mubi', handle: '@MUBI', tier: 2 },
  { name: 'Neon', handle: '@neon', tier: 2 },
  { name: 'Lionsgate', handle: '@LionsgateMovies', tier: 2 },
  { name: 'Rotten Tomatoes', handle: '@RottenTomatoes', tier: 1 },
  { name: 'IGN', handle: '@IGN', tier: 2 },
]

async function findChannel(studio) {
  // Use channels.list with forHandle parameter (preferred)
  let url = `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle=${encodeURIComponent(studio.handle)}&key=${YT_KEY}`
  let res = await fetch(url)
  let data = await res.json()
  if (data.items?.[0]) return { ...studio, channelId: data.items[0].id, channelTitle: data.items[0].snippet.title }
  // Fallback: search
  url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(studio.name)}&type=channel&maxResults=5&key=${YT_KEY}`
  res = await fetch(url)
  data = await res.json()
  if (data.items?.[0]) return { ...studio, channelId: data.items[0].id?.channelId, channelTitle: data.items[0].snippet?.channelTitle, fallback: true }
  return { ...studio, channelId: null }
}

console.log(`🔎 Looking up YouTube channel IDs for ${STUDIOS.length} studios\n`)

const results = []
for (const s of STUDIOS) {
  const result = await findChannel(s)
  results.push(result)
  const marker = result.channelId ? '✅' : '❌'
  const fallbackTag = result.fallback ? ' (fallback search)' : ''
  console.log(`  ${marker} ${s.name.padEnd(28)} → ${result.channelId || 'NOT FOUND'}${fallbackTag}`)
}

console.log()
const found = results.filter(r => r.channelId)
console.log(`Found ${found.length}/${results.length}\n`)

// Output the array ready to paste into trailers-watch script
console.log('// Paste into scripts/cinebret-trailers-watch.mjs:')
console.log('const CHANNELS = [')
for (const r of found) {
  console.log(`  { id: '${r.channelId}', name: '${r.name}', tier: ${r.tier} },`)
}
console.log(']')

writeFileSync(join(ROOT, '.wiki/sources/youtube-channels-resolved.json'), JSON.stringify(results, null, 2))
console.log(`\n💾 Saved → .wiki/sources/youtube-channels-resolved.json`)

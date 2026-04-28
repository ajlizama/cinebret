// Sync Instagram posts from @cinebret Creator account → .wiki/sources/instagram-posts.json
// Uses Instagram Graph API. Token in .env.local, expires ~60 days.
// Usage: node scripts/sync-instagram.mjs

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

const TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN
if (!TOKEN) {
  console.error('❌ Missing INSTAGRAM_ACCESS_TOKEN in .env.local')
  process.exit(1)
}

const FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_url,thumbnail_url,media_type}'
const PAGE_SIZE = 25

async function fetchAllPosts() {
  let url = `https://graph.instagram.com/me/media?fields=${FIELDS}&limit=${PAGE_SIZE}&access_token=${TOKEN}`
  const all = []
  let pageNum = 1
  while (url) {
    process.stdout.write(`  Fetching page ${pageNum}... `)
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`\n❌ API error: ${res.status} ${await res.text()}`)
      process.exit(1)
    }
    const data = await res.json()
    all.push(...(data.data || []))
    console.log(`got ${data.data?.length || 0} posts (total: ${all.length})`)
    url = data.paging?.next || null
    pageNum++
  }
  return all
}

async function fetchAccountInfo() {
  const url = `https://graph.instagram.com/me?fields=id,username,account_type,media_count&access_token=${TOKEN}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Account info failed: ${res.status}`)
  return await res.json()
}

console.log('🎬 Syncing Instagram posts from @cinebret\n')

const account = await fetchAccountInfo()
console.log(`Account: @${account.username} (${account.account_type})`)
console.log(`Total media: ${account.media_count}\n`)

const posts = await fetchAllPosts()

// Sort newest first
posts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

const outDir = join(ROOT, '.wiki', 'sources')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

const outPath = join(outDir, 'instagram-posts.json')
const output = {
  account: {
    username: account.username,
    account_type: account.account_type,
    media_count: account.media_count,
  },
  synced_at: new Date().toISOString(),
  total_posts: posts.length,
  posts,
}

writeFileSync(outPath, JSON.stringify(output, null, 2))
console.log(`\n✅ Saved ${posts.length} posts → ${outPath}`)

// Quick stats
const types = posts.reduce((acc, p) => {
  acc[p.media_type] = (acc[p.media_type] || 0) + 1
  return acc
}, {})
console.log('\nMedia types:')
for (const [type, count] of Object.entries(types)) {
  console.log(`  ${type}: ${count}`)
}

const dates = posts.map(p => new Date(p.timestamp))
console.log(`\nDate range: ${dates[dates.length - 1].toISOString().slice(0,10)} → ${dates[0].toISOString().slice(0,10)}`)

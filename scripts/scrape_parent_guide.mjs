#!/usr/bin/env node
/**
 * Fetch IMDB Parent Guide via GraphQL API
 * Run: node scripts/scrape_parent_guide.mjs [--batch=500] [--delay=800] [--offset=0] [--type=all|movies|series]
 */

import { createClient } from '@supabase/supabase-js'

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace('--', '').split('=')
    return [k, v ?? 'true']
  })
)
const BATCH_SIZE = parseInt(args.batch || '500')
const DELAY_MS = parseInt(args.delay || '800')
const OFFSET = parseInt(args.offset || '0')
const TYPE = args.type || 'all'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY
if (!supabaseUrl || !supabaseKey) { console.error('Missing env vars'); process.exit(1) }
const supabase = createClient(supabaseUrl, supabaseKey)

const QUERY = `query($id:ID!){title(id:$id){parentsGuide{guideItems(first:50){edges{node{category{id}isSpoiler text{plainText}}}}categories{category{id}severity{text}}}}}`

const CAT_COL = { NUDITY: 'sex_nudity', VIOLENCE: 'violence', PROFANITY: 'profanity', ALCOHOL: 'alcohol_drugs', FRIGHTENING: 'frightening' }
const CAT_DETAIL = { NUDITY: 'sex_nudity_details', VIOLENCE: 'violence_details', PROFANITY: 'profanity_details', ALCOHOL: 'alcohol_drugs_details', FRIGHTENING: 'frightening_details' }

function sleep(ms) { return new Promise(r => setTimeout(r, ms + Math.random() * 300)) }

async function fetchParentGuide(imdbId) {
  const res = await fetch('https://graphql.imdb.com/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ query: QUERY, variables: { id: imdbId } }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const pg = json.data?.title?.parentsGuide
  if (!pg) return null

  const result = {}
  for (const catId of Object.keys(CAT_COL)) {
    result[CAT_COL[catId]] = 'None'
    result[CAT_DETAIL[catId]] = []
  }

  // Severities
  for (const cat of (pg.categories || [])) {
    const col = CAT_COL[cat.category?.id]
    if (col && cat.severity?.text) result[col] = cat.severity.text
  }

  // Details (non-spoiler only)
  for (const edge of (pg.guideItems?.edges || [])) {
    const node = edge.node
    if (!node || node.isSpoiler) continue
    const detailCol = CAT_DETAIL[node.category?.id]
    if (detailCol && node.text?.plainText) {
      result[detailCol].push(node.text.plainText.slice(0, 300))
    }
  }

  // Trim details to max 5 per category
  for (const catId of Object.keys(CAT_DETAIL)) {
    result[CAT_DETAIL[catId]] = result[CAT_DETAIL[catId]].slice(0, 5)
  }

  return result
}

async function getAlreadyScraped() {
  const ids = new Set()
  let from = 0
  while (true) {
    const { data } = await supabase.from('parent_guide').select('imdb_id').range(from, from + 999)
    if (!data || data.length === 0) break
    data.forEach(r => ids.add(r.imdb_id))
    if (data.length < 1000) break
    from += 1000
  }
  return ids
}

async function run() {
  console.log(`\n🎬 IMDB Parent Guide (GraphQL)`)
  console.log(`   Batch: ${BATCH_SIZE} | Delay: ${DELAY_MS}ms | Offset: ${OFFSET} | Type: ${TYPE}\n`)

  const scraped = await getAlreadyScraped()
  console.log(`   Already scraped: ${scraped.size}`)

  const items = []

  if (TYPE === 'all' || TYPE === 'movies') {
    let from = 0
    while (true) {
      const { data } = await supabase.from('peliculas').select('id, imdb_id, nota_imdb')
        .not('imdb_id', 'is', null).order('nota_imdb', { ascending: false, nullsFirst: false }).range(from, from + 999)
      if (!data || data.length === 0) break
      data.forEach(r => { if (!scraped.has(r.imdb_id)) items.push({ pelicula_id: r.id, serie_id: null, imdb_id: r.imdb_id, nota_imdb: r.nota_imdb }) })
      if (data.length < 1000) break
      from += 1000
    }
  }

  if (TYPE === 'all' || TYPE === 'series') {
    let from = 0
    while (true) {
      const { data } = await supabase.from('series').select('id, imdb_id, nota_imdb')
        .not('imdb_id', 'is', null).order('nota_imdb', { ascending: false, nullsFirst: false }).range(from, from + 999)
      if (!data || data.length === 0) break
      data.forEach(r => { if (!scraped.has(r.imdb_id)) items.push({ pelicula_id: null, serie_id: r.id, imdb_id: r.imdb_id, nota_imdb: r.nota_imdb }) })
      if (data.length < 1000) break
      from += 1000
    }
  }

  items.sort((a, b) => (b.nota_imdb ?? 0) - (a.nota_imdb ?? 0))
  const toProcess = items.slice(OFFSET, OFFSET + BATCH_SIZE)
  console.log(`   Total pending: ${items.length}`)
  console.log(`   Processing: ${toProcess.length} (offset ${OFFSET})\n`)

  let success = 0, errors = 0, empty = 0

  for (let i = 0; i < toProcess.length; i++) {
    const item = toProcess[i]
    const pct = ((i + 1) / toProcess.length * 100).toFixed(1)

    try {
      const guide = await fetchParentGuide(item.imdb_id)
      if (!guide) { empty++; continue }

      const { error } = await supabase.from('parent_guide').upsert({
        imdb_id: item.imdb_id, pelicula_id: item.pelicula_id, serie_id: item.serie_id,
        ...guide,
      }, { onConflict: 'imdb_id' })

      if (error) { console.error(`\n  ❌ DB ${item.imdb_id}: ${error.message}`); errors++ }
      else {
        success++
        const levels = [guide.sex_nudity, guide.violence, guide.profanity, guide.alcohol_drugs, guide.frightening].join('/')
        process.stdout.write(`  [${pct}%] ${item.imdb_id} — ${levels}                    \r`)
      }
    } catch (err) {
      errors++
      console.error(`\n  ❌ ${item.imdb_id}: ${err.message}`)
      if (err.message.includes('429')) { console.log('  ⏳ Rate limited, waiting 30s...'); await sleep(30000) }
    }
    await sleep(DELAY_MS)
  }

  console.log(`\n\n✅ Done! Success: ${success} | Errors: ${errors} | Empty: ${empty}`)
  console.log(`   Next: node scripts/scrape_parent_guide.mjs --offset=${OFFSET + BATCH_SIZE}`)
}

run().catch(console.error)

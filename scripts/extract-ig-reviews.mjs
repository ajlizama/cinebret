// Extract review_autor + sinopsis_chilensis from IG captions
// Match against Supabase, generate diff report
// Usage: node scripts/extract-ig-reviews.mjs

import { readFileSync, writeFileSync } from 'fs'
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

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1'
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY

async function supaAll(table, query = '') {
  const PAGE = 1000
  let all = []
  let offset = 0
  while (true) {
    const sep = query ? '&' : ''
    const url = `${SUPA_URL}/${table}?${query}${sep}limit=${PAGE}&offset=${offset}`
    const res = await fetch(url, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    })
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
    const rows = await res.json()
    all = all.concat(rows)
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return all
}

// Parse one IG caption into structured fields
function parseCaption(caption) {
  if (!caption) return null

  // Header: "Title (YYYY)" optionally with emojis
  const headerMatch = caption.match(/^[\W]*([^(]+?)\s*\((\d{4})\)/m)
  if (!headerMatch) return null
  const title = headerMatch[1].replace(/[🍿🎬"']/g, '').trim()
  const year = parseInt(headerMatch[2])

  // Sinopsis: line starting with 💬
  let sinopsis = null
  const sinopsisMatch = caption.match(/💬\s*(.+?)(?=\n\n|$)/s)
  if (sinopsisMatch) {
    sinopsis = sinopsisMatch[1].trim()
  }

  // Review: between sinopsis and "Dulce extra" / "Como detalle extra" / mood emoji ✨
  // Simpler approach: find blocks separated by blank lines, take the longest narrative one after sinopsis
  let review = null

  // After sinopsis paragraph, until "Dulce extra:", "Como detalle extra,", or "✨" mood, or hashtags
  if (sinopsis) {
    const afterSinopsis = caption.split('💬')[1] || ''
    const afterSinopsisLines = afterSinopsis.split('\n')
    // Skip the sinopsis itself (first non-empty line(s) after 💬)
    let i = 0
    while (i < afterSinopsisLines.length && !afterSinopsisLines[i].trim()) i++
    while (i < afterSinopsisLines.length && afterSinopsisLines[i].trim()) i++ // sinopsis line(s)

    // Now collect review lines until we hit the markers
    const reviewLines = []
    while (i < afterSinopsisLines.length) {
      const line = afterSinopsisLines[i]
      const trimmed = line.trim()
      if (
        trimmed.startsWith('Dulce extra') ||
        trimmed.startsWith('Como detalle extra') ||
        trimmed.startsWith('Detalle extra') ||
        trimmed.startsWith('✨') ||
        trimmed.startsWith('#') ||
        trimmed.match(/^Pa['‘’]/) // Mood without ✨
      ) break
      reviewLines.push(line)
      i++
    }
    review = reviewLines.join('\n').trim()
    // Strip leading "-" if present (one IG post had "-Quizás...")
    if (review.startsWith('-')) review = review.slice(1).trim()
  }

  // Detalle extra (capture as part of review for Supabase storage)
  const dulceMatch = caption.match(/(Dulce extra[:,]?\s*[\s\S]+?)(?=\n\n✨|\n\n#|$)/m)
  const detalleMatch = caption.match(/(Como detalle extra[,:]?\s*[\s\S]+?)(?=\n\n✨|\n\n#|$)/m)
  let detalleExtra = null
  if (dulceMatch) detalleExtra = dulceMatch[1].trim()
  else if (detalleMatch) detalleExtra = detalleMatch[1].trim()

  // For Supabase review_autor: combine review + detalle extra (both are part of the full review)
  let fullReview = review
  if (detalleExtra && !review.includes(detalleExtra)) {
    fullReview = review + '\n\n' + detalleExtra
  }

  return { title, year, sinopsis, review: fullReview }
}

// Normalize for fuzzy match
function norm(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

console.log('Loading data...\n')
const ig = JSON.parse(readFileSync(join(ROOT, '.wiki/sources/instagram-posts.json'), 'utf-8'))
const peliculas = await supaAll('peliculas', 'select=id,titulo,titulo_ingles,titulo_latino,anio')
const enriquecimiento = await supaAll('enriquecimiento', 'select=pelicula_id,review_autor,sinopsis_chilensis')

const enrMap = Object.fromEntries(enriquecimiento.map(e => [e.pelicula_id, e]))

// Build title index for fuzzy matching
const titleIndex = {}
for (const p of peliculas) {
  for (const t of [p.titulo, p.titulo_ingles, p.titulo_latino]) {
    if (t) {
      const key = `${norm(t)}|${p.anio}`
      titleIndex[key] = p
      // Also without year
      const titleOnly = norm(t)
      if (!titleIndex[titleOnly]) titleIndex[titleOnly] = p
    }
  }
}

// Parse IG posts
const parsed = ig.posts
  .map(p => ({ post: p, data: parseCaption(p.caption) }))
  .filter(x => x.data) // only review-like posts

console.log(`Parsed ${parsed.length} IG reviews\n`)

// Match each to Supabase
const results = []
for (const { post, data } of parsed) {
  const key1 = `${norm(data.title)}|${data.year}`
  const key2 = norm(data.title)

  const movie = titleIndex[key1] || titleIndex[key2]

  if (!movie) {
    results.push({ data, status: 'no_match', post })
    continue
  }

  const enr = enrMap[movie.id]
  const supaSinopsis = enr?.sinopsis_chilensis || null
  const supaReview = enr?.review_autor || null

  const status = {
    pelicula_id: movie.id,
    titulo: movie.titulo,
    anio: movie.anio,
    ig_title: data.title,
    ig_year: data.year,
    ig_review: data.review,
    ig_sinopsis: data.sinopsis,
    supa_review: supaReview,
    supa_sinopsis: supaSinopsis,
    review_action: !supaReview ? 'INSERT' : (supaReview.trim() === data.review?.trim() ? 'SAME' : 'DIFFERENT'),
    sinopsis_action: !supaSinopsis ? 'INSERT' : (supaSinopsis.trim() === data.sinopsis?.trim() ? 'SAME' : 'DIFFERENT'),
  }
  results.push({ data, status, post })
}

// Save full diff to file for review
writeFileSync(
  join(ROOT, '.wiki/sources/ig-supabase-diff.json'),
  JSON.stringify(results, null, 2)
)

// Print summary
const noMatch = results.filter(r => r.status === 'no_match' || r.status?.review_action === undefined)
const reviewInserts = results.filter(r => r.status?.review_action === 'INSERT')
const reviewUpdates = results.filter(r => r.status?.review_action === 'DIFFERENT')
const reviewSame = results.filter(r => r.status?.review_action === 'SAME')
const sinopsisInserts = results.filter(r => r.status?.sinopsis_action === 'INSERT')
const sinopsisUpdates = results.filter(r => r.status?.sinopsis_action === 'DIFFERENT')
const sinopsisSame = results.filter(r => r.status?.sinopsis_action === 'SAME')

console.log('═'.repeat(70))
console.log(' RESUMEN DIFF — IG vs Supabase')
console.log('═'.repeat(70))
console.log(`\n  Reviews:`)
console.log(`    INSERT (faltan en Supabase):  ${reviewInserts.length}`)
console.log(`    UPDATE (diferentes):           ${reviewUpdates.length}`)
console.log(`    SAME (iguales):                ${reviewSame.length}`)
console.log(`\n  Sinopsis:`)
console.log(`    INSERT (faltan en Supabase):  ${sinopsisInserts.length}`)
console.log(`    UPDATE (diferentes):           ${sinopsisUpdates.length}`)
console.log(`    SAME (iguales):                ${sinopsisSame.length}`)
console.log(`\n  No match en Supabase:            ${noMatch.length}`)

if (noMatch.length > 0) {
  console.log('\n  Sin match (verificar manualmente):')
  for (const r of noMatch) {
    console.log(`    - ${r.data.title} (${r.data.year})`)
  }
}

console.log('\n' + '═'.repeat(70))
console.log(' DETALLE: REVIEWS A INSERTAR')
console.log('═'.repeat(70))
for (const r of reviewInserts) {
  console.log(`\n  📝 ${r.status.titulo} (${r.status.anio})`)
  console.log(`     ID: ${r.status.pelicula_id}`)
  const preview = (r.status.ig_review || '').slice(0, 150).replace(/\n/g, ' ')
  console.log(`     Preview: ${preview}...`)
}

console.log('\n' + '═'.repeat(70))
console.log(' DETALLE: REVIEWS A ACTUALIZAR')
console.log('═'.repeat(70))
for (const r of reviewUpdates) {
  console.log(`\n  ✏️  ${r.status.titulo} (${r.status.anio})`)
  console.log(`     IG  : ${(r.status.ig_review || '').slice(0, 100).replace(/\n/g, ' ')}...`)
  console.log(`     Supa: ${(r.status.supa_review || '').slice(0, 100).replace(/\n/g, ' ')}...`)
}

console.log('\n' + '═'.repeat(70))
console.log(' DETALLE: SINOPSIS A ACTUALIZAR')
console.log('═'.repeat(70))
for (const r of sinopsisUpdates) {
  console.log(`\n  ✏️  ${r.status.titulo} (${r.status.anio})`)
  console.log(`     IG  : ${r.status.ig_sinopsis}`)
  console.log(`     Supa: ${r.status.supa_sinopsis}`)
}

console.log('\n' + '═'.repeat(70))
console.log(' DETALLE: SINOPSIS A INSERTAR')
console.log('═'.repeat(70))
for (const r of sinopsisInserts) {
  console.log(`\n  📝 ${r.status.titulo} (${r.status.anio})`)
  console.log(`     IG  : ${r.status.ig_sinopsis}`)
}

console.log('\n✅ Diff completo en: .wiki/sources/ig-supabase-diff.json\n')

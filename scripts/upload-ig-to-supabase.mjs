// Upload selected IG content to Supabase enriquecimiento
// DRY RUN by default. Pass --apply to actually execute.
// Usage: node scripts/upload-ig-to-supabase.mjs [--apply]

import { readFileSync } from 'fs'
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

const APPLY = process.argv.includes('--apply')
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1'
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY

const diff = JSON.parse(readFileSync(join(ROOT, '.wiki/sources/ig-supabase-diff.json'), 'utf-8'))

// Indexed by movie title for lookup
const byTitle = {}
for (const item of diff) {
  if (item.status?.titulo) byTitle[item.status.titulo.toLowerCase()] = item
}

// No Other Choice — title in IG is English, in Supabase is "No hay otra opción"
// Matcher missed it. Find it via the IG data parser results would not help here, manually load it.
// We'll look in the diff file for items with no_match status and find No Other Choice.
let noOtherChoice = null
for (const item of diff) {
  if (item.data?.title === 'No Other Choice') {
    noOtherChoice = item
    break
  }
}

// Build update plan
const plan = []

// === REVIEWS ===
// 1. No Other Choice — UPDATE review (add Dulce extra) + sinopsis
if (noOtherChoice) {
  plan.push({
    label: 'No Other Choice (2025) — UPDATE review (add Dulce extra) + sinopsis',
    pelicula_id: '2748589a-0ae9-4b14-b877-385cf3b6cd41',
    fields: {
      review_autor: noOtherChoice.data.review,
      sinopsis_chilensis: noOtherChoice.data.sinopsis,
      es_review_autor: true,
    },
    method: 'PATCH',
  })
}

// 2. Marty Supreme — INSERT review + UPDATE sinopsis + flip flag
const marty = byTitle['marty supreme']
if (marty) {
  plan.push({
    label: 'Marty Supreme (2025) — INSERT review + UPDATE sinopsis + flip es_review_autor',
    pelicula_id: marty.status.pelicula_id,
    fields: {
      review_autor: marty.data.review,
      sinopsis_chilensis: marty.data.sinopsis,
      es_review_autor: true,
    },
    method: 'PATCH',
  })
}

// 3. Conclave — INSERT review + UPDATE sinopsis + flip flag
const conclave = byTitle['cónclave']
if (conclave) {
  plan.push({
    label: 'Cónclave (2024) — INSERT review + UPDATE sinopsis + flip es_review_autor',
    pelicula_id: conclave.status.pelicula_id,
    fields: {
      review_autor: conclave.data.review,
      sinopsis_chilensis: conclave.data.sinopsis,
      es_review_autor: true,
    },
    method: 'PATCH',
  })
}

// === SINOPSIS ONLY (4 more from the 7 different) ===
const sinopsisOnlyTitles = [
  'Whiplash',
  'Snatch. Cerdos y diamantes',
  'Matrix',
  'Regreso al futuro',
  'Uno de los nuestros',
]

for (const t of sinopsisOnlyTitles) {
  const item = byTitle[t.toLowerCase()]
  if (item && item.status?.sinopsis_action === 'DIFFERENT') {
    plan.push({
      label: `${t} — UPDATE sinopsis only`,
      pelicula_id: item.status.pelicula_id,
      fields: {
        sinopsis_chilensis: item.data.sinopsis,
      },
      method: 'PATCH',
    })
  }
}

// === PRINT PLAN ===
console.log('═'.repeat(70))
console.log(` PLAN DE UPLOAD ${APPLY ? '(APLICANDO)' : '(DRY RUN — usa --apply)'}`)
console.log('═'.repeat(70))
console.log(`\nTotal operaciones: ${plan.length}\n`)

for (let i = 0; i < plan.length; i++) {
  const p = plan[i]
  console.log(`[${i+1}/${plan.length}] ${p.label}`)
  console.log(`  pelicula_id: ${p.pelicula_id}`)
  for (const [k, v] of Object.entries(p.fields)) {
    if (typeof v === 'string') {
      const preview = v.length > 100 ? v.slice(0, 100) + '...' : v
      console.log(`  ${k}: "${preview.replace(/\n/g, ' ⏎ ')}"`)
    } else {
      console.log(`  ${k}: ${v}`)
    }
  }
  console.log()
}

if (!APPLY) {
  console.log('═'.repeat(70))
  console.log(' DRY RUN — nada se subió. Para aplicar:')
  console.log('   node scripts/upload-ig-to-supabase.mjs --apply')
  console.log('═'.repeat(70))
  process.exit(0)
}

// === APPLY ===
console.log('═'.repeat(70))
console.log(' APLICANDO CAMBIOS')
console.log('═'.repeat(70))

let success = 0
let fail = 0
for (const p of plan) {
  const url = `${SUPA_URL}/enriquecimiento?pelicula_id=eq.${p.pelicula_id}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(p.fields),
  })
  if (res.ok) {
    console.log(`  ✅ ${p.label}`)
    success++
  } else {
    const err = await res.text()
    console.log(`  ❌ ${p.label}`)
    console.log(`     Error: ${res.status} ${err}`)
    fail++
  }
}

console.log(`\n═══ RESULTADO: ${success} ok, ${fail} fail ═══`)

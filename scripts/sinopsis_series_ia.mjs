// Generate Chilean-style AI sinopsis for series using Claude API
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envFile = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8')
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
} catch {}

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '') + '/rest/v1'
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY || ''

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function supaAll(table, query) {
  const all = []
  let offset = 0
  while (true) {
    const res = await fetch(`${SUPA_URL}/${table}?${query}&limit=1000&offset=${offset}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    })
    const rows = await res.json()
    all.push(...rows)
    if (rows.length < 1000) break
    offset += 1000
  }
  return all
}

async function supaPatch(table, filter, data) {
  const res = await fetch(`${SUPA_URL}/${table}?${filter}`, {
    method: 'PATCH',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(data),
  })
  return res.ok
}

const SYSTEM_PROMPT = `Eres un crítico de cine chileno joven y relajado. Tu estilo es informal, directo, con modismos chilenos.
Escribe sinopsis cortas de series de TV (2-3 frases máximo, ~40-60 palabras).

Reglas:
- Usa modismos chilenos naturales: "loco/a", "cabro/a", "brigido/a", "pa'", "la raja", "te va a dejar", "como pa'", "puras leseras", "se pone heavy"
- NO uses groserías fuertes (no "wea", "chucha", "culiao")
- Describe la premisa de forma entretenida y casual
- Agrega una mini-opinión al final ("te va a volar la cabeza", "pa' maratonear un fin de semana", "de esas que no podís parar de ver")
- NO copies la sinopsis original de TMDB, reescríbela con tu estilo
- NO uses emojis
- Escribe en español chileno`

async function generateSinopsis(titulo, tituloIngles, sinopsisOriginal, generos) {
  const prompt = `Serie: "${tituloIngles || titulo}"
Géneros: ${generos.join(', ')}
Sinopsis original: ${sinopsisOriginal || 'No disponible'}

Escribe una sinopsis corta en estilo chileno informal (2-3 frases, ~50 palabras). No copies la sinopsis original, reescríbela con tu estilo.`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  return response.content[0]?.text?.trim() || null
}

async function main() {
  console.log('='.repeat(60))
  console.log('  SINOPSIS IA PARA SERIES (estilo chileno)')
  console.log('='.repeat(60))

  // Get all series with their enrichment
  const series = await supaAll('series', 'select=id,titulo,titulo_ingles,nota_imdb')
  const enrichments = await supaAll('enriquecimiento_series', 'select=serie_id,sinopsis_chilensis,generos')

  const enrMap = {}
  enrichments.forEach(e => { enrMap[e.serie_id] = e })

  // Find series that need sinopsis rewrite (have TMDB-style sinopsis, not Chilean)
  // Heuristic: if sinopsis doesn't contain Chilean modisms, it needs rewriting
  const chileanMarkers = ['loco', 'cabro', 'brigid', "pa'", 'la raja', 'lesera', 'heavy', 'cacha', 'bacán', 'wn', 'compadre', 'volada']

  const needsRewrite = series.filter(s => {
    const enr = enrMap[s.id]
    if (!enr?.sinopsis_chilensis) return false // no sinopsis at all, skip
    const sin = enr.sinopsis_chilensis.toLowerCase()
    // If it has Chilean markers, it's already been rewritten
    return !chileanMarkers.some(m => sin.includes(m))
  })

  // Sort by IMDB desc (best series first)
  needsRewrite.sort((a, b) => (b.nota_imdb || 0) - (a.nota_imdb || 0))

  console.log(`Total series: ${series.length}`)
  console.log(`Need sinopsis rewrite: ${needsRewrite.length}`)

  // CLI args
  const args = process.argv.slice(2)
  const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : needsRewrite.length
  const DRY_RUN = args.includes('--dry-run')

  const toProcess = needsRewrite.slice(0, LIMIT)
  console.log(`Processing: ${toProcess.length}${DRY_RUN ? ' (DRY RUN)' : ''}`)

  let ok = 0, fail = 0

  for (let i = 0; i < toProcess.length; i++) {
    const s = toProcess[i]
    const enr = enrMap[s.id]
    const pct = ((i + 1) / toProcess.length * 100).toFixed(0)

    try {
      const newSinopsis = await generateSinopsis(s.titulo, s.titulo_ingles, enr.sinopsis_chilensis, enr.generos || [])
      if (!newSinopsis) { fail++; continue }

      if (DRY_RUN) {
        console.log(`\n[${i + 1}/${toProcess.length}] ${s.titulo_ingles || s.titulo}`)
        console.log(`  ORIGINAL: ${enr.sinopsis_chilensis?.slice(0, 100)}...`)
        console.log(`  CHILENA:  ${newSinopsis}`)
      } else {
        await supaPatch('enriquecimiento_series', `serie_id=eq.${s.id}`, { sinopsis_chilensis: newSinopsis })
        ok++
      }

      if ((i + 1) % 50 === 0) console.log(`[${i + 1}/${toProcess.length} ${pct}%] ok: ${ok}`)

      // Rate limit: ~50 requests/min for Haiku
      if ((i + 1) % 50 === 0) await sleep(2000)

    } catch (err) {
      console.error(`  Error ${s.titulo_ingles}: ${err.message}`)
      fail++
      if (err.message.includes('rate_limit')) await sleep(10000)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`  OK: ${ok}, Fail: ${fail}`)
  console.log('='.repeat(60))
}

main().catch(e => { console.error(e); process.exit(1) })

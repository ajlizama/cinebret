// Use Claude to audit and improve keywords for top series
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
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)

const sleep = ms => new Promise(r => setTimeout(r, ms))

const SYSTEM_PROMPT = `You are a TV series expert and IMDB power user. Your job is to audit and improve keyword tags for TV series.

Given a series' current keywords, genres, title, IMDB rating, and synopsis, you must:

1. REMOVE redundant or overly generic keywords that don't help distinguish this series
2. ADD missing thematic keywords that capture what makes this series special and what connects it to similar series

Focus on abstract thematic tags like:
- epic-historical, mind-bending, space-epic, coming-of-age, dark-psychological, revenge, survival, heist-clever, crime-empire, dystopia, war-drama, animated-art, superhero, romantic-drama, family-heartwarming, horror-atmospheric, musical-performance
- Also add: "antihero", "slow-burn", "ensemble-cast", "twist-ending", "morally-gray", "workplace-drama", "political-intrigue", "found-family", "unreliable-narrator", "cat-and-mouse", "procedural", "limited-series", "dark-comedy", "social-commentary", "period-drama", "psychological-thriller", "binge-worthy"

Rules:
- Return ONLY a JSON object: {"remove": ["kw1", "kw2"], "add": ["kw3", "kw4"]}
- Keep it concise: max 5 removals, max 8 additions
- Don't add keywords the series already has
- If the keywords are already good, return {"remove": [], "add": []}
- Always respond with valid JSON, nothing else`

async function auditSerie(serie) {
  const prompt = `TV Series: "${serie.titulo_ingles}" (${serie.anio_inicio || '?'})
IMDB: ${serie.nota_imdb}
Genres: ${(serie.generos || []).join(', ')}
Current keywords: ${(serie.keywords || []).join(', ')}
Synopsis: ${(serie.sinopsis || '').slice(0, 300)}

Audit these keywords for a TV series. What should be removed and what's missing?`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0]?.text?.trim()
  if (!text) return null
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0])
  } catch { return null }
}

async function main() {
  const args = process.argv.slice(2)
  const DRY_RUN = args.includes('--dry-run')
  const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 1500

  console.log('='.repeat(60))
  console.log('  AUDITORÍA DE KEYWORDS SERIES CON IA')
  console.log('='.repeat(60))
  if (DRY_RUN) console.log('  *** DRY RUN ***')

  // Get top series by IMDB
  const allSeries = []
  let offset = 0
  while (true) {
    const { data } = await supabase.from('series')
      .select('id, titulo, titulo_ingles, anio_inicio, nota_imdb')
      .not('nota_imdb', 'is', null)
      .order('nota_imdb', { ascending: false })
      .range(offset, offset + 999)
    if (!data || data.length === 0) break
    allSeries.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }

  const enrMap = new Map()
  offset = 0
  while (true) {
    const { data } = await supabase.from('enriquecimiento_series')
      .select('serie_id, keywords, generos, sinopsis_chilensis, keywords_reviewed')
      .range(offset, offset + 999)
    if (!data || data.length === 0) break
    data.forEach(e => enrMap.set(e.serie_id, e))
    if (data.length < 1000) break
    offset += 1000
  }

  const candidates = allSeries
    .filter(s => { const enr = enrMap.get(s.id); return enr && !enr.keywords_reviewed })
    .slice(0, LIMIT)

  console.log(`Total series: ${allSeries.length}`)
  console.log(`Already reviewed: ${allSeries.filter(s => enrMap.get(s.id)?.keywords_reviewed).length}`)
  console.log(`To process: ${candidates.length}`)

  let processed = 0, modified = 0, unchanged = 0, failed = 0

  for (let i = 0; i < candidates.length; i++) {
    const serie = candidates[i]
    const enr = enrMap.get(serie.id)
    const pct = ((i + 1) / candidates.length * 100).toFixed(0)

    try {
      const result = await auditSerie({
        ...serie,
        generos: enr.generos,
        keywords: enr.keywords,
        sinopsis: enr.sinopsis_chilensis,
      })

      if (!result) { failed++; continue }

      const toRemove = new Set((result.remove || []).map(k => k.toLowerCase()))
      const toAdd = (result.add || []).filter(k => !(enr.keywords || []).map(x => x.toLowerCase()).includes(k.toLowerCase()))

      if (toRemove.size === 0 && toAdd.length === 0) {
        unchanged++
        if (!DRY_RUN) {
          await supabase.from('enriquecimiento_series').update({ keywords_reviewed: true }).eq('serie_id', serie.id)
        }
      } else {
        modified++
        const currentKws = (enr.keywords || []).filter(k => !toRemove.has(k.toLowerCase()))
        const newKws = [...currentKws, ...toAdd]

        if (DRY_RUN) {
          console.log(`\n[${i + 1}/${candidates.length}] ${serie.titulo_ingles} (⭐${serie.nota_imdb})`)
          if (toRemove.size > 0) console.log(`  REMOVE: ${[...toRemove].join(', ')}`)
          if (toAdd.length > 0) console.log(`  ADD: ${toAdd.join(', ')}`)
        } else {
          await supabase.from('enriquecimiento_series').update({
            keywords: newKws,
            keywords_reviewed: true,
          }).eq('serie_id', serie.id)
        }
      }

      processed++
      if ((i + 1) % 50 === 0) {
        console.log(`[${i + 1}/${candidates.length} ${pct}%] processed: ${processed}, modified: ${modified}, unchanged: ${unchanged}, failed: ${failed}`)
      }
      if ((i + 1) % 50 === 0) await sleep(2000)

    } catch (err) {
      failed++
      if (err.message?.includes('rate_limit')) {
        console.log('Rate limited, waiting 30s...')
        await sleep(30000)
        i--
      }
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`  Processed: ${processed}`)
  console.log(`  Modified: ${modified}`)
  console.log(`  Unchanged: ${unchanged}`)
  console.log(`  Failed: ${failed}`)
  console.log('='.repeat(60))
}

main().catch(e => { console.error(e); process.exit(1) })

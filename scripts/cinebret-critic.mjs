// CineBret Critic — single source of decision for every content candidate.
//
// One function: evaluateItems(items, ctx) → verdicts[]
// Verdict shape per .wiki/reviews/AGENT-RULES.md §2:
//   {id, decision, score, reason, angle, rewrite_title_es, rewrite_summary_es, category}
//
// Implementation: one batched Sonnet 4.6 call per cycle. AGENT-RULES.md is the
// system prompt (cached with ephemeral cache_control so repeat cycles within
// 5 min reuse the prefix). The user message is the JSON list of candidates +
// runtime context (last IG posts, current deficit).
//
// Toda la lógica de filtrado consume este módulo. Si el output parece malo,
// se ajusta editando AGENT-RULES.md (no agregando overrides en código).

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

let _cachedSystem = null
function loadSystemPrompt() {
  if (_cachedSystem) return _cachedSystem
  const rules = readFileSync(join(ROOT, '.wiki/reviews/AGENT-RULES.md'), 'utf-8')
  // Pull just the essentials from taste-profile to keep the prompt deterministic
  // (the file changes rarely; including everything would inflate the cache write
  // for marginal benefit).
  const taste = readFileSync(join(ROOT, '.wiki/reviews/taste-profile.md'), 'utf-8')
  // Extract just the directors + top-38 + valued/disliked sections (heuristic slice)
  const tasteShort = taste
    .split('\n')
    .filter(line => !/^source:|^updated:|^---/.test(line))
    .join('\n')
    .trim()
  _cachedSystem = `Eres el crítico de contenido de @cinebret. Tu trabajo es decidir, por cada candidato (noticia, trailer, propuesta), si vale como propuesta accionable, como noticia informativa, o si se descarta. Aplicas AGENT-RULES.md sin excepción.

══════════════════════════════════════════════════════════════
AGENT-RULES.md (fuente de verdad — gana sobre cualquier otra cosa)
══════════════════════════════════════════════════════════════

${rules}

══════════════════════════════════════════════════════════════
PERFIL DE GUSTOS DE ALBERTO (contexto, no anula reglas)
══════════════════════════════════════════════════════════════

${tasteShort}

══════════════════════════════════════════════════════════════
INSTRUCCIONES DE OUTPUT
══════════════════════════════════════════════════════════════

Te llega un array JSON de candidatos. Por cada uno devuelves UN objeto con:

  - id: el mismo id que viene en el input
  - decision: "propose" | "news_only" | "discard"
  - score: 0-100 (90+ = altísima, 75+ = alta, 50+ = media, <50 = baja)
  - reason: una oración en español citando la regla aplicada de AGENT-RULES (ej: "§4.1 hard discard: tv fest" o "§4.2 catalog match con rating ≥9: Oppenheimer")
  - angle: "review" | "trailer-drop" | "sequel" | "casting" | "oscar" | "festival" | "anniversary" | "obituary" | "cultural-moment" | null
  - rewrite_title_es: título limpio en español neutral (sin chilenismos), sin HTML entities, máximo 90 chars
  - rewrite_summary_es: una oración en español que diga POR QUÉ a Alberto le importa. Máximo 22 palabras. Empieza por el sujeto, no por "La noticia es que...".
  - category: "review" | "contenido" | "top" | null  (review=peli individual, contenido=anniversary/news/oscars/conexiones/promo, top=lista temática/plataforma/director ranking)

REGLAS DURAS DEL FORMATO:
1. Devuelves SOLO el array JSON. Cero texto antes o después. Cero markdown fences.
2. Un objeto por candidato, en el mismo orden del input.
3. Si dudas entre dos categorías, elige la más estricta (discard > news_only > propose).
4. Si el candidato es de tipo "proposal" (ya generado como propuesta de review/lista), evalúas si tiene sentido publicarse hoy. NO le bajas el score solo por ser repetitivo si el historial dice que aún no fue posteado.
5. Si el candidato es de tipo "backlog" (ya en historial), reevalúas con las reglas actuales. Si ahora es discard, di discard — eso lo expira.

Ejemplos de buenos rewrite_title_es:
- "Nuevo trailer de La Odisea (Nolan): primer vistazo a Damon como Odiseo"
- "Park Chan-wook recibe homenaje en Locarno"
- "Aniversario 30 años: Pulp Fiction"

Ejemplos malos (no hagas esto):
- "James Cameron, Disney Sued Over Alleged..." (en inglés, truncado, HTML entities)
- "La noticia es que Cameron fue demandado" (empieza por meta-frase)
- "Demanda contra Cameron" (sin contexto de por qué importa para cinebret)`
  return _cachedSystem
}

let _client = null
function getClient() {
  if (_client) return _client
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY no está definido')
  }
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

// Strip optional markdown fences and any preamble/trailer the model may add
function extractJsonArray(text) {
  let s = (text || '').trim()
  // Strip markdown fences
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  // Find first '[' and last ']'
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON array found in response. Got: ${s.slice(0, 200)}...`)
  }
  return s.slice(start, end + 1)
}

/**
 * Evaluate a batch of content candidates.
 *
 * @param {Array} items — each must have at least {id, type, ...domain-specific fields}.
 *   type ∈ "news" | "trailer" | "proposal" | "backlog"
 * @param {Object} ctx — runtime context the critic should consider:
 *   - last_ig_posts: array of last ~6 IG posts, each {date, type:"review"|"contenido"|"top"|"otro", title}
 *   - deficits: {review: number, contenido: number, top: number}
 *   - cycle: "am" | "pm"
 *
 * @returns {Promise<Array>} verdicts in same order as items
 */
export async function evaluateItems(items, ctx = {}) {
  if (!items?.length) return []

  const system = loadSystemPrompt()

  const userMsg = `Evalúa los siguientes ${items.length} candidatos.

CONTEXTO RUNTIME:
- ciclo: ${ctx.cycle || 'am'}
- déficit del patrón 3-1-2: ${JSON.stringify(ctx.deficits || {})}
- últimos posts IG (más reciente primero):
${JSON.stringify(ctx.last_ig_posts || [], null, 2)}

CANDIDATOS:
${JSON.stringify(items, null, 2)}

Devuelve SOLO el array JSON con ${items.length} objetos.`

  const client = getClient()
  let response
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: [
        { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userMsg }],
    })
  } catch (err) {
    console.error(`[critic] API error: ${err.status || ''} ${err.message}`)
    throw err
  }

  const textBlock = response.content.find(c => c.type === 'text')
  if (!textBlock) throw new Error('Critic response had no text block')

  let parsed
  try {
    parsed = JSON.parse(extractJsonArray(textBlock.text))
  } catch (err) {
    // Retry once with a stricter instruction. Common failure: model wraps JSON
    // with explanatory text or escapes accents wrong.
    console.warn(`[critic] First JSON parse failed (${err.message}). Retrying with stricter prompt.`)
    const retry = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: [
        { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        { role: 'user', content: userMsg },
        { role: 'assistant', content: textBlock.text },
        { role: 'user', content: 'El output anterior no se pudo parsear como JSON. Devuelve EXCLUSIVAMENTE el array JSON completo, válido, sin markdown ni texto adicional.' },
      ],
    })
    const t2 = retry.content.find(c => c.type === 'text')?.text || ''
    parsed = JSON.parse(extractJsonArray(t2))
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Critic returned non-array: ${typeof parsed}`)
  }

  // Soft validation: ensure every input has a verdict (by id)
  const byId = new Map(parsed.map(v => [v.id, v]))
  const missing = items.filter(i => !byId.has(i.id))
  if (missing.length) {
    console.warn(`[critic] ${missing.length} items missing from response — defaulting to discard`)
    for (const m of missing) {
      parsed.push({
        id: m.id,
        decision: 'discard',
        score: 0,
        reason: 'critic no devolvió veredicto para este item',
        angle: null,
        rewrite_title_es: m.title || '',
        rewrite_summary_es: '',
        category: null,
      })
    }
  }

  // Cache stats for logging
  parsed._usage = {
    cache_read: response.usage.cache_read_input_tokens || 0,
    cache_write: response.usage.cache_creation_input_tokens || 0,
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
  }

  return parsed
}

// Indexed helper: turn the verdicts array into a Map by id for easy lookup
export function indexVerdicts(verdicts) {
  const map = new Map()
  for (const v of verdicts) {
    if (v.id) map.set(v.id, v)
  }
  return map
}

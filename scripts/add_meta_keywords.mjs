// Add meta-keywords to movies based on existing keywords + genres
// These are abstract thematic tags that connect movies that "feel" similar
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

import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)

// Meta-keyword rules: if a movie has certain keywords/genres, add these abstract tags
const META_RULES = [
  // Epic historical
  { match: { keywords: ['war', 'battle', 'battlefield', 'warrior', 'sword', 'sword fighting', 'sword and sandal', 'medieval', 'ancient rome', 'roman empire', 'gladiator', 'knight', 'viking', 'samurai', 'army', 'rebellion', 'revolution', 'empire', 'king', 'kingdom'], genres: ['Historia', 'History', 'Guerra', 'War'] }, meta: 'epic-historical' },
  // Underdog / rise
  { match: { keywords: ['underdog', 'rise to power', 'rags to riches', 'training', 'competition', 'championship', 'comeback', 'against the odds', 'determination', 'ambition', 'world champion', 'boxing', 'sports'], genres: ['Deporte', 'Sport'] }, meta: 'underdog-rise' },
  // Heist / clever crime
  { match: { keywords: ['heist', 'robbery', 'con artist', 'scam', 'theft', 'bank robbery', 'master plan', 'double cross', 'scheme'], genres: [] }, meta: 'heist-clever' },
  // Mind-bending / reality
  { match: { keywords: ['dream', 'simulation', 'parallel universe', 'time travel', 'time loop', 'alternate reality', 'consciousness', 'virtual reality', 'inception', 'matrix', 'multiverse', 'mind control', 'hallucination'], genres: [] }, meta: 'mind-bending' },
  // Space / sci-fi epic
  { match: { keywords: ['space', 'astronaut', 'space travel', 'spaceship', 'planet', 'mars', 'moon', 'nasa', 'alien', 'galaxy', 'interstellar', 'space station', 'colonization'], genres: ['Ciencia Ficción', 'Ciencia ficción', 'Science Fiction'] }, meta: 'space-epic' },
  // Coming of age / youth
  { match: { keywords: ['coming of age', 'teenager', 'high school', 'adolescence', 'first love', 'growing up', 'youth', 'college', 'school', 'friendship', 'bullying', 'prom'], genres: [] }, meta: 'coming-of-age' },
  // Dark / psychological
  { match: { keywords: ['psychopath', 'serial killer', 'obsession', 'paranoia', 'manipulation', 'dark secret', 'twisted', 'mental illness', 'insanity', 'stalker', 'suspense', 'psychological thriller'], genres: [] }, meta: 'dark-psychological' },
  // Family heartwarming
  { match: { keywords: ['family', 'father son', 'mother daughter', 'parent child', 'parenthood', 'adoption', 'family relationships', 'childhood', 'grandfather', 'grandmother'], genres: ['Familia', 'Family'] }, meta: 'family-heartwarming' },
  // Revenge
  { match: { keywords: ['revenge', 'vengeance', 'vigilante', 'retribution', 'vendetta', 'payback'], genres: [] }, meta: 'revenge' },
  // Survival
  { match: { keywords: ['survival', 'stranded', 'shipwreck', 'desert island', 'wilderness', 'lost', 'rescue', 'disaster', 'earthquake', 'tsunami', 'avalanche', 'trapped'], genres: [] }, meta: 'survival' },
  // Romantic drama
  { match: { keywords: ['love', 'romance', 'love triangle', 'forbidden love', 'star-crossed lovers', 'heartbreak', 'wedding', 'marriage', 'divorce', 'affair', 'unrequited love', 'long distance relationship'], genres: ['Romance'] }, meta: 'romantic-drama' },
  // Crime empire / mafia
  { match: { keywords: ['mafia', 'mob', 'gangster', 'organized crime', 'drug dealer', 'drug trafficking', 'cartel', 'crime boss', 'corruption', 'money laundering'], genres: ['Crimen', 'Crime'] }, meta: 'crime-empire' },
  // Dystopia / society
  { match: { keywords: ['dystopia', 'totalitarianism', 'surveillance', 'resistance', 'oppression', 'rebellion', 'propaganda', 'authoritarian', 'post-apocalyptic', 'future'], genres: [] }, meta: 'dystopia' },
  // War drama (modern)
  { match: { keywords: ['world war ii', 'world war i', 'vietnam war', 'iraq', 'afghanistan', 'soldier', 'military', 'combat', 'trench warfare', 'd-day', 'nazi', 'holocaust', 'concentration camp', 'occupation'], genres: [] }, meta: 'war-drama' },
  // Animated masterpiece (Ghibli-style)
  { match: { keywords: ['anime', 'studio ghibli', 'coming of age', 'nature', 'magic', 'spirit', 'forest', 'flying'], genres: ['Animación', 'Animation'] }, meta: 'animated-art' },
  // Racing / motorsport
  { match: { keywords: ['car race', 'racing', 'formula one (f1)', 'motorsport', 'car racing', 'race car driver', 'nascar', 'rally'], genres: [] }, meta: 'racing' },
  // Biopic / true story
  { match: { keywords: ['biography', 'based on true story', 'biopic', 'true story', 'historical figure', 'real person'], genres: ['Biografía', 'Biography'] }, meta: 'biopic' },
  // Superhero
  { match: { keywords: ['superhero', 'superpower', 'marvel', 'dc comics', 'comic book', 'super villain', 'cape', 'secret identity'], genres: [] }, meta: 'superhero' },
  // Horror atmospheric
  { match: { keywords: ['haunted house', 'ghost', 'paranormal', 'demon', 'possession', 'exorcism', 'curse', 'supernatural', 'witch', 'occult'], genres: ['Terror', 'Horror'] }, meta: 'horror-atmospheric' },
  // Musical / performance
  { match: { keywords: ['music', 'musician', 'singer', 'band', 'concert', 'rock', 'jazz', 'piano', 'orchestra', 'song'], genres: ['Música', 'Music', 'Musical'] }, meta: 'musical-performance' },
]

async function main() {
  console.log('Fetching all enrichment...')
  const all = []
  let offset = 0
  while (true) {
    const { data } = await supabase.from('enriquecimiento').select('pelicula_id, keywords, generos').range(offset, offset + 999)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  console.log(`Loaded ${all.length} enrichments`)

  let updated = 0
  for (const enr of all) {
    const kws = (enr.keywords || []).map(k => k.toLowerCase())
    const genres = enr.generos || []
    const metas = new Set()

    for (const rule of META_RULES) {
      // Check if any keyword matches
      const kwMatch = rule.match.keywords.some(k => kws.includes(k))
      // Check if any genre matches (if genres specified in rule)
      const genreMatch = rule.match.genres.length === 0 || rule.match.genres.some(g => genres.includes(g))

      if (kwMatch && genreMatch) {
        metas.add(rule.meta)
      }
    }

    if (metas.size > 0) {
      // Merge with existing keywords (don't duplicate)
      const existingKws = new Set(enr.keywords || [])
      const newKws = [...metas].filter(m => !existingKws.has(m))
      if (newKws.length > 0) {
        const merged = [...(enr.keywords || []), ...newKws]
        await supabase.from('enriquecimiento').update({ keywords: merged }).eq('pelicula_id', enr.pelicula_id)
        updated++
      }
    }
  }

  console.log(`Updated ${updated} movies with meta-keywords`)

  // Also do series
  console.log('\nFetching series enrichment...')
  const allS = []
  offset = 0
  while (true) {
    const { data } = await supabase.from('enriquecimiento_series').select('serie_id, keywords, generos').range(offset, offset + 999)
    if (!data || data.length === 0) break
    allS.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  console.log(`Loaded ${allS.length} series enrichments`)

  let updatedS = 0
  for (const enr of allS) {
    const kws = (enr.keywords || []).map(k => k.toLowerCase())
    const genres = enr.generos || []
    const metas = new Set()

    for (const rule of META_RULES) {
      const kwMatch = rule.match.keywords.some(k => kws.includes(k))
      const genreMatch = rule.match.genres.length === 0 || rule.match.genres.some(g => genres.includes(g))
      if (kwMatch && genreMatch) metas.add(rule.meta)
    }

    if (metas.size > 0) {
      const existingKws = new Set(enr.keywords || [])
      const newKws = [...metas].filter(m => !existingKws.has(m))
      if (newKws.length > 0) {
        const merged = [...(enr.keywords || []), ...newKws]
        await supabase.from('enriquecimiento_series').update({ keywords: merged }).eq('serie_id', enr.serie_id)
        updatedS++
      }
    }
  }

  console.log(`Updated ${updatedS} series with meta-keywords`)
}

main().catch(e => { console.error(e); process.exit(1) })

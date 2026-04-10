'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  PageShell,
  PageHeader,
  Section,
  Card,
  Button,
  Pill,
  LoadingState,
  Icon,
} from '@/components/ui'

/* ─── types ─── */
type Movie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  poster_path: string | null
  oscars: string | null
  runtime: number | null
  generos: string[] | null
  director: string | null
  actores: string | null
  sinopsis_chilensis: string | null
  keywords: string | null
  director_oscars: string | null
  actores_oscars: string | null
  compositor: string | null
}

type QuestionEntry = {
  text: string
  answer: boolean
}

type Category = {
  label: string
  questions: { text: string; evaluate: (m: Movie, wp: string[]) => boolean }[]
}

/* ─── helpers ─── */
async function fetchAllPages<T>(
  queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const results: T[] = []
  let from = 0
  while (true) {
    const { data } = await queryFn(from, from + pageSize - 1)
    if (!data || data.length === 0) break
    results.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return results
}

function normalizeGenres(raw: string[] | null): string[] {
  if (!raw) return []
  const MAP: Record<string, string> = {
    Action: 'acción', Adventure: 'aventura', Animation: 'animación',
    Comedy: 'comedia', Crime: 'crimen', Documentary: 'documental',
    Drama: 'drama', Fantasy: 'fantasía', History: 'historia',
    Horror: 'terror', Music: 'música', Mystery: 'misterio',
    Romance: 'romance', 'Science Fiction': 'ciencia ficción', 'Sci-Fi': 'ciencia ficción',
    Thriller: 'thriller', War: 'guerra', Western: 'western',
    Family: 'familia', Biography: 'biografía',
    Acción: 'acción', Aventura: 'aventura', Animación: 'animación',
    Comedia: 'comedia', Crimen: 'crimen', Documental: 'documental',
    Fantasía: 'fantasía', Historia: 'historia', Terror: 'terror',
    Música: 'música', Misterio: 'misterio', 'Ciencia ficción': 'ciencia ficción',
    'Ciencia Ficción': 'ciencia ficción', 'Ciencia Ficcion': 'ciencia ficción',
    Biografía: 'biografía',
  }
  return raw.map(g => (MAP[g] ?? g).toLowerCase())
}

function hasGenre(m: Movie, genre: string): boolean {
  return normalizeGenres(m.generos).includes(genre)
}

function keywordsContain(m: Movie, ...terms: string[]): boolean {
  if (!m.keywords) return false
  const kw = m.keywords.toLowerCase()
  return terms.some(t => kw.includes(t))
}

const PLATFORM_MAP: Record<string, string[]> = {
  netflix: ['netflix'],
  disney_plus: ['disney_plus', 'disney+', 'disney plus'],
  hbo_max: ['hbo_max', 'hbo', 'max'],
  amazon_prime: ['amazon_prime', 'amazon prime', 'prime video'],
  apple_tv: ['apple_tv', 'apple tv', 'apple tv+'],
  paramount_plus: ['paramount_plus', 'paramount+', 'paramount plus'],
}

const FAMOUS_COMPOSERS = [
  'hans zimmer', 'john williams', 'ennio morricone', 'howard shore',
  'james horner', 'danny elfman', 'alexandre desplat', 'thomas newman',
  'michael giacchino', 'ludwigöransson', 'ludwig göransson', 'joe hisaishi',
  'alan silvestri', 'bernard herrmann', 'jerry goldsmith', 'john barry',
  'trent reznor', 'jonny greenwood', 'carter burwell', 'nicholas britell',
  'hildur guðnadóttir', 'hildur gudnadottir', 'ar rahman', 'a.r. rahman',
]

function hasFamousComposer(m: Movie): boolean {
  if (!m.compositor) return false
  const comp = m.compositor.toLowerCase()
  return FAMOUS_COMPOSERS.some(c => comp.includes(c))
}

function oscarsWonCount(oscarsField: string | null): number {
  if (!oscarsField) return 0
  // Try to extract number of oscars won
  const match = oscarsField.match(/won\s+(\d+)/i) || oscarsField.match(/ganó\s+(\d+)/i) || oscarsField.match(/(\d+)\s*oscar/i)
  return match ? parseInt(match[1], 10) : 0
}

function directorWonOscar(dirOscars: string | null): boolean {
  if (!dirOscars) return false
  const lower = dirOscars.toLowerCase()
  return /won/i.test(lower) || /ganó/i.test(lower) || /winner/i.test(lower) || /best director/i.test(lower)
}

function removeAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function freeTextMatch(m: Movie, question: string): boolean {
  const raw = question.toLowerCase().replace(/[¿?¡!.,]/g, '').trim()
  const rawNorm = removeAccents(raw)

  // Helper: normalized lowercase fields
  const kw = removeAccents((m.keywords ?? '').toLowerCase())
  const generos = removeAccents(normalizeGenres(m.generos).join(' '))
  const titulo = removeAccents(m.titulo.toLowerCase())
  const tituloEng = removeAccents((m.titulo_ingles ?? '').toLowerCase())
  const director = removeAccents((m.director ?? '').toLowerCase())
  const actores = removeAccents((m.actores ?? '').toLowerCase())
  const sinopsis = removeAccents((m.sinopsis_chilensis ?? '').toLowerCase())
  const compositor = removeAccents((m.compositor ?? '').toLowerCase())
  const anio = m.anio ?? 0

  // ── Pattern: anime / animé ──
  if (/\banim[eé]\b/.test(raw)) {
    return generos.includes('animacion') || kw.includes('anime') || kw.includes('manga') ||
      titulo.includes('anime') || tituloEng.includes('anime')
  }

  // ── Pattern: musical ──
  if (/\bmusical\b/.test(rawNorm)) {
    return generos.includes('musica') || generos.includes('musical') || kw.includes('musical')
  }

  // ── Pattern: superhéroe / superhero ──
  if (/\bsuperh[eé]ro[ei]?\b/.test(raw) || /\bsuperhero\b/.test(rawNorm)) {
    return kw.includes('superhero') || kw.includes('marvel') || kw.includes('dc-comics') || kw.includes('dc comics')
  }

  // ── Pattern: basada en libro / novela ──
  if (/basada en (un )?libro/.test(raw) || /\bnovela\b/.test(rawNorm)) {
    return kw.includes('based-on-novel') || kw.includes('based-on-book') || kw.includes('novel') || kw.includes('book')
  }

  // ── Pattern: remake ──
  if (/\bremake\b/.test(rawNorm)) {
    return kw.includes('remake') || kw.includes('reboot')
  }

  // ── Pattern: disney / pixar ──
  if (/\bdisney\b/.test(rawNorm)) {
    return kw.includes('disney') || titulo.includes('disney') || tituloEng.includes('disney')
  }
  if (/\bpixar\b/.test(rawNorm)) {
    return kw.includes('pixar') || titulo.includes('pixar') || tituloEng.includes('pixar')
  }

  // ── Pattern: marvel / dc ──
  if (/\bmarvel\b/.test(rawNorm)) {
    return kw.includes('marvel') || kw.includes('mcu')
  }
  if (/\b(dc|dc comics)\b/.test(rawNorm)) {
    return kw.includes('dc-comics') || kw.includes('dc comics') || kw.includes('dceu')
  }

  // ── Pattern: guerra / war ──
  if (/\bguerra\b/.test(rawNorm) || /\bwar\b/.test(rawNorm)) {
    return generos.includes('guerra') || kw.includes('war') || kw.includes('world-war')
  }

  // ── Pattern: robot / inteligencia artificial ──
  if (/\brobot\b/.test(rawNorm) || /inteligencia artificial/.test(rawNorm) || /\bai\b/.test(rawNorm)) {
    return kw.includes('robot') || kw.includes('artificial-intelligence') || kw.includes('artificial intelligence') || kw.includes('android')
  }

  // ── Pattern: sequel / secuela ──
  if (/\bsecuela\b/.test(rawNorm) || /\bsequel\b/.test(rawNorm) || /\bprequel\b/.test(rawNorm) || /\bprecuela\b/.test(rawNorm)) {
    return kw.includes('sequel') || kw.includes('prequel') || kw.includes('franchise')
  }

  // ── Pattern: country / language ("es japonesa", "es americana", "es en español") ──
  const countryPatterns: [RegExp, string[]][] = [
    [/japone?s[ae]?|japon/, ['japan', 'japanese']],
    [/american[ao]?|estados unidos|eeuu/, ['american', 'usa', 'united-states', 'hollywood']],
    [/mexican[ao]?|mexico/, ['mexico', 'mexican']],
    [/argentin[ao]?|argentina/, ['argentina', 'argentine']],
    [/chilen[ao]?|chile/, ['chile', 'chilean']],
    [/coreana?|corea/, ['korea', 'korean', 'south-korea']],
    [/francesa?|francia/, ['france', 'french']],
    [/italian[ao]?|italia/, ['italy', 'italian']],
    [/aleman[ae]?|alemania/, ['germany', 'german']],
    [/brit[aá]nic[ao]?|inglesa?|reino unido|inglaterra/, ['british', 'uk', 'england', 'english']],
    [/espan[oñ]ol[ae]?|espana/, ['spain', 'spanish']],
    [/en espanol|en castellano/, ['spanish']],
    [/en ingles/, ['english', 'american', 'british']],
    [/india|hindu|bollywood/, ['india', 'hindi', 'bollywood']],
  ]
  for (const [regex, terms] of countryPatterns) {
    if (regex.test(rawNorm)) {
      return terms.some(t => kw.includes(t) || director.includes(t) || actores.includes(t))
    }
  }

  // ── Pattern: actor / director ("es de Spielberg", "sale Tom Hanks") ──
  const personMatch = rawNorm.match(/(?:es de|dirigio|dirige|dirigida por|director[ae]?)\s+(.+)/)
    || rawNorm.match(/(?:sale|actua|aparece|protagoniza|protagonizada por|con)\s+(.+)/)
  if (personMatch) {
    const name = removeAccents(personMatch[1].trim())
    return director.includes(name) || actores.includes(name)
  }

  // ── Pattern: decade / time period ("es de los 90", "es antigua", "es reciente") ──
  const decadeMatch = rawNorm.match(/(?:de )?los (\d{2})s?/)
  if (decadeMatch) {
    const dec = parseInt(decadeMatch[1], 10)
    const fullDec = dec < 30 ? 2000 + dec : 1900 + dec
    return anio >= fullDec && anio < fullDec + 10
  }
  if (/\bantigua\b|\bvieja\b|\bclasic[ao]\b/.test(rawNorm)) {
    return anio > 0 && anio < 1980
  }
  if (/\breciente\b|\bnueva\b|\bmodern[ao]?\b/.test(rawNorm)) {
    return anio >= 2015
  }

  // ── Fallback: word-level matching (ignore stopwords) ──
  const STOPWORDS = new Set([
    'es', 'la', 'el', 'una', 'un', 'tiene', 'hay', 'fue', 'son', 'las', 'los',
    'de', 'del', 'en', 'con', 'por', 'que', 'como', 'esta', 'esto', 'esa', 'ese',
    'se', 'si', 'no', 'al', 'lo', 'le', 'su', 'mas', 'muy', 'ser', 'era', 'han',
    'sobre', 'una', 'uno', 'dos', 'tres', 'para',
  ])
  const words = rawNorm.split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w))
  if (words.length === 0) return false

  const haystack = [titulo, tituloEng, director, actores, compositor, sinopsis, kw, generos].join(' ')
  return words.some(word => haystack.includes(word))
}

function hasOscar(oscarsField: string | null): boolean {
  if (!oscarsField) return false
  const lower = oscarsField.toLowerCase()
  // Look for "won X" or a number before "oscar"
  return /won\s+\d/i.test(lower) || /ganó/i.test(lower) || /\bwinner\b/i.test(lower) || /\d+\s*oscar/i.test(lower)
}

function wasNominated(oscarsField: string | null): boolean {
  if (!oscarsField) return false
  const lower = oscarsField.toLowerCase()
  return lower.includes('nomin') || lower.includes('oscar') || /won/i.test(lower)
}

/* ─── question categories ─── */
const CATEGORIES: Category[] = [
  {
    label: 'Época',
    questions: [
      { text: '¿Es de antes de 1970?', evaluate: (m) => (m.anio ?? 2000) < 1970 },
      { text: '¿Es de los 70s?', evaluate: (m) => (m.anio ?? 0) >= 1970 && (m.anio ?? 0) < 1980 },
      { text: '¿Es de los 80s?', evaluate: (m) => (m.anio ?? 0) >= 1980 && (m.anio ?? 0) < 1990 },
      { text: '¿Es de los 90s?', evaluate: (m) => (m.anio ?? 0) >= 1990 && (m.anio ?? 0) < 2000 },
      { text: '¿Es de antes del 2000?', evaluate: (m) => (m.anio ?? 2000) < 2000 },
      { text: '¿Es de los 2010s?', evaluate: (m) => (m.anio ?? 0) >= 2010 && (m.anio ?? 0) < 2020 },
      { text: '¿Es de los 2020s?', evaluate: (m) => (m.anio ?? 0) >= 2020 },
    ],
  },
  {
    label: 'Género',
    questions: [
      { text: '¿Es de acción?', evaluate: (m) => hasGenre(m, 'acción') },
      { text: '¿Es comedia?', evaluate: (m) => hasGenre(m, 'comedia') },
      { text: '¿Es drama?', evaluate: (m) => hasGenre(m, 'drama') },
      { text: '¿Es terror?', evaluate: (m) => hasGenre(m, 'terror') },
      { text: '¿Es ciencia ficción?', evaluate: (m) => hasGenre(m, 'ciencia ficción') },
      { text: '¿Es animación?', evaluate: (m) => hasGenre(m, 'animación') },
      { text: '¿Es western?', evaluate: (m) => hasGenre(m, 'western') },
      { text: '¿Es musical?', evaluate: (m) => hasGenre(m, 'música') },
      { text: '¿Es documental?', evaluate: (m) => hasGenre(m, 'documental') },
      { text: '¿Es thriller?', evaluate: (m) => hasGenre(m, 'thriller') },
      { text: '¿Es de guerra?', evaluate: (m) => hasGenre(m, 'guerra') },
      { text: '¿Es misterio?', evaluate: (m) => hasGenre(m, 'misterio') },
      { text: '¿Es aventura?', evaluate: (m) => hasGenre(m, 'aventura') },
      { text: '¿Es biografía?', evaluate: (m) => hasGenre(m, 'biografía') },
    ],
  },
  {
    label: 'Premios',
    questions: [
      { text: '¿Ganó un Oscar?', evaluate: (m) => hasOscar(m.oscars) },
      { text: '¿Fue nominada al Oscar?', evaluate: (m) => wasNominated(m.oscars) },
      { text: '¿Ganó más de 3 Oscars?', evaluate: (m) => oscarsWonCount(m.oscars) > 3 },
      { text: '¿El director ganó Oscar de dirección?', evaluate: (m) => directorWonOscar(m.director_oscars) },
    ],
  },
  {
    label: 'Equipo',
    questions: [
      {
        text: '¿El director es famoso?',
        evaluate: (m) => !!m.director_oscars || !!m.director,
      },
      {
        text: '¿Tiene actores ganadores de Oscar?',
        evaluate: (m) => !!m.actores_oscars && m.actores_oscars.trim().length > 0,
      },
      {
        text: '¿El director es mujer?',
        evaluate: (m) => {
          if (!m.director) return false
          const d = m.director.toLowerCase()
          const femaleDirectors = [
            'greta gerwig', 'kathryn bigelow', 'chloe zhao', 'chloé zhao', 'sofia coppola',
            'patty jenkins', 'ava duvernay', 'jane campion', 'sarah polley', 'emerald fennell',
            'dee rees', 'lulu wang', 'olivia wilde', 'marielle heller', 'celine sciamma',
            'céline sciamma', 'lynne ramsay', 'kelly reichardt', 'denis villeneuve',
            'andrea arnold', 'mimi leder', 'nora ephron', 'penny marshall',
            'justine triet', 'coralie fargeat', 'payal kapadia',
          ]
          return femaleDirectors.some(f => d.includes(f))
        },
      },
      {
        text: '¿Tiene elenco principalmente femenino?',
        evaluate: (m) => keywordsContain(m, 'female protagonist', 'woman', 'women', 'female lead', 'girl', 'heroine', 'protagonista femenina'),
      },
      {
        text: '¿El compositor es famoso?',
        evaluate: (m) => hasFamousComposer(m),
      },
    ],
  },
  {
    label: 'Plataforma',
    questions: [
      {
        text: '¿Está en Netflix?',
        evaluate: (_m, wp) => Array.isArray(wp) && wp.length > 0 && wp.some(p => PLATFORM_MAP.netflix.includes(p.toLowerCase())),
      },
      {
        text: '¿Está en Disney+?',
        evaluate: (_m, wp) => Array.isArray(wp) && wp.length > 0 && wp.some(p => PLATFORM_MAP.disney_plus.includes(p.toLowerCase())),
      },
      {
        text: '¿Está en HBO?',
        evaluate: (_m, wp) => Array.isArray(wp) && wp.length > 0 && wp.some(p => PLATFORM_MAP.hbo_max.includes(p.toLowerCase())),
      },
      {
        text: '¿Está en Amazon Prime?',
        evaluate: (_m, wp) => Array.isArray(wp) && wp.length > 0 && wp.some(p => PLATFORM_MAP.amazon_prime.includes(p.toLowerCase())),
      },
      {
        text: '¿Está en Apple TV+?',
        evaluate: (_m, wp) => Array.isArray(wp) && wp.length > 0 && wp.some(p => PLATFORM_MAP.apple_tv.includes(p.toLowerCase())),
      },
      {
        text: '¿Está en Paramount+?',
        evaluate: (_m, wp) => Array.isArray(wp) && wp.length > 0 && wp.some(p => PLATFORM_MAP.paramount_plus.includes(p.toLowerCase())),
      },
    ],
  },
  {
    label: 'Rating',
    questions: [
      { text: '¿Tiene menos de 7 en IMDB?', evaluate: (m) => (m.nota_imdb ?? 0) < 7 },
      { text: '¿Está entre 7 y 8?', evaluate: (m) => (m.nota_imdb ?? 0) >= 7 && (m.nota_imdb ?? 0) <= 8 },
      { text: '¿Tiene más de 8 en IMDB?', evaluate: (m) => (m.nota_imdb ?? 0) > 8 },
      { text: '¿Tiene más de 9 en IMDB?', evaluate: (m) => (m.nota_imdb ?? 0) > 9 },
    ],
  },
  {
    label: 'Características',
    questions: [
      { text: '¿Dura más de 2 horas?', evaluate: (m) => (m.runtime ?? 0) > 120 },
      {
        text: '¿Es basada en un libro?',
        evaluate: (m) => keywordsContain(m, 'based-on-novel', 'based on novel', 'book adaptation', 'novel', 'literary', 'libro', 'novela'),
      },
      {
        text: '¿Tiene secuela?',
        evaluate: (m) => keywordsContain(m, 'sequel', 'secuela', 'franchise', 'saga'),
      },
      {
        text: '¿Es remake?',
        evaluate: (m) => keywordsContain(m, 'remake', 'reboot'),
      },
      {
        text: '¿Es en inglés?',
        evaluate: (m) => {
          // If title_ingles exists and matches titulo, likely English
          // Also check keywords for English-language indicators
          if (!m.titulo_ingles) return false
          const eng = m.titulo_ingles.toLowerCase()
          const esp = m.titulo.toLowerCase()
          // If titles are the same, likely English original
          return eng === esp || keywordsContain(m, 'english', 'american', 'british', 'hollywood')
        },
      },
      {
        text: '¿Es basada en hechos reales?',
        evaluate: (m) => keywordsContain(m, 'based-on-true', 'based on true', 'biography', 'biographical', 'true story', 'real event', 'hechos reales'),
      },
    ],
  },
  {
    label: 'Mood',
    questions: [
      {
        text: "¿Es pa'l domingo de bajón?",
        evaluate: (m) => hasGenre(m, 'drama') && !hasGenre(m, 'acción') && !hasGenre(m, 'terror'),
      },
      {
        text: "¿Es pa' saltar del sillón?",
        evaluate: (m) => hasGenre(m, 'acción') || hasGenre(m, 'terror') || hasGenre(m, 'thriller'),
      },
      {
        text: "¿Es pa' quedar con el cerebro como licuadora?",
        evaluate: (m) => hasGenre(m, 'ciencia ficción') || hasGenre(m, 'misterio') || keywordsContain(m, 'twist', 'mind-bending', 'puzzle', 'psychological', 'nonlinear'),
      },
      {
        text: "¿Es pa' llorar a moco tendido?",
        evaluate: (m) => keywordsContain(m, 'death', 'dying', 'loss', 'grief', 'tragic', 'tearjerker', 'sad', 'emotional') || (hasGenre(m, 'drama') && hasGenre(m, 'romance')),
      },
    ],
  },
]

const MAX_QUESTIONS = 20

/* ─── daily seed helpers ─── */
function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

type DailyState = {
  asked: QuestionEntry[]
  phase: 'asking' | 'guessing' | 'won' | 'lost'
  secretId: string
}

function loadDailyState(today: string): DailyState | null {
  try {
    const raw = localStorage.getItem(`cinebret-quiensoy-${today}`)
    if (!raw) return null
    return JSON.parse(raw) as DailyState
  } catch { return null }
}

function saveDailyState(today: string, state: DailyState): void {
  try {
    localStorage.setItem(`cinebret-quiensoy-${today}`, JSON.stringify(state))
  } catch { /* quota exceeded, ignore */ }
}

/* ─── component ─── */
export default function QuienSoyPage() {
  const [loading, setLoading] = useState(true)
  const [allMovies, setAllMovies] = useState<Movie[]>([])
  const [secret, setSecret] = useState<Movie | null>(null)
  const [secretProviders, setSecretProviders] = useState<string[]>([])
  const [asked, setAsked] = useState<QuestionEntry[]>([])
  const [phase, setPhase] = useState<'asking' | 'guessing' | 'won' | 'lost'>('asking')
  const [guessInput, setGuessInput] = useState('')
  const [suggestions, setSuggestions] = useState<Movie[]>([])
  const [wrongGuess, setWrongGuess] = useState(false)
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const [freeQuestion, setFreeQuestion] = useState('')
  const [isDaily, setIsDaily] = useState(true)
  const [catalogMeta, setCatalogMeta] = useState<Record<string, { difficulty?: string; category?: string | null }> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const freeRef = useRef<HTMLInputElement>(null)

  const remaining = MAX_QUESTIONS - asked.length

  /* ─── load data ─── */
  useEffect(() => {
    let cancelled = false
    async function load() {
      // Fetch curated catalog
      const catalogRes = await fetch('/curated-catalog.json')
      const catalog: { ids: string[]; meta?: Record<string, { difficulty?: string; category?: string | null }> } = await catalogRes.json()
      if (catalog.meta) setCatalogMeta(catalog.meta)
      const curatedSet = new Set(catalog.ids)

      // Fetch good movies with poster
      const peliculas = await fetchAllPages<any>((from, to) =>
        supabase
          .from('peliculas')
          .select('id, titulo, titulo_ingles, anio, nota_imdb, poster_path, oscars, runtime')
          .gte('nota_imdb', 7.5)
          .not('poster_path', 'is', null)
          .range(from, to),
      )
      if (cancelled || peliculas.length === 0) return

      // Fetch enrichment
      const enrData = await fetchAllPages<any>((from, to) =>
        supabase
          .from('enriquecimiento')
          .select('pelicula_id, generos, director, actores, sinopsis_chilensis, keywords, director_oscars, actores_oscars, compositor')
          .range(from, to),
      )
      const enrMap = new Map<string, any>()
      enrData.forEach(e => enrMap.set(e.pelicula_id, e))

      const movies: Movie[] = peliculas.map((p: any) => {
        const enr = enrMap.get(p.id) || {}
        return {
          id: p.id,
          titulo: p.titulo,
          titulo_ingles: p.titulo_ingles,
          anio: p.anio,
          nota_imdb: p.nota_imdb,
          poster_path: p.poster_path,
          oscars: p.oscars,
          runtime: p.runtime ?? null,
          generos: enr.generos ?? null,
          director: enr.director ?? null,
          actores: enr.actores ?? null,
          sinopsis_chilensis: enr.sinopsis_chilensis ?? null,
          keywords: enr.keywords ?? null,
          director_oscars: enr.director_oscars ?? null,
          actores_oscars: enr.actores_oscars ?? null,
          compositor: enr.compositor ?? null,
        }
      })

      if (cancelled) return

      // Filter to curated movies only
      const curatedMovies = movies.filter(m => curatedSet.has(m.id))
      const pool = curatedMovies.length >= 10 ? curatedMovies : movies

      // Daily seed: deterministic movie of the day
      const today = getToday()
      const dailyIdx = hashString('cinebret-quiensoy-' + today) % pool.length
      const dailyMovie = pool[dailyIdx]

      // Check localStorage for existing daily game state
      const saved = loadDailyState(today)

      let picked: Movie
      if (saved && saved.secretId === dailyMovie.id) {
        // Restore the daily game
        picked = dailyMovie
      } else {
        // Fresh daily game
        picked = dailyMovie
      }

      setAllMovies(movies)
      setSecret(picked)
      setIsDaily(true)

      // Restore saved state if available
      if (saved && saved.secretId === dailyMovie.id) {
        setAsked(saved.asked)
        setPhase(saved.phase)
      }

      // Fetch watch providers for the secret movie
      const { data: wpData } = await supabase
        .from('watch_providers')
        .select('platform_key')
        .eq('pelicula_id', picked.id)
        .eq('provider_type', 'flatrate')
        .not('platform_key', 'is', null)

      if (!cancelled) {
        setSecretProviders((wpData || []).map((w: any) => w.platform_key))
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  /* ─── persist daily state ─── */
  useEffect(() => {
    if (!isDaily || !secret) return
    const today = getToday()
    saveDailyState(today, { asked, phase, secretId: secret.id })
  }, [asked, phase, secret, isDaily])

  /* ─── ask a question ─── */
  const askQuestion = useCallback(
    (text: string, evaluate: (m: Movie, wp: string[]) => boolean) => {
      if (!secret || remaining <= 0) return
      // Safety wrapper: always coerce to boolean, never undefined
      let answer: boolean
      try {
        const result = evaluate(secret, secretProviders)
        answer = result === true
      } catch {
        answer = false
      }
      setAsked(prev => [...prev, { text, answer }])
    },
    [secret, secretProviders, remaining],
  )

  /* ─── free text question ─── */
  const askFreeQuestion = useCallback(() => {
    if (!secret || remaining <= 0 || freeQuestion.trim().length < 3) return
    const text = freeQuestion.trim()
    const answer = freeTextMatch(secret, text)
    setAsked(prev => [...prev, { text: `Libre: ${text}`, answer }])
    setFreeQuestion('')
  }, [secret, remaining, freeQuestion])

  /* ─── guess handling ─── */
  const handleGuessChange = (val: string) => {
    setGuessInput(val)
    setWrongGuess(false)
    if (val.length < 2) {
      setSuggestions([])
      return
    }
    const q = val.toLowerCase()
    const matches = allMovies
      .filter(m =>
        m.titulo.toLowerCase().includes(q) ||
        (m.titulo_ingles && m.titulo_ingles.toLowerCase().includes(q)),
      )
      .slice(0, 8)
    setSuggestions(matches)
  }

  const submitGuess = (movieId: string) => {
    if (!secret) return
    setSuggestions([])
    if (movieId === secret.id) {
      setPhase('won')
    } else {
      setWrongGuess(true)
      // A wrong guess costs 1 question
      setAsked(prev => {
        const selected = allMovies.find(m => m.id === movieId)
        const label = selected ? selected.titulo : 'Intento fallido'
        return [...prev, { text: `Adiviné: ${label}`, answer: false }]
      })
      if (asked.length + 1 >= MAX_QUESTIONS) {
        setPhase('lost')
      }
    }
  }

  const giveUp = () => setPhase('lost')

  /* ─── restart (random from curated pool, non-daily) ─── */
  const restart = () => {
    setLoading(true)
    setAsked([])
    setPhase('asking')
    setGuessInput('')
    setSuggestions([])
    setWrongGuess(false)
    setOpenCategory(null)
    setFreeQuestion('')
    setIsDaily(false)

    const picked = allMovies[Math.floor(Math.random() * allMovies.length)]
    setSecret(picked)

    supabase
      .from('watch_providers')
      .select('platform_key')
      .eq('pelicula_id', picked.id)
      .eq('provider_type', 'flatrate')
      .not('platform_key', 'is', null)
      .then(({ data }) => {
        setSecretProviders((data || []).map((w: any) => w.platform_key))
        setLoading(false)
      })
  }

  /* ─── already asked check ─── */
  const isAsked = (text: string) => asked.some(a => a.text === text)

  /* ─── render ─── */
  if (loading) {
    return (
      <PageShell maxWidth="lg">
        <LoadingState text="Pensando en una película..." size="lg" />
      </PageShell>
    )
  }

  return (
    <PageShell maxWidth="lg">
      <PageHeader
        title="¿Quién soy?"
        subtitle={
          <span className="inline-flex items-center gap-2 flex-wrap">
            Estoy pensando en una película. Hazme preguntas de sí o no para descubrir cuál es.
            {isDaily && secret && catalogMeta?.[secret.id]?.difficulty && (
              <Pill variant={catalogMeta[secret.id].difficulty === 'Fácil' ? 'success' : catalogMeta[secret.id].difficulty === 'Difícil' ? 'danger' : 'default'} size="sm">
                {catalogMeta[secret.id].difficulty}
              </Pill>
            )}
          </span>
        }
        icon={<Icon.Sparkles className="w-7 h-7" />}
      />

      {/* ─── WON ─── */}
      {phase === 'won' && secret && (
        <div className="text-center animate-in fade-in duration-500">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-400/15 border border-yellow-400/30 text-yellow-400 mb-4">
            <Icon.Trophy className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-black text-yellow-400 mb-5 tracking-tight">¡Adivinaste!</h2>
          <img
            src={`https://image.tmdb.org/t/p/w342${secret.poster_path}`}
            alt={secret.titulo}
            className="w-48 mx-auto rounded-2xl shadow-2xl shadow-yellow-400/20 mb-5"
          />
          <p className="text-xl font-bold text-white">{secret.titulo}</p>
          {secret.titulo_ingles && secret.titulo_ingles !== secret.titulo && (
            <p className="text-zinc-400 text-sm mt-1">{secret.titulo_ingles}</p>
          )}
          <p className="text-zinc-500 text-sm mt-1">{secret.anio}</p>
          <Card padding="md" className="mt-6 inline-block">
            <p className="text-sm text-zinc-300">
              Usaste <span className="text-yellow-400 font-bold tabular-nums">{asked.length}</span> de {MAX_QUESTIONS} preguntas
            </p>
            {asked.length <= 5 && <p className="text-yellow-400 text-xs mt-1.5 font-semibold">Crack absoluto del cine</p>}
            {asked.length > 5 && asked.length <= 10 && <p className="text-yellow-400/80 text-xs mt-1.5 font-semibold">Bien jugado</p>}
            {asked.length > 10 && asked.length <= 15 && <p className="text-zinc-300 text-xs mt-1.5 font-semibold">Nada mal</p>}
            {asked.length > 15 && <p className="text-zinc-400 text-xs mt-1.5 font-semibold">Justo a tiempo</p>}
          </Card>
          <div className="mt-6 flex justify-center">
            <Button onClick={restart} size="lg" iconLeft={<Icon.Refresh className="w-4 h-4" />}>
              Jugar de nuevo
            </Button>
          </div>
        </div>
      )}

      {/* ─── LOST ─── */}
      {phase === 'lost' && secret && (
        <div className="text-center animate-in fade-in duration-500">
          <h2 className="text-2xl font-black text-white mb-5 tracking-tight">La película era...</h2>
          <img
            src={`https://image.tmdb.org/t/p/w342${secret.poster_path}`}
            alt={secret.titulo}
            className="w-48 mx-auto rounded-2xl shadow-2xl shadow-black/40 mb-5"
          />
          <p className="text-xl font-bold text-white">{secret.titulo}</p>
          {secret.titulo_ingles && secret.titulo_ingles !== secret.titulo && (
            <p className="text-zinc-400 text-sm mt-1">{secret.titulo_ingles}</p>
          )}
          <p className="text-zinc-500 text-sm mt-1">{secret.anio}</p>
          {secret.sinopsis_chilensis && (
            <p className="text-zinc-400 text-sm mt-4 max-w-sm mx-auto leading-relaxed">{secret.sinopsis_chilensis}</p>
          )}
          <div className="mt-6 flex justify-center">
            <Button onClick={restart} size="lg" iconLeft={<Icon.Refresh className="w-4 h-4" />}>
              Jugar de nuevo
            </Button>
          </div>
        </div>
      )}

      {/* ─── ACTIVE GAME ─── */}
      {(phase === 'asking' || phase === 'guessing') && (
        <>
          {/* Questions remaining */}
          <Card padding="md" className="mb-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-zinc-400">
                Te quedan <span className="text-yellow-400 font-bold tabular-nums">{remaining}</span> preguntas
              </span>
              <div className="flex gap-1">
                {Array.from({ length: MAX_QUESTIONS }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full ${
                      i < asked.length ? 'bg-yellow-400' : 'bg-zinc-800'
                    }`}
                  />
                ))}
              </div>
            </div>
          </Card>

          {/* Free text question */}
          {phase === 'asking' && remaining > 0 && (
            <Card padding="md" className="mb-5">
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-3 block">
                Pregunta libre
              </label>
              <div className="flex gap-2">
                <input
                  ref={freeRef}
                  value={freeQuestion}
                  onChange={e => setFreeQuestion(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') askFreeQuestion() }}
                  placeholder="Escribe cualquier pregunta de sí o no..."
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-[16px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-yellow-400/50 transition-colors min-h-[44px]"
                />
                <Button
                  onClick={askFreeQuestion}
                  disabled={freeQuestion.trim().length < 3 || remaining <= 0}
                >
                  Preguntar
                </Button>
              </div>
              <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                Busca coincidencias en título, sinopsis, keywords, género, director, actores y compositor.
              </p>
            </Card>
          )}

          {/* Question categories */}
          {phase === 'asking' && remaining > 0 && (
            <Section label="Categorías">
              <div className="space-y-2">
                {CATEGORIES.map(cat => {
                  const askedCount = cat.questions.filter(q => isAsked(q.text)).length
                  const allAsked = askedCount === cat.questions.length
                  if (allAsked) return null
                  const isOpen = openCategory === cat.label
                  return (
                    <Card key={cat.label} padding="none" className="overflow-hidden">
                      <button
                        onClick={() => setOpenCategory(isOpen ? null : cat.label)}
                        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left cursor-pointer hover:bg-zinc-800/40 transition-colors min-h-[44px]"
                      >
                        <span className="text-sm font-bold text-white flex items-center gap-2">
                          {cat.label}
                          {askedCount > 0 && (
                            <Pill variant="gold" size="sm">
                              {askedCount}/{cat.questions.length}
                            </Pill>
                          )}
                        </span>
                        <Icon.ChevronDown
                          className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-4 flex flex-wrap gap-2 border-t border-zinc-800/60 pt-3">
                          {cat.questions.map(q => {
                            const done = isAsked(q.text)
                            const entry = asked.find(a => a.text === q.text)
                            return (
                              <button
                                key={q.text}
                                disabled={done || remaining <= 0}
                                onClick={() => { if (!done && remaining > 0) askQuestion(q.text, q.evaluate) }}
                                className={`text-xs px-3 py-2 min-h-[44px] rounded-xl transition-colors flex items-center gap-1.5 font-medium ${
                                  done
                                    ? entry?.answer
                                      ? 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/30 cursor-not-allowed'
                                      : 'bg-zinc-800/60 text-zinc-500 border border-zinc-800 cursor-not-allowed line-through'
                                    : 'bg-zinc-800 text-white hover:bg-yellow-400 hover:text-zinc-950 cursor-pointer'
                                }`}
                              >
                                {done && entry && (
                                  <span className="inline-flex items-center">
                                    {entry.answer ? (
                                      <Icon.Check className="w-3 h-3" />
                                    ) : (
                                      <Icon.Close className="w-3 h-3" />
                                    )}
                                  </span>
                                )}
                                {q.text}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            </Section>
          )}

          {/* Switch to guessing / give up */}
          <div className="flex gap-3 mb-6">
            {phase === 'asking' && (
              <>
                <Button
                  onClick={() => { setPhase('guessing'); setTimeout(() => inputRef.current?.focus(), 100) }}
                  size="lg"
                  fullWidth
                  iconLeft={<Icon.Sparkles className="w-4 h-4" />}
                >
                  ¿Ya sabes cuál es?
                </Button>
                <Button onClick={giveUp} variant="ghost" size="lg">
                  Me rindo
                </Button>
              </>
            )}
            {phase === 'guessing' && (
              <Button
                onClick={() => { setPhase('asking'); setGuessInput(''); setSuggestions([]); setWrongGuess(false) }}
                variant="ghost"
                iconLeft={<Icon.ChevronLeft className="w-4 h-4" />}
              >
                Volver a preguntas
              </Button>
            )}
          </div>

          {/* Guess input */}
          {phase === 'guessing' && (
            <Card padding="md" className="mb-6 relative overflow-visible">
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-3 block">
                Escribe el nombre de la película
              </label>
              <div className="relative">
                <Icon.Search
                  aria-hidden="true"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 pointer-events-none"
                />
                <input
                  ref={inputRef}
                  value={guessInput}
                  onChange={e => handleGuessChange(e.target.value)}
                  placeholder="Ej. El Padrino, Inception..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-11 pr-4 py-3 text-[16px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-yellow-400/50 transition-colors min-h-[44px]"
                />
              </div>
              {wrongGuess && (
                <p className="text-yellow-400/80 text-xs mt-3 flex items-center gap-1.5">
                  <Icon.Close className="w-3.5 h-3.5" />
                  No es esa. Intenta de nuevo o sigue preguntando.
                </p>
              )}
              {suggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 top-full mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl max-h-64 overflow-y-auto">
                  {suggestions.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setGuessInput(m.titulo); setSuggestions([]); submitGuess(m.id) }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 text-left transition-colors cursor-pointer min-h-[44px]"
                    >
                      {m.poster_path && (
                        <img
                          src={`https://image.tmdb.org/t/p/w92${m.poster_path}`}
                          alt=""
                          className="w-8 h-12 rounded object-cover flex-shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{m.titulo}</p>
                        {m.titulo_ingles && m.titulo_ingles !== m.titulo && (
                          <p className="text-xs text-zinc-500 truncate">{m.titulo_ingles}</p>
                        )}
                        <p className="text-xs text-zinc-600">{m.anio}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Asked questions log */}
          {asked.length > 0 && (
            <Section label="Preguntas hechas" count={asked.length}>
              <div className="space-y-2">
                {[...asked].reverse().map((q, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm border ${
                      q.answer
                        ? 'bg-yellow-400/10 border-yellow-400/30'
                        : 'bg-zinc-900 border-zinc-800'
                    }`}
                  >
                    <span
                      className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                        q.answer ? 'bg-yellow-400 text-zinc-950' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {q.answer ? (
                        <Icon.Check className="w-3.5 h-3.5" strokeWidth={3} />
                      ) : (
                        <Icon.Close className="w-3.5 h-3.5" strokeWidth={3} />
                      )}
                    </span>
                    <span className="text-zinc-200 min-w-0 flex-1">{q.text}</span>
                    <span className={`shrink-0 text-xs font-bold uppercase tracking-wider ${q.answer ? 'text-yellow-400' : 'text-zinc-500'}`}>
                      {q.answer ? 'Sí' : 'No'}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Out of questions */}
          {remaining <= 0 && phase === 'asking' && (
            <Card padding="lg" className="text-center mt-6">
              <p className="text-zinc-300 text-sm mb-4">
                Se acabaron las preguntas. Es tu última oportunidad.
              </p>
              <Button
                onClick={() => { setPhase('guessing'); setTimeout(() => inputRef.current?.focus(), 100) }}
                size="lg"
                iconLeft={<Icon.Sparkles className="w-4 h-4" />}
              >
                Adivinar ahora
              </Button>
            </Card>
          )}
        </>
      )}
    </PageShell>
  )
}

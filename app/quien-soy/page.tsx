'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Nav from '@/components/Nav'
import { supabase } from '@/lib/supabase'

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

function freeTextMatch(m: Movie, question: string): boolean {
  const q = question.toLowerCase()
    .replace(/[¿?¡!.,]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2) // skip tiny words
  const haystack = [
    m.titulo, m.titulo_ingles, m.director, m.actores,
    m.compositor, m.sinopsis_chilensis, m.keywords,
    ...(m.generos ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return q.some(word => haystack.includes(word))
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
        evaluate: (_m, wp) => wp.some(p => PLATFORM_MAP.netflix.includes(p.toLowerCase())),
      },
      {
        text: '¿Está en Disney+?',
        evaluate: (_m, wp) => wp.some(p => PLATFORM_MAP.disney_plus.includes(p.toLowerCase())),
      },
      {
        text: '¿Está en HBO?',
        evaluate: (_m, wp) => wp.some(p => PLATFORM_MAP.hbo_max.includes(p.toLowerCase())),
      },
      {
        text: '¿Está en Amazon Prime?',
        evaluate: (_m, wp) => wp.some(p => PLATFORM_MAP.amazon_prime.includes(p.toLowerCase())),
      },
      {
        text: '¿Está en Apple TV+?',
        evaluate: (_m, wp) => wp.some(p => PLATFORM_MAP.apple_tv.includes(p.toLowerCase())),
      },
      {
        text: '¿Está en Paramount+?',
        evaluate: (_m, wp) => wp.some(p => PLATFORM_MAP.paramount_plus.includes(p.toLowerCase())),
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
  const inputRef = useRef<HTMLInputElement>(null)
  const freeRef = useRef<HTMLInputElement>(null)

  const remaining = MAX_QUESTIONS - asked.length

  /* ─── load data ─── */
  useEffect(() => {
    let cancelled = false
    async function load() {
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

      // Pick random secret
      const picked = movies[Math.floor(Math.random() * movies.length)]
      setAllMovies(movies)
      setSecret(picked)

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

  /* ─── ask a question ─── */
  const askQuestion = useCallback(
    (text: string, evaluate: (m: Movie, wp: string[]) => boolean) => {
      if (!secret || remaining <= 0) return
      const answer = evaluate(secret, secretProviders)
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

  /* ─── restart ─── */
  const restart = () => {
    setLoading(true)
    setAsked([])
    setPhase('asking')
    setGuessInput('')
    setSuggestions([])
    setWrongGuess(false)
    setOpenCategory(null)
    setFreeQuestion('')

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
      <div className="min-h-screen bg-zinc-950 text-white">
        <Nav active="inicio" />
        <div className="flex flex-col items-center justify-center pt-32 gap-4">
          <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Pensando en una película...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24">
      <Nav active="inicio" />

      <div className="max-w-lg mx-auto px-4 pt-6">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-yellow-400 mb-1">¿Quién soy?</h1>
          <p className="text-zinc-400 text-sm">
            Estoy pensando en una película... Hacé preguntas para adivinar cuál es.
          </p>
        </div>

        {/* ─── WON ─── */}
        {phase === 'won' && secret && (
          <div className="text-center animate-in fade-in duration-500">
            <div className="text-4xl mb-2">&#127881;</div>
            <h2 className="text-2xl font-bold text-yellow-400 mb-4">¡Adivinaste!</h2>
            <img
              src={`https://image.tmdb.org/t/p/w342${secret.poster_path}`}
              alt={secret.titulo}
              className="w-48 mx-auto rounded-xl shadow-lg shadow-yellow-400/20 mb-4"
            />
            <p className="text-lg font-semibold">{secret.titulo}</p>
            {secret.titulo_ingles && secret.titulo_ingles !== secret.titulo && (
              <p className="text-zinc-400 text-sm">{secret.titulo_ingles}</p>
            )}
            <p className="text-zinc-500 text-sm mt-1">{secret.anio}</p>
            <div className="mt-4 bg-zinc-900 rounded-xl p-4 inline-block">
              <p className="text-sm text-zinc-300">
                Usaste <span className="text-yellow-400 font-bold">{asked.length}</span> de {MAX_QUESTIONS} preguntas
              </p>
              {asked.length <= 5 && <p className="text-yellow-400 text-xs mt-1">Eres un crack del cine</p>}
              {asked.length > 5 && asked.length <= 10 && <p className="text-green-400 text-xs mt-1">Bien jugado</p>}
              {asked.length > 10 && asked.length <= 15 && <p className="text-blue-400 text-xs mt-1">Nada mal</p>}
              {asked.length > 15 && <p className="text-zinc-400 text-xs mt-1">Justo a tiempo</p>}
            </div>
            <button
              onClick={restart}
              className="mt-6 block mx-auto bg-yellow-400 text-black font-bold px-6 py-3 rounded-xl hover:bg-yellow-300 transition"
            >
              Jugar de nuevo
            </button>
          </div>
        )}

        {/* ─── LOST ─── */}
        {phase === 'lost' && secret && (
          <div className="text-center animate-in fade-in duration-500">
            <h2 className="text-xl font-bold text-red-400 mb-4">La película era...</h2>
            <img
              src={`https://image.tmdb.org/t/p/w342${secret.poster_path}`}
              alt={secret.titulo}
              className="w-48 mx-auto rounded-xl shadow-lg shadow-red-400/20 mb-4"
            />
            <p className="text-lg font-semibold">{secret.titulo}</p>
            {secret.titulo_ingles && secret.titulo_ingles !== secret.titulo && (
              <p className="text-zinc-400 text-sm">{secret.titulo_ingles}</p>
            )}
            <p className="text-zinc-500 text-sm mt-1">{secret.anio}</p>
            {secret.sinopsis_chilensis && (
              <p className="text-zinc-400 text-sm mt-3 max-w-sm mx-auto">{secret.sinopsis_chilensis}</p>
            )}
            <button
              onClick={restart}
              className="mt-6 block mx-auto bg-yellow-400 text-black font-bold px-6 py-3 rounded-xl hover:bg-yellow-300 transition"
            >
              Jugar de nuevo
            </button>
          </div>
        )}

        {/* ─── ACTIVE GAME ─── */}
        {(phase === 'asking' || phase === 'guessing') && (
          <>
            {/* Questions remaining */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-zinc-400">
                Te quedan <span className="text-yellow-400 font-bold">{remaining}</span> preguntas
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

            {/* Free text question */}
            {phase === 'asking' && remaining > 0 && (
              <div className="bg-zinc-900 rounded-xl p-4 mb-4">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">
                  Pregunta libre
                </label>
                <div className="flex gap-2">
                  <input
                    ref={freeRef}
                    value={freeQuestion}
                    onChange={e => setFreeQuestion(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') askFreeQuestion() }}
                    placeholder="Escribe cualquier pregunta de sí/no..."
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-yellow-400 transition"
                  />
                  <button
                    onClick={askFreeQuestion}
                    disabled={freeQuestion.trim().length < 3 || remaining <= 0}
                    className="bg-yellow-400 text-black font-bold px-4 py-2 rounded-lg text-sm hover:bg-yellow-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Preguntar
                  </button>
                </div>
                <p className="text-xs text-zinc-600 mt-1">Busca coincidencias en título, sinopsis, keywords, género, director, actores y compositor.</p>
              </div>
            )}

            {/* Question categories */}
            {phase === 'asking' && remaining > 0 && (
              <div className="space-y-2 mb-6">
                {CATEGORIES.map(cat => {
                  const askedCount = cat.questions.filter(q => isAsked(q.text)).length
                  const allAsked = askedCount === cat.questions.length
                  if (allAsked) return null
                  const isOpen = openCategory === cat.label
                  return (
                    <div key={cat.label} className="bg-zinc-900 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setOpenCategory(isOpen ? null : cat.label)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left"
                      >
                        <span className="text-sm font-semibold text-zinc-200">
                          {cat.label}
                          {askedCount > 0 && (
                            <span className="ml-2 text-xs text-zinc-500">({askedCount}/{cat.questions.length})</span>
                          )}
                        </span>
                        <svg
                          className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3 flex flex-wrap gap-2">
                          {cat.questions.map(q => {
                            const done = isAsked(q.text)
                            const entry = asked.find(a => a.text === q.text)
                            return (
                              <button
                                key={q.text}
                                disabled={done || remaining <= 0}
                                onClick={() => { if (!done && remaining > 0) askQuestion(q.text, q.evaluate) }}
                                className={`text-xs px-3 py-2 rounded-lg transition flex items-center gap-1.5 ${
                                  done
                                    ? entry?.answer
                                      ? 'bg-green-900/40 text-green-400 border border-green-800/40 cursor-not-allowed'
                                      : 'bg-red-900/40 text-red-400 border border-red-800/40 cursor-not-allowed'
                                    : 'bg-zinc-800 text-white hover:bg-yellow-400 hover:text-black active:scale-95'
                                }`}
                              >
                                {done && (
                                  <span className="text-[10px]">{entry?.answer ? 'S' : 'N'}</span>
                                )}
                                {q.text}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Switch to guessing / give up */}
            <div className="flex gap-3 mb-6">
              {phase === 'asking' && (
                <>
                  <button
                    onClick={() => { setPhase('guessing'); setTimeout(() => inputRef.current?.focus(), 100) }}
                    className="flex-1 bg-yellow-400 text-black font-bold py-3 rounded-xl hover:bg-yellow-300 transition text-sm"
                  >
                    ¿Ya sabes cuál es?
                  </button>
                  <button
                    onClick={giveUp}
                    className="px-4 py-3 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition text-sm"
                  >
                    Me rindo
                  </button>
                </>
              )}
              {phase === 'guessing' && (
                <button
                  onClick={() => { setPhase('asking'); setGuessInput(''); setSuggestions([]); setWrongGuess(false) }}
                  className="text-sm text-zinc-400 hover:text-white transition"
                >
                  Volver a preguntas
                </button>
              )}
            </div>

            {/* Guess input */}
            {phase === 'guessing' && (
              <div className="mb-6 relative">
                <label className="text-sm text-zinc-400 mb-2 block">Escribe el nombre de la película:</label>
                <input
                  ref={inputRef}
                  value={guessInput}
                  onChange={e => handleGuessChange(e.target.value)}
                  placeholder="Ej: El Padrino, Inception..."
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-yellow-400 transition"
                />
                {wrongGuess && (
                  <p className="text-red-400 text-xs mt-2">No es esa. Intenta de nuevo o sigue preguntando.</p>
                )}
                {suggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-xl max-h-64 overflow-y-auto">
                    {suggestions.map(m => (
                      <button
                        key={m.id}
                        onClick={() => { setGuessInput(m.titulo); setSuggestions([]); submitGuess(m.id) }}
                        className="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800 text-left transition"
                      >
                        {m.poster_path && (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${m.poster_path}`}
                            alt=""
                            className="w-8 h-12 rounded object-cover flex-shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm text-white truncate">{m.titulo}</p>
                          {m.titulo_ingles && m.titulo_ingles !== m.titulo && (
                            <p className="text-xs text-zinc-500 truncate">{m.titulo_ingles}</p>
                          )}
                          <p className="text-xs text-zinc-600">{m.anio}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Asked questions log */}
            {asked.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Preguntas hechas
                </h3>
                {[...asked].reverse().map((q, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-4 py-2 rounded-xl text-sm ${
                      q.answer ? 'bg-green-950/40 border border-green-800/30' : 'bg-red-950/40 border border-red-800/30'
                    }`}
                  >
                    <span
                      className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        q.answer ? 'bg-green-500 text-black' : 'bg-red-500 text-white'
                      }`}
                    >
                      {q.answer ? 'S' : 'N'}
                    </span>
                    <span className="text-zinc-200">{q.text}</span>
                    <span className={`ml-auto text-xs font-semibold ${q.answer ? 'text-green-400' : 'text-red-400'}`}>
                      {q.answer ? '¡Sí!' : '¡No!'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Out of questions */}
            {remaining <= 0 && phase === 'asking' && (
              <div className="text-center mt-6">
                <p className="text-zinc-400 text-sm mb-3">Se acabaron las preguntas. Es tu última oportunidad.</p>
                <button
                  onClick={() => { setPhase('guessing'); setTimeout(() => inputRef.current?.focus(), 100) }}
                  className="bg-yellow-400 text-black font-bold px-6 py-3 rounded-xl hover:bg-yellow-300 transition"
                >
                  Adivinar ahora
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

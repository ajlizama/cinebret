// Smart search: parses natural language into filters
// First tries keyword matching, then falls back to Claude API

export type SmartFilters = {
  plataformas: string[]
  categorias: string[]
  generos: string[]
  directores: string[]
  actores: string[]
  anioDesde: string
  anioHasta: string
  orden: string
  searchText: string // remaining text for regular search
  keywordSearch: string[] // search in keywords/taglines/sinopsis
  certification: string[] // include these ratings (PG-13, R, etc.)
  excludeCertification: string[] // exclude these ratings
  response: string // conversational response message
  understood: boolean // whether we parsed anything useful
}

const PLATFORM_KEYWORDS: Record<string, string> = {
  'netflix': 'netflix',
  'disney': 'disney_plus',
  'disney+': 'disney_plus',
  'disney plus': 'disney_plus',
  'hbo': 'hbo_max',
  'hbo max': 'hbo_max',
  'prime': 'amazon_prime',
  'prime video': 'amazon_prime',
  'amazon': 'amazon_prime',
  'apple': 'apple_tv',
  'apple tv': 'apple_tv',
  'paramount': 'paramount_plus',
  'paramount+': 'paramount_plus',
  'mubi': 'mubi',
}

const MOOD_KEYWORDS: Record<string, string> = {
  'relax': "Pa'l domingo de bajón",
  'relajar': "Pa'l domingo de bajón",
  'tranquila': "Pa'l domingo de bajón",
  'tranquilo': "Pa'l domingo de bajón",
  'domingo': "Pa'l domingo de bajón",
  'bajón': "Pa'l domingo de bajón",
  'bajon': "Pa'l domingo de bajón",
  'acción': "Pa' saltar del sillón",
  'accion': "Pa' saltar del sillón",
  'adrenalina': "Pa' saltar del sillón",
  'sillón': "Pa' saltar del sillón",
  'sillon': "Pa' saltar del sillón",
  'entretenida': "Pa' saltar del sillón",
  'entretenido': "Pa' saltar del sillón",
  'cerebro': "Pa' quedar con el cerebro como licuadora",
  'licuadora': "Pa' quedar con el cerebro como licuadora",
  'pensar': "Pa' quedar con el cerebro como licuadora",
  'compleja': "Pa' quedar con el cerebro como licuadora",
  'complejo': "Pa' quedar con el cerebro como licuadora",
  'mente': "Pa' quedar con el cerebro como licuadora",
  'llorar': "Pa' llorar a moco tendido",
  'moco': "Pa' llorar a moco tendido",
  'emotiva': "Pa' llorar a moco tendido",
  'emotivo': "Pa' llorar a moco tendido",
  'triste': "Pa' llorar a moco tendido",
  'drama': "Pa' llorar a moco tendido",
}

const GENRE_KEYWORDS: Record<string, string> = {
  'terror': 'Terror',
  'miedo': 'Terror',
  'horror': 'Terror',
  'comedia': 'Comedia',
  'chistosa': 'Comedia',
  'graciosa': 'Comedia',
  'reír': 'Comedia',
  'reir': 'Comedia',
  'divertida': 'Comedia',
  'thriller': 'Thriller',
  'suspenso': 'Thriller',
  'suspense': 'Thriller',
  'aventura': 'Aventura',
  'animación': 'Animación',
  'animacion': 'Animación',
  'animada': 'Animación',
  'romántica': 'Romance',
  'romantica': 'Romance',
  'romance': 'Romance',
  'amor': 'Romance',
  'ciencia ficción': 'Ciencia ficción',
  'ciencia ficcion': 'Ciencia ficción',
  'sci-fi': 'Ciencia ficción',
  'espacial': 'Ciencia ficción',
  'guerra': 'Guerra',
  'bélica': 'Guerra',
  'belica': 'Guerra',
  'crimen': 'Crimen',
  'criminal': 'Crimen',
  'mafia': 'Crimen',
  'documental': 'Documental',
  'western': 'Western',
  'fantasía': 'Fantasía',
  'fantasia': 'Fantasía',
  'familia': 'Familia',
  'niños': 'Familia',
  'ninos': 'Familia',
  'infantil': 'Familia',
}

const SORT_KEYWORDS: Record<string, string> = {
  'mejor': 'imdb',
  'mejores': 'imdb',
  'nota': 'imdb',
  'rating': 'imdb',
  'taquillera': 'boxoffice',
  'taquilla': 'boxoffice',
  'reciente': 'anio_desc',
  'nueva': 'anio_desc',
  'nuevas': 'anio_desc',
  'clásica': 'anio_asc',
  'clasica': 'anio_asc',
  'antigua': 'anio_asc',
}

export function parseSmartSearch(query: string): SmartFilters {
  const result: SmartFilters = {
    plataformas: [],
    categorias: [],
    generos: [],
    directores: [],
    actores: [],
    anioDesde: '',
    anioHasta: '',
    orden: '',
    searchText: '',
    keywordSearch: [],
    certification: [],
    excludeCertification: [],
    response: '',
    understood: false,
  }

  const lower = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const original = query.toLowerCase()

  // Platforms
  for (const [kw, id] of Object.entries(PLATFORM_KEYWORDS)) {
    if (original.includes(kw) && !result.plataformas.includes(id)) {
      result.plataformas.push(id)
      result.understood = true
    }
  }

  // Moods
  for (const [kw, mood] of Object.entries(MOOD_KEYWORDS)) {
    const kwNorm = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (lower.includes(kwNorm) && !result.categorias.includes(mood)) {
      result.categorias.push(mood)
      result.understood = true
    }
  }

  // Genres
  for (const [kw, genre] of Object.entries(GENRE_KEYWORDS)) {
    const kwNorm = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (lower.includes(kwNorm) && !result.generos.includes(genre)) {
      result.generos.push(genre)
      result.understood = true
    }
  }

  // Sort
  for (const [kw, sort] of Object.entries(SORT_KEYWORDS)) {
    const kwNorm = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (lower.includes(kwNorm)) {
      result.orden = sort
      result.understood = true
    }
  }

  // Year patterns: "de los 80", "años 90", "2020", "recientes"
  const yearMatch = original.match(/(?:de los |años? )(\d{2})(?:s)?/)
  if (yearMatch) {
    const decade = parseInt(yearMatch[1])
    const base = decade < 30 ? 2000 + decade : 1900 + decade
    result.anioDesde = String(base)
    result.anioHasta = String(base + 9)
    result.understood = true
  }
  const exactYear = original.match(/\b(19\d{2}|20[0-2]\d)\b/)
  if (exactYear) {
    result.anioDesde = exactYear[1]
    result.anioHasta = exactYear[1]
    result.understood = true
  }

  // Generate local response
  if (result.understood) {
    const parts: string[] = []
    if (result.generos.length) parts.push(result.generos.join(' y '))
    if (result.plataformas.length) {
      const platNames: Record<string, string> = { netflix: 'Netflix', disney_plus: 'Disney+', hbo_max: 'HBO', amazon_prime: 'Prime', apple_tv: 'Apple TV+', paramount_plus: 'Paramount+', mubi: 'MUBI', crunchyroll: 'Crunchyroll' }
      parts.push(result.plataformas.map(p => platNames[p] ?? p).join(' y '))
    }
    if (result.categorias.length) parts.push('modo relax')
    const responses = [
      `Aquí van tus ${parts.join(' en ')} — a disfrutar 🎬`,
      `${parts.join(', ')} — buena elección, cinéfilo 🍿`,
      `Listo, filtrado por ${parts.join(' + ')} — que la pases bien`,
    ]
    result.response = responses[Math.floor(Math.random() * responses.length)]
  }

  return result
}

// Claude API fallback for complex queries
export async function aiParseSearch(query: string): Promise<SmartFilters | null> {
  try {
    const res = await fetch('/api/smart-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

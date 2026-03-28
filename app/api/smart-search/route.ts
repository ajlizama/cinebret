import { NextRequest, NextResponse } from 'next/server'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

const SYSTEM_PROMPT = `Eres un asistente de CineBret, una plataforma chilena de películas.
El usuario escribe una búsqueda en lenguaje natural y tu debes extraer filtros.

Plataformas disponibles: netflix, disney_plus, hbo_max, amazon_prime, apple_tv, paramount_plus, mubi
Categorías/moods: "Pa'l domingo de bajón", "Pa' saltar del sillón", "Pa' quedar con el cerebro como licuadora", "Pa' llorar a moco tendido"
Géneros: Drama, Comedia, Acción, Thriller, Terror, Aventura, Animación, Romance, Ciencia ficción, Crimen, Fantasía, Guerra, Familia, Misterio, Documental, Western, Biografía, Música, Deporte
Órdenes: imdb, rt, metacritic, boxoffice, anio_desc, anio_asc, titulo

Responde SOLO con JSON válido, sin texto adicional:
{
  "plataformas": [],
  "categorias": [],
  "generos": [],
  "directores": [],
  "actores": [],
  "anioDesde": "",
  "anioHasta": "",
  "orden": "",
  "searchText": "",
  "keywordSearch": [],
  "response": "",
  "understood": true
}

- searchText: si el usuario menciona un título específico para buscar, ponlo aquí
- keywordSearch: palabras clave temáticas para buscar en tags de películas (ej. "prison", "time travel", "based on true story", "dream", "heist"). Si el usuario pide "algo parecido a X", piensa en las temáticas de X y ponlas aquí. Si pide "películas sobre viajes en el tiempo", pon ["time travel"]. Usa inglés para los keywords.
- response: una frase corta, amigable y con personalidad (máximo 20 palabras) respondiendo al usuario. Usa humor chileno sutil. Menciona algún dato relevante (director, actor, género, compositor). Ejemplos: "Aquí van tus thrillers — si te gusta Nolan, esto te va a volar la cabeza", "Terror en Netflix, uff... prepárate para no dormir", "Las mejores de los 90, pura nostalgia cinéfila". Varía el estilo, no repitas fórmulas.
- Si no entiendes nada, pon understood: false
- Se breve y preciso`

export async function POST(req: NextRequest) {
  if (!ANTHROPIC_KEY) {
    return NextResponse.json({ understood: false }, { status: 200 })
  }

  try {
    const { query } = await req.json()
    if (!query || typeof query !== 'string' || query.length > 500) {
      return NextResponse.json({ understood: false })
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: query }],
      }),
    })

    if (!res.ok) {
      return NextResponse.json({ understood: false })
    }

    const data = await res.json()
    const text = data.content?.[0]?.text ?? ''

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ understood: false })

    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ understood: false })
  }
}

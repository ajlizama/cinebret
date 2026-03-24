import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY!

export const supabase = createBrowserClient(supabaseUrl, supabaseKey)

export type Pelicula = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  oscars: string | null
  categoria: string | null
  enriquecimiento: {
    director: string | null
    actores: string | null
    generos: string[] | null
    sinopsis_chilensis: string | null
    review_autor: string | null
    es_review_autor: boolean
  } | null
  catalogos: {
    plataforma: string
    activo: boolean
  }[]
}
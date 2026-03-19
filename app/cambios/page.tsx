import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import Nav from '@/components/Nav'

export const revalidate = 3600

const PAGE_SIZE = 200

const PLATAFORMAS: Record<string, { nombre: string; color: string; bg: string }> = {
  netflix:        { nombre: 'Netflix',     color: 'text-red-400',    bg: 'bg-red-950/40 border-red-800' },
  disney_plus:    { nombre: 'Disney+',     color: 'text-blue-400',   bg: 'bg-blue-950/40 border-blue-800' },
  hbo_max:        { nombre: 'HBO Max',     color: 'text-purple-400', bg: 'bg-purple-950/40 border-purple-800' },
  amazon_prime:   { nombre: 'Prime',       color: 'text-cyan-400',   bg: 'bg-cyan-950/40 border-cyan-800' },
  apple_tv:       { nombre: 'Apple TV+',   color: 'text-zinc-300',   bg: 'bg-zinc-800/60 border-zinc-600' },
  paramount_plus: { nombre: 'Paramount+',  color: 'text-sky-400',    bg: 'bg-sky-950/40 border-sky-800' },
}

type Cambio = {
  id: string
  plataforma: string
  accion: 'ENTRA' | 'SALE'
  fecha: string
  peliculas: { titulo: string; titulo_ingles: string | null; nota_imdb: number | null } | null
}

async function getCambios(desdeStr: string, page: number): Promise<{ cambios: Cambio[]; total: number }> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const [{ data, count }] = await Promise.all([
    supabase
      .from('cambios')
      .select('id, plataforma, accion, fecha, peliculas(titulo, titulo_ingles, nota_imdb)', { count: 'exact' })
      .gte('fecha', desdeStr)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to),
  ])

  return { cambios: (data as Cambio[]) ?? [], total: count ?? 0 }
}

function formatFecha(fechaStr: string) {
  const [y, m, d] = fechaStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function desdeStr(dias: number) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString().split('T')[0]
}

const PERIODOS = [
  { label: 'Último día', dias: 1 },
  { label: 'Últimos 7 días', dias: 7 },
  { label: 'Últimos 30 días', dias: 30 },
]

export default async function CambiosPage({ searchParams }: { searchParams: Promise<{ dias?: string; page?: string }> }) {
  const { dias: diasParam, page: pageParam } = await searchParams
  const dias = [1, 7, 30].includes(Number(diasParam)) ? Number(diasParam) : 30
  const page = Math.max(0, Number(pageParam) || 0)

  const { cambios, total } = await getCambios(desdeStr(dias), page)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Agrupar por fecha
  const porFecha = new Map<string, Cambio[]>()
  for (const c of cambios) {
    if (!porFecha.has(c.fecha)) porFecha.set(c.fecha, [])
    porFecha.get(c.fecha)!.push(c)
  }
  const fechas = Array.from(porFecha.keys()).sort((a, b) => b.localeCompare(a))

  const totalEntradas = cambios.filter(c => c.accion === 'ENTRA').length
  const totalSalidas = cambios.filter(c => c.accion === 'SALE').length

  const baseUrl = (p: number) => `/cambios?dias=${dias}&page=${p}`

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav active="cambios" />

      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-4">Cambios en catálogo</h1>
          <div className="flex gap-2 mb-4">
            {PERIODOS.map(p => (
              <Link
                key={p.dias}
                href={`/cambios?dias=${p.dias}`}
                className={`border rounded-lg px-4 py-2 text-sm transition-colors ${
                  dias === p.dias
                    ? 'border-yellow-400 bg-yellow-400 text-zinc-950 font-medium'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                {p.label}
              </Link>
            ))}
          </div>
          <p className="text-zinc-500 text-sm">
            {total} cambios totales · {totalEntradas} entradas · {totalSalidas} salidas en esta página
            {totalPages > 1 && ` · Página ${page + 1} de ${totalPages}`}
          </p>
        </div>

        {fechas.length === 0 ? (
          <p className="text-zinc-500 text-sm">Sin cambios registrados en este período.</p>
        ) : (
          <>
            <div className="space-y-10">
              {fechas.map(fecha => {
                const items = porFecha.get(fecha)!
                const entradas = items.filter(c => c.accion === 'ENTRA')
                const salidas = items.filter(c => c.accion === 'SALE')

                return (
                  <div key={fecha}>
                    <div className="flex items-center gap-4 mb-4">
                      <h2 className="text-sm font-semibold text-zinc-300 capitalize">{formatFecha(fecha)}</h2>
                      <div className="flex gap-2 text-xs">
                        {entradas.length > 0 && (
                          <span className="bg-emerald-950/50 border border-emerald-800 text-emerald-400 px-2 py-0.5 rounded-full">
                            +{entradas.length} entran
                          </span>
                        )}
                        {salidas.length > 0 && (
                          <span className="bg-red-950/50 border border-red-800 text-red-400 px-2 py-0.5 rounded-full">
                            −{salidas.length} salen
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      {entradas.length > 0 && (
                        <div className="border border-zinc-800 rounded-xl overflow-hidden">
                          <div className="bg-emerald-950/30 border-b border-zinc-800 px-4 py-2">
                            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Entran al catálogo</span>
                          </div>
                          <div className="divide-y divide-zinc-800/50 overflow-y-auto max-h-[420px]">
                            {entradas.map(c => {
                              const plat = PLATAFORMAS[c.plataforma]
                              const titulo = c.peliculas?.titulo_ingles || c.peliculas?.titulo || '—'
                              return (
                                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                                  <span className="text-emerald-500 text-sm shrink-0">+</span>
                                  <span className="text-sm text-zinc-200 flex-1 truncate">{titulo}</span>
                                  {c.peliculas?.nota_imdb && (
                                    <span className="text-xs text-yellow-400 shrink-0">⭐ {c.peliculas.nota_imdb}</span>
                                  )}
                                  {plat && (
                                    <span className={`text-xs px-2 py-0.5 rounded border shrink-0 ${plat.bg} ${plat.color}`}>
                                      {plat.nombre}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {salidas.length > 0 && (
                        <div className="border border-zinc-800 rounded-xl overflow-hidden">
                          <div className="bg-red-950/30 border-b border-zinc-800 px-4 py-2">
                            <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Salen del catálogo</span>
                          </div>
                          <div className="divide-y divide-zinc-800/50 overflow-y-auto max-h-[420px]">
                            {salidas.map(c => {
                              const plat = PLATAFORMAS[c.plataforma]
                              const titulo = c.peliculas?.titulo_ingles || c.peliculas?.titulo || '—'
                              return (
                                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                                  <span className="text-red-500 text-sm shrink-0">−</span>
                                  <span className="text-sm text-zinc-400 flex-1 truncate">{titulo}</span>
                                  {c.peliculas?.nota_imdb && (
                                    <span className="text-xs text-zinc-500 shrink-0">⭐ {c.peliculas.nota_imdb}</span>
                                  )}
                                  {plat && (
                                    <span className={`text-xs px-2 py-0.5 rounded border shrink-0 ${plat.bg} ${plat.color}`}>
                                      {plat.nombre}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-10 pt-6 border-t border-zinc-800">
                <Link
                  href={baseUrl(page - 1)}
                  className={`border rounded-lg px-5 py-2 text-sm transition-colors ${
                    page === 0
                      ? 'border-zinc-800 text-zinc-700 pointer-events-none'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white'
                  }`}
                >
                  ← Anterior
                </Link>
                <span className="text-sm text-zinc-500">
                  Página {page + 1} de {totalPages}
                </span>
                <Link
                  href={baseUrl(page + 1)}
                  className={`border rounded-lg px-5 py-2 text-sm transition-colors ${
                    page >= totalPages - 1
                      ? 'border-zinc-800 text-zinc-700 pointer-events-none'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white'
                  }`}
                >
                  Siguiente →
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

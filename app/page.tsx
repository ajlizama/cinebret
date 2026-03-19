import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const PLATAFORMAS = [
  { id: 'netflix', nombre: 'Netflix', color: 'bg-red-600' },
  { id: 'disney_plus', nombre: 'Disney+', color: 'bg-blue-700' },
  { id: 'hbo_max', nombre: 'HBO Max', color: 'bg-purple-700' },
  { id: 'amazon_prime', nombre: 'Prime', color: 'bg-cyan-600' },
  { id: 'apple_tv', nombre: 'Apple TV+', color: 'bg-gray-800' },
  { id: 'paramount_plus', nombre: 'Paramount+', color: 'bg-blue-500' },
]

async function getEstadisticas() {
  const { count: totalPeliculas } = await supabase
    .from('peliculas')
    .select('*', { count: 'exact', head: true })

 const hoy = new Date().toISOString().split('T')[0]
  
  async function fetchAllIds(accion: string) {
    const ids = new Set<string>()
    let from = 0
    const pageSize = 1000
    while (true) {
      const { data } = await supabase
        .from('cambios')
        .select('pelicula_id')
        .eq('fecha', hoy)
        .eq('accion', accion)
        .range(from, from + pageSize - 1)
      data?.forEach(c => ids.add(c.pelicula_id))
      if (!data || data.length < pageSize) break
      from += pageSize
    }
    return ids.size
  }

  const [entradasHoy, salidasHoy] = await Promise.all([
    fetchAllIds('ENTRA'),
    fetchAllIds('SALE'),
  ])

  const { count: reviewsAutor } = await supabase
    .from('enriquecimiento')
    .select('*', { count: 'exact', head: true })
    .eq('es_review_autor', true)

  return {
    totalPeliculas: totalPeliculas || 0,
    entradasHoy: entradasHoy || 0,
    salidasHoy: salidasHoy || 0,
    reviewsAutor: reviewsAutor || 0,
  }
}

async function getUltimosCambios() {
  const { data } = await supabase
    .from('cambios')
    .select(`
      *,
      peliculas (titulo, categoria)
    `)
    .eq('fecha', new Date().toISOString().split('T')[0])
    .order('created_at', { ascending: false })
    .limit(10)
  
  return data || []
}

async function getStatsPlataformas() {
  const plataformas = ['netflix', 'disney_plus', 'hbo_max', 'amazon_prime', 'apple_tv', 'paramount_plus']
  const hoy = new Date().toISOString().split('T')[0]
  
  const stats: Record<string, number> = {}
  
  await Promise.all(plataformas.map(async (plat) => {
    const { count } = await supabase
      .from('catalogos')
      .select('*', { count: 'exact', head: true })
      .eq('plataforma', plat)
      .eq('fecha', hoy)
      .eq('activo', true)
    
    stats[plat] = count || 0
  }))
  
  return stats
}

export default async function Home() {
  const [stats, cambios, statsPlataformas] = await Promise.all([
    getEstadisticas(),
    getUltimosCambios(),
    getStatsPlataformas(),
  ])

  const hoy = new Date().toLocaleDateString('es-CL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  return (
    <main className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            CineBret
          </Link>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <Link href="/" className="text-black font-medium">Inicio</Link>
            <Link href="/catalogo" className="hover:text-black transition-colors">Catálogo</Link>
            <Link href="/cambios" className="hover:text-black transition-colors">Cambios</Link>
            <Link href="/estadisticas" className="hover:text-black transition-colors">Estadísticas</Link>
            <a
              href="https://www.instagram.com/cinebret/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-pink-500 transition-colors"
              aria-label="Instagram CineBret"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <circle cx="12" cy="12" r="3.5" />
                <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
              </svg>
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-semibold mb-1">Buenos días 🎬</h1>
          <p className="text-gray-400 text-sm capitalize">{hoy}</p>
        </div>

        {/* Stats rápidas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { label: 'Películas en catálogo', value: stats.totalPeliculas },
          { label: 'Plataformas activas', value: 6 },
            { label: 'Reviews CineBret', value: stats.reviewsAutor },
          ].map((stat) => (
            <div key={stat.label} className="border border-gray-100 rounded-xl p-5">
              <p className="text-2xl font-semibold">{stat.value}</p>
              <p className="text-sm text-gray-400 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Cambios del día */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Cambios de hoy</h2>
            {cambios.length === 0 ? (
              <p className="text-gray-400 text-sm">No hay cambios registrados hoy</p>
            ) : (
              <div className="space-y-2">
                {cambios.map((cambio: any) => (
                  <div key={cambio.id} className="flex items-center gap-3 py-2 border-b border-gray-50">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      cambio.accion === 'ENTRA'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-600'
                    }`}>
                      {cambio.accion === 'ENTRA' ? '+ Entra' : '− Sale'}
                    </span>
                    <span className="text-sm flex-1">{cambio.peliculas?.titulo}</span>
                    <span className="text-xs text-gray-400">
                      {PLATAFORMAS.find(p => p.id === cambio.plataforma)?.nombre}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stats por plataforma */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Catálogo por plataforma</h2>
            <div className="space-y-3">
              {PLATAFORMAS.map(plat => {
                const count = statsPlataformas[plat.id] || 0
                const max = Math.max(...Object.values(statsPlataformas), 1)
                const pct = Math.round((count / max) * 100)
                return (
                  <div key={plat.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{plat.nombre}</span>
                      <span className="text-gray-400">{count} películas</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${plat.color} rounded-full`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
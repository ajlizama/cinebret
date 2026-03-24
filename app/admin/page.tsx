'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, AreaChart, Area,
} from 'recharts'

const ADMIN_ID = 'b5eafe05-9ec8-4b23-b0b4-137148ecbac2'
const REFRESH_INTERVAL = 30_000 // 30 seconds

type Profile = { user_id: string; username: string; created_at: string; avatar_url: string | null }
type DayData = { date: string; nuevos: number; acumulado: number }
type ReviewData = { date: string; reviews: number }
type ActivityData = { date: string; vistas: number; watchlist: number; ratings: number }

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-zinc-900 rounded-xl p-5">
      <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
      {sub && <p className="text-zinc-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [reviewCount, setReviewCount] = useState(0)
  const [reviewsByDay, setReviewsByDay] = useState<ReviewData[]>([])
  const [activityByDay, setActivityByDay] = useState<ActivityData[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchData = useCallback(async () => {
    // Profiles
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('user_id, username, created_at, avatar_url')
      .order('created_at', { ascending: true })
    if (profilesData) setProfiles(profilesData)

    // Reviews count
    const { count } = await supabase
      .from('user_reviews')
      .select('id', { count: 'exact', head: true })
    setReviewCount(count ?? 0)

    // Reviews by day
    const { data: reviewsData } = await supabase
      .from('user_reviews')
      .select('created_at')
      .order('created_at', { ascending: true })
    if (reviewsData) {
      const byDay: Record<string, number> = {}
      reviewsData.forEach(r => {
        if (r.created_at) {
          const day = r.created_at.slice(0, 10)
          byDay[day] = (byDay[day] || 0) + 1
        }
      })
      setReviewsByDay(Object.entries(byDay).map(([date, reviews]) => ({ date, reviews })))
    }

    // User activity by day (vistas, watchlist, ratings)
    const { data: upData } = await supabase
      .from('user_peliculas')
      .select('updated_at, visto, watchlist, rating')
    if (upData) {
      const byDay: Record<string, { vistas: number; watchlist: number; ratings: number }> = {}
      upData.forEach((up: any) => {
        const day = (up.updated_at || '').slice(0, 10)
        if (!day) return
        if (!byDay[day]) byDay[day] = { vistas: 0, watchlist: 0, ratings: 0 }
        if (up.visto) byDay[day].vistas++
        if (up.watchlist) byDay[day].watchlist++
        if (up.rating) byDay[day].ratings++
      })
      setActivityByDay(
        Object.entries(byDay)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, d]) => ({ date, ...d }))
      )
    }

    setLastRefresh(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!user || user.id !== ADMIN_ID) return
    fetchData()
    const interval = setInterval(fetchData, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [user, fetchData])

  if (authLoading) return <main className="min-h-screen bg-zinc-950"><Nav /><p className="text-zinc-500 text-center mt-20">Cargando...</p></main>
  if (!user || user.id !== ADMIN_ID) return <main className="min-h-screen bg-zinc-950"><Nav /><p className="text-zinc-500 text-center mt-20">Acceso denegado</p></main>

  // Build daily registration chart data
  const dailyMap: Record<string, number> = {}
  profiles.forEach(p => {
    const day = p.created_at.slice(0, 10)
    dailyMap[day] = (dailyMap[day] || 0) + 1
  })
  const dailyData: DayData[] = []
  let acum = 0
  Object.keys(dailyMap).sort().forEach(date => {
    acum += dailyMap[date]
    dailyData.push({ date, nuevos: dailyMap[date], acumulado: acum })
  })

  // Recent profiles (last 5)
  const recentProfiles = [...profiles].reverse().slice(0, 5)

  // Today stats
  const today = new Date().toISOString().slice(0, 10)
  const todayCount = dailyMap[today] || 0

  const tooltipStyle = {
    contentStyle: { background: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' },
    labelStyle: { color: '#a1a1aa' },
  }

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-zinc-600 text-xs">
            Auto-refresh cada 30s — última: {lastRefresh.toLocaleTimeString('es-CL')}
          </p>
        </div>

        {loading ? (
          <p className="text-zinc-500">Cargando datos...</p>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              <StatCard label="Perfiles totales" value={profiles.length} />
              <StatCard label="Hoy" value={todayCount} sub="registros nuevos" />
              <StatCard label="Reviews" value={reviewCount} sub="escritas por usuarios" />
              <StatCard
                label="Promedio diario"
                value={(profiles.length / Math.max(Object.keys(dailyMap).length, 1)).toFixed(1)}
                sub="registros/día"
              />
            </div>

            {/* Chart: Registros por día + acumulado */}
            <div className="bg-zinc-900 rounded-xl p-5 mb-6">
              <h2 className="text-white font-semibold mb-4">Registros de perfiles por día</h2>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#71717a', fontSize: 12 }} />
                  <YAxis yAxisId="left" tick={{ fill: '#71717a', fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: '#71717a', fontSize: 12 }} />
                  <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [v, name === 'nuevos' ? 'Nuevos' : 'Acumulado']} labelFormatter={formatDate} />
                  <Legend />
                  <Area yAxisId="right" type="monotone" dataKey="acumulado" stroke="#eab308" fill="rgba(234,179,8,0.15)" name="Acumulado" />
                  <Bar yAxisId="left" dataKey="nuevos" fill="#3b82f6" name="Nuevos por día" radius={[4, 4, 0, 0]} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Chart: Activity (vistas, watchlist, ratings) */}
            {activityByDay.length > 0 && (
              <div className="bg-zinc-900 rounded-xl p-5 mb-6">
                <h2 className="text-white font-semibold mb-4">Actividad de usuarios por día</h2>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={activityByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#71717a', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#71717a', fontSize: 12 }} />
                    <Tooltip {...tooltipStyle} labelFormatter={formatDate} />
                    <Legend />
                    <Bar dataKey="vistas" fill="#22c55e" name="Vistas" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="watchlist" fill="#eab308" name="Watchlist" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="ratings" fill="#a855f7" name="Ratings" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Chart: Reviews por día */}
            {reviewsByDay.length > 0 && (
              <div className="bg-zinc-900 rounded-xl p-5 mb-6">
                <h2 className="text-white font-semibold mb-4">Reviews por día</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={reviewsByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#71717a', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#71717a', fontSize: 12 }} />
                    <Tooltip {...tooltipStyle} labelFormatter={formatDate} />
                    <Line type="monotone" dataKey="reviews" stroke="#f43f5e" strokeWidth={2} dot={{ fill: '#f43f5e', r: 4 }} name="Reviews" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Recent Profiles */}
            <div className="bg-zinc-900 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-4">Últimos registros</h2>
              <div className="space-y-3">
                {recentProfiles.map(p => (
                  <div key={p.user_id} className="flex items-center gap-3">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300">
                        {p.username[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-white text-sm font-medium">{p.username}</p>
                      <p className="text-zinc-500 text-xs">{new Date(p.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

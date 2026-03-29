'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import { useAuth } from '@/context/AuthContext'
import Loading from '@/components/Loading'

type Achievement = {
  id: string
  name: string
  description: string
  icon: string
  unlocked: boolean
  progress: number
  total: number
  tier?: 'bronze' | 'silver' | 'gold' | null
}

type Stats = {
  totalWatched: number
  avgRating: number
  uniqueGenres: number
}

const TIER_COLORS = {
  bronze: { ring: 'ring-amber-700', bg: 'from-amber-950/60 to-amber-900/30', glow: 'shadow-amber-800/40', label: 'Bronce', text: 'text-amber-600' },
  silver: { ring: 'ring-zinc-400', bg: 'from-zinc-700/40 to-zinc-600/20', glow: 'shadow-zinc-400/30', label: 'Plata', text: 'text-zinc-300' },
  gold: { ring: 'ring-yellow-400', bg: 'from-yellow-900/50 to-amber-800/30', glow: 'shadow-yellow-400/40', label: 'Oro', text: 'text-yellow-400' },
}

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const { name, description, icon, unlocked, progress, total, tier } = achievement
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0
  const tierStyle = tier && unlocked ? TIER_COLORS[tier] : null

  return (
    <div
      className={`relative rounded-2xl border p-5 transition-all duration-300 ${
        unlocked
          ? `border-amber-500/40 bg-gradient-to-br ${tierStyle?.bg ?? 'from-amber-950/40 to-zinc-900'} ring-1 ${tierStyle?.ring ?? 'ring-amber-500/30'} shadow-lg ${tierStyle?.glow ?? 'shadow-amber-500/20'} hover:scale-[1.02]`
          : 'border-zinc-800 bg-zinc-900/60 opacity-60 hover:opacity-80'
      }`}
    >
      {/* Tier badge */}
      {tier && unlocked && (
        <div className={`absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
          tier === 'gold' ? 'bg-yellow-400 text-zinc-950'
          : tier === 'silver' ? 'bg-zinc-400 text-zinc-950'
          : 'bg-amber-700 text-amber-100'
        }`}>
          {TIER_COLORS[tier].label}
        </div>
      )}

      {/* Icon */}
      <div className={`text-4xl mb-3 ${unlocked ? '' : 'grayscale'}`}>
        {icon}
      </div>

      {/* Name */}
      <h3 className={`font-bold text-sm mb-1 ${unlocked ? 'text-white' : 'text-zinc-500'}`}>
        {name}
      </h3>

      {/* Description */}
      <p className={`text-xs leading-relaxed mb-3 ${unlocked ? 'text-zinc-400' : 'text-zinc-600'}`}>
        {description}
      </p>

      {/* Progress bar */}
      {total > 1 && (
        <div>
          <div className="flex justify-between mb-1">
            <span className={`text-[10px] font-medium ${unlocked ? 'text-amber-400' : 'text-zinc-600'}`}>
              {progress}/{total}
            </span>
            <span className={`text-[10px] ${unlocked ? 'text-amber-400' : 'text-zinc-600'}`}>
              {pct}%
            </span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                unlocked ? 'bg-gradient-to-r from-amber-500 to-yellow-400' : 'bg-zinc-700'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Boolean achievements */}
      {total === 1 && (
        <div className={`text-xs font-medium ${unlocked ? 'text-amber-400' : 'text-zinc-600'}`}>
          {unlocked ? 'Desbloqueado' : 'Bloqueado'}
        </div>
      )}

      {/* Unlocked glow overlay */}
      {unlocked && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none bg-gradient-to-t from-transparent via-transparent to-amber-400/5" />
      )}
    </div>
  )
}

export default function CineQuestPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!loading && !user) { router.replace('/catalogo'); return }
    if (!user) return

    fetch(`/api/cinequest?userId=${user.id}`)
      .then(r => r.json())
      .then(data => {
        setAchievements(data.achievements ?? [])
        setStats(data.stats ?? null)
        setCargando(false)
      })
      .catch(() => setCargando(false))
  }, [user, loading])

  if (loading || cargando) return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />
      <div className="flex items-center justify-center h-64">
        <Loading text="Cargando logros..." />
      </div>
    </main>
  )

  const unlockedCount = achievements.filter(a => a.unlocked).length
  const totalCount = achievements.length

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-2">
            <span className="bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 bg-clip-text text-transparent">
              CineQuest
            </span>
          </h1>
          <p className="text-zinc-500 text-sm">
            Desafios y logros cinematograficos
          </p>
        </div>

        {/* Stats summary */}
        <div className="flex items-center justify-center gap-6 mb-10 flex-wrap">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3 text-center">
            <p className="text-2xl font-bold text-amber-400">{unlockedCount}</p>
            <p className="text-zinc-500 text-xs">de {totalCount} logros</p>
          </div>
          {stats && (
            <>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3 text-center">
                <p className="text-2xl font-bold text-white">{stats.totalWatched}</p>
                <p className="text-zinc-500 text-xs">peliculas vistas</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3 text-center">
                <p className="text-2xl font-bold text-white">{stats.avgRating || '—'}</p>
                <p className="text-zinc-500 text-xs">rating promedio</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3 text-center">
                <p className="text-2xl font-bold text-white">{stats.uniqueGenres}</p>
                <p className="text-zinc-500 text-xs">generos explorados</p>
              </div>
            </>
          )}
        </div>

        {/* Progress bar overall */}
        <div className="mb-10 max-w-md mx-auto">
          <div className="flex justify-between mb-2">
            <span className="text-xs text-zinc-500">Progreso total</span>
            <span className="text-xs text-amber-400 font-medium">{Math.round((unlockedCount / totalCount) * 100)}%</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-1000"
              style={{ width: `${totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Achievement grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {achievements
            .sort((a, b) => {
              // Unlocked first, then by progress percentage
              if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1
              return (b.progress / b.total) - (a.progress / a.total)
            })
            .map(a => (
              <AchievementCard key={a.id} achievement={a} />
            ))}
        </div>

        {/* Empty state */}
        {achievements.length === 0 && (
          <div className="text-center py-16">
            <p className="text-zinc-500 text-sm">Marca peliculas como vistas para desbloquear logros.</p>
          </div>
        )}
      </div>
    </main>
  )
}

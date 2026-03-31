'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

const PLATAFORMAS = [
  { key: 'netflix', name: 'Netflix', icon: '/netflix.png' },
  { key: 'disney_plus', name: 'Disney+', icon: '/disney_plus.svg' },
  { key: 'hbo_max', name: 'Max', icon: '/hbo_max.png' },
  { key: 'amazon_prime', name: 'Prime Video', icon: '/amazon_prime.png' },
  { key: 'apple_tv', name: 'Apple TV+', icon: '/apple_tv.png' },
  { key: 'paramount_plus', name: 'Paramount+', icon: '/paramount_plus.svg' },
  { key: 'mubi', name: 'MUBI', icon: '/mubi.png' },
  { key: 'crunchyroll', name: 'Crunchyroll', icon: '/crunchyroll.png' },
]

export default function MisPlataformas({
  onUpdate,
  compact = false,
}: {
  onUpdate?: (plataformas: string[]) => void
  compact?: boolean
}) {
  const { user } = useAuth()
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('perfil_preferencias')
      .select('plataformas_usuario')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.plataformas_usuario) {
          setSelected(data.plataformas_usuario)
        }
      })
  }, [user])

  const toggle = async (key: string) => {
    const next = selected.includes(key)
      ? selected.filter((k) => k !== key)
      : [...selected, key]
    setSelected(next)
    onUpdate?.(next)

    if (!user) return
    setSaving(true)
    await supabase.from('perfil_preferencias').upsert(
      { user_id: user.id, plataformas_usuario: next },
      { onConflict: 'user_id' }
    )
    setSaving(false)
  }

  return (
    <div>
      {!compact && (
        <div className="mb-3">
          <h3 className="text-white font-bold text-lg">Mis Plataformas</h3>
          <p className="text-zinc-400 text-sm">Selecciona las que tienes contratadas</p>
        </div>
      )}
      <div className={`flex flex-wrap ${compact ? 'gap-2' : 'gap-3'}`}>
        {PLATAFORMAS.map((p) => {
          const active = selected.includes(p.key)
          return (
            <button
              key={p.key}
              onClick={() => toggle(p.key)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all text-sm font-medium
                ${active
                  ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                  : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-500'
                }
                ${compact ? 'px-2 py-1 text-xs' : ''}
              `}
            >
              <Image
                src={p.icon}
                alt={p.name}
                width={compact ? 16 : 20}
                height={compact ? 16 : 20}
                className="rounded-sm"
              />
              {p.name}
              {active && <span className="text-amber-400">✓</span>}
            </button>
          )
        })}
      </div>
      {saving && <p className="text-zinc-500 text-xs mt-2">Guardando...</p>}
      {!user && !compact && (
        <p className="text-zinc-500 text-xs mt-3">Inicia sesión para guardar tus plataformas</p>
      )}
    </div>
  )
}

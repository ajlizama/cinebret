'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type GuideData = {
  sex_nudity: string
  violence: string
  profanity: string
  alcohol_drugs: string
  frightening: string
  sex_nudity_details: string[]
  violence_details: string[]
  profanity_details: string[]
  alcohol_drugs_details: string[]
  frightening_details: string[]
}

const CATEGORIES = [
  { key: 'sex_nudity', label: 'Sexo y Desnudez', icon: '🔞', detailKey: 'sex_nudity_details' },
  { key: 'violence', label: 'Violencia', icon: '⚔️', detailKey: 'violence_details' },
  { key: 'profanity', label: 'Lenguaje', icon: '🤬', detailKey: 'profanity_details' },
  { key: 'alcohol_drugs', label: 'Alcohol y Drogas', icon: '🍺', detailKey: 'alcohol_drugs_details' },
  { key: 'frightening', label: 'Escenas Intensas', icon: '😱', detailKey: 'frightening_details' },
] as const

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  None: { color: 'text-green-400', bg: 'bg-green-500/10', label: 'Nada' },
  Mild: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Leve' },
  Moderate: { color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Moderado' },
  Severe: { color: 'text-red-400', bg: 'bg-red-500/10', label: 'Fuerte' },
}

export default function ParentGuide({ peliculaId, serieId }: { peliculaId?: string; serieId?: string }) {
  const [data, setData] = useState<GuideData | null>(null)
  const [open, setOpen] = useState(false)
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!peliculaId && !serieId) return
    const col = peliculaId ? 'pelicula_id' : 'serie_id'
    const val = peliculaId || serieId
    supabase
      .from('parent_guide')
      .select('sex_nudity, violence, profanity, alcohol_drugs, frightening, sex_nudity_details, violence_details, profanity_details, alcohol_drugs_details, frightening_details')
      .eq(col, val)
      .maybeSingle()
      .then(({ data: d }) => {
        setData(d as GuideData | null)
        setLoading(false)
      })
  }, [peliculaId, serieId])

  if (loading || !data) return null

  const allNone = CATEGORIES.every(c => (data as any)[c.key] === 'None')
  if (allNone) return null

  // Get the highest severity for the summary
  const severityOrder = ['None', 'Mild', 'Moderate', 'Severe']
  const maxSeverity = CATEGORIES.reduce((max, cat) => {
    const sev = (data as any)[cat.key] as string || 'None'
    return severityOrder.indexOf(sev) > severityOrder.indexOf(max) ? sev : max
  }, 'None')
  const maxConfig = SEVERITY_CONFIG[maxSeverity] || SEVERITY_CONFIG.None

  return (
    <div>
      {/* Collapsed header — tap to expand */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-2 cursor-pointer group"
      >
        <div className="flex items-center gap-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Guía Parental</p>
          {!open && (
            <span className={`text-[10px] font-bold ${maxConfig.color} ${maxConfig.bg} px-2 py-0.5 rounded-full`}>
              {maxConfig.label}
            </span>
          )}
        </div>
        <svg className={`w-4 h-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="space-y-1 mt-1">
          {CATEGORIES.map(cat => {
            const severity = (data as any)[cat.key] as string || 'None'
            const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.None
            const details = ((data as any)[cat.detailKey] as string[]) || []
            const isExpanded = expandedCat === cat.key

            return (
              <div key={cat.key}>
                <button
                  onClick={() => details.length > 0 ? setExpandedCat(isExpanded ? null : cat.key) : null}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer ${config.bg}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{cat.icon}</span>
                    <span className="text-sm text-zinc-300">{cat.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${config.color}`}>{config.label}</span>
                    <div className="flex gap-0.5">
                      {severityOrder.map((level, i) => {
                        const active = severityOrder.indexOf(severity) >= i
                        const barColor = i === 0 ? 'bg-green-500' : i === 1 ? 'bg-yellow-500' : i === 2 ? 'bg-orange-500' : 'bg-red-500'
                        return <div key={level} className={`w-3 h-2 rounded-sm ${active ? barColor : 'bg-zinc-700'}`} />
                      })}
                    </div>
                    {details.length > 0 && (
                      <svg className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </div>
                </button>
                {isExpanded && details.length > 0 && (
                  <div className="mt-1 ml-8 space-y-1 pb-1">
                    {details.map((d, i) => (
                      <p key={i} className="text-xs text-zinc-400 leading-relaxed">• {d}</p>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

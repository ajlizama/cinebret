'use client'

/**
 * Tabs — horizontal tab bar with an animated gold underline powered by
 * framer-motion's shared layout.
 *
 * @example
 *   const [tab, setTab] = useState('pelis')
 *   <Tabs
 *     value={tab}
 *     onChange={setTab}
 *     tabs={[
 *       { key: 'pelis', label: 'Películas', count: 248 },
 *       { key: 'series', label: 'Series', count: 42 },
 *     ]}
 *   />
 */

import { motion } from 'framer-motion'
import { springs } from '@/lib/design/motion'

export type Tab = {
  key: string
  label: string
  count?: number
  icon?: React.ReactNode
}

export type TabsProps = {
  tabs: Tab[]
  value: string
  onChange: (key: string) => void
  className?: string
}

export function Tabs({ tabs, value, onChange, className = '' }: TabsProps) {
  return (
    <div
      role="tablist"
      className={`flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-zinc-800/60 ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === value
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={`relative px-4 py-3 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap min-h-[44px] inline-flex items-center gap-2 ${
              isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.icon ? <span className="shrink-0">{tab.icon}</span> : null}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' ? (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                  isActive ? 'bg-yellow-400/15 text-yellow-400' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {tab.count.toLocaleString('es')}
              </span>
            ) : null}
            {isActive ? (
              <motion.span
                layoutId="tabs-underline"
                transition={springs.snappy}
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-yellow-400"
              />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

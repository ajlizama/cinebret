/**
 * AchievementCard — displays an unlockable achievement with icon, tier
 * border, progress bar and locked/unlocked state.
 *
 * @example
 *   <AchievementCard
 *     achievement={{ id, name: 'Cinéfilo', description: 'Ver 100 películas' }}
 *     unlocked
 *     tier="gold"
 *     progress={{ current: 100, total: 100 }}
 *   />
 */

import { Lock } from './icons'
import { ProgressBar } from './ProgressBar'

type Achievement = {
  id: string
  name: string
  description: string
  icon?: React.ReactNode
}

export type AchievementCardProps = {
  achievement: Achievement
  unlocked: boolean
  tier?: 'bronze' | 'silver' | 'gold'
  progress?: { current: number; total: number }
  className?: string
}

const TIER_RING: Record<NonNullable<AchievementCardProps['tier']>, string> = {
  bronze: 'ring-2 ring-[#92410e]/60',
  silver: 'ring-2 ring-zinc-500/60',
  gold: 'ring-2 ring-yellow-400/70',
}

const TIER_TEXT: Record<NonNullable<AchievementCardProps['tier']>, string> = {
  bronze: 'text-[#d97706]',
  silver: 'text-zinc-300',
  gold: 'text-yellow-400',
}

const TIER_LABEL: Record<NonNullable<AchievementCardProps['tier']>, string> = {
  bronze: 'Bronce',
  silver: 'Plata',
  gold: 'Oro',
}

export function AchievementCard({
  achievement,
  unlocked,
  tier,
  progress,
  className = '',
}: AchievementCardProps) {
  const lockedCls = unlocked ? '' : 'opacity-60'

  return (
    <div
      className={`bg-zinc-900 rounded-2xl p-5 ${
        tier && unlocked ? TIER_RING[tier] : ''
      } ${className}`}
    >
      <div className={`flex flex-col items-center text-center ${lockedCls}`}>
        <div
          className={`w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center mb-3 ${
            unlocked ? '' : 'grayscale'
          } ${tier && unlocked ? TIER_TEXT[tier] : 'text-zinc-400'}`}
        >
          {unlocked ? (
            achievement.icon ?? <Lock className="w-6 h-6" />
          ) : (
            <Lock className="w-6 h-6 text-zinc-600" />
          )}
        </div>
        {tier ? (
          <span
            className={`text-[10px] font-black uppercase tracking-wider mb-1 ${
              unlocked ? TIER_TEXT[tier] : 'text-zinc-600'
            }`}
          >
            {TIER_LABEL[tier]}
          </span>
        ) : null}
        <h3 className="text-sm font-bold text-white">{achievement.name}</h3>
        <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
          {achievement.description}
        </p>
      </div>

      {progress && progress.total > 1 ? (
        <div className="mt-4">
          <ProgressBar
            value={progress.current}
            max={progress.total}
            color={unlocked ? 'gold' : 'gold'}
            size="sm"
            showValue
          />
        </div>
      ) : null}
    </div>
  )
}

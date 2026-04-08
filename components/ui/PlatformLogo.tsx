/**
 * PlatformLogo — streaming platform logo inside a white rounded tile.
 *
 * The tile keeps platform branding consistent across dark backgrounds. Real
 * assets live in `/public/{platform}.png|svg`.
 *
 * @example
 *   <PlatformLogo platform="netflix" size="md" />
 */

import Image from 'next/image'

export type Platform =
  | 'netflix'
  | 'disney_plus'
  | 'hbo_max'
  | 'amazon_prime'
  | 'apple_tv'
  | 'paramount_plus'
  | 'mubi'
  | 'crunchyroll'

export type PlatformLogoProps = {
  platform: Platform
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const PLATFORM_PATHS: Record<Platform, string> = {
  netflix: '/netflix.png',
  disney_plus: '/disney_plus.svg',
  hbo_max: '/hbo_max.png',
  amazon_prime: '/amazon_prime.png',
  apple_tv: '/apple_tv.png',
  paramount_plus: '/paramount_plus.svg',
  mubi: '/mubi.png',
  crunchyroll: '/crunchyroll.png',
}

const PLATFORM_NAMES: Record<Platform, string> = {
  netflix: 'Netflix',
  disney_plus: 'Disney+',
  hbo_max: 'HBO Max',
  amazon_prime: 'Amazon Prime Video',
  apple_tv: 'Apple TV+',
  paramount_plus: 'Paramount+',
  mubi: 'MUBI',
  crunchyroll: 'Crunchyroll',
}

const SIZE_PX: Record<NonNullable<PlatformLogoProps['size']>, number> = {
  sm: 24,
  md: 32,
  lg: 40,
}

export function PlatformLogo({
  platform,
  size = 'md',
  className = '',
}: PlatformLogoProps) {
  const px = SIZE_PX[size]
  const src = PLATFORM_PATHS[platform]
  const name = PLATFORM_NAMES[platform]

  return (
    <span
      className={`inline-flex items-center justify-center bg-white rounded-md p-1 shrink-0 ${className}`}
      style={{ width: px, height: px }}
      title={name}
    >
      <Image
        src={src}
        alt={name}
        width={px}
        height={px}
        className="object-contain w-full h-full"
      />
    </span>
  )
}

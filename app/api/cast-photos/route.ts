import { NextRequest, NextResponse } from 'next/server'
import { fetchPersonByName } from '@/lib/tmdb-person'

// Per-instance cache for resolved hits only — never cache nulls so a
// transient TMDB miss doesn't poison subsequent requests.
const memCache = new Map<string, string>()

export async function POST(req: NextRequest) {
  try {
    const { names } = await req.json()
    if (!Array.isArray(names)) {
      return NextResponse.json({ error: 'names must be an array' }, { status: 400 })
    }

    // Cap to avoid abuse
    const unique = Array.from(new Set(names.filter((n) => typeof n === 'string'))).slice(0, 200)

    const result: Record<string, string | null> = {}

    await Promise.all(
      unique.map(async (name) => {
        if (memCache.has(name)) {
          result[name] = memCache.get(name)!
          return
        }
        const person = await fetchPersonByName(name)
        const path = person?.profile_path ?? null
        if (path) memCache.set(name, path)
        result[name] = path
      }),
    )

    return NextResponse.json({ photos: result })
  } catch {
    return NextResponse.json({ photos: {} })
  }
}

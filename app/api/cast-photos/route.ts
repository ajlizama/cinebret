import { NextRequest, NextResponse } from 'next/server'
import { fetchPersonByName } from '@/lib/tmdb-person'

// In-memory cache (per server instance) on top of the Next fetch cache.
// Avoids re-running the same TMDB lookups for the duration of the process.
const memCache = new Map<string, string | null>()

export async function POST(req: NextRequest) {
  try {
    const { names } = await req.json()
    if (!Array.isArray(names)) {
      return NextResponse.json({ error: 'names must be an array' }, { status: 400 })
    }

    // Cap to avoid abuse
    const unique = Array.from(new Set(names.filter((n) => typeof n === 'string'))).slice(0, 200)

    const result: Record<string, string | null> = {}

    // Resolve in parallel, falling back to mem cache
    await Promise.all(
      unique.map(async (name) => {
        if (memCache.has(name)) {
          result[name] = memCache.get(name)!
          return
        }
        const person = await fetchPersonByName(name)
        const path = person?.profile_path ?? null
        memCache.set(name, path)
        result[name] = path
      }),
    )

    return NextResponse.json({ photos: result })
  } catch {
    return NextResponse.json({ photos: {} })
  }
}

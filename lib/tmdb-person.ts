const TMDB_KEY = process.env.TMDB_API_KEY

export type PersonData = {
  id: number
  name: string
  profile_path: string | null
  biography: string | null
  birthday: string | null
  deathday: string | null
  place_of_birth: string | null
  known_for_department: string | null
}

export async function fetchPersonByName(name: string): Promise<PersonData | null> {
  if (!TMDB_KEY) return null
  try {
    // Search by name
    const searchRes = await fetch(
      `https://api.themoviedb.org/3/search/person?api_key=${TMDB_KEY}&query=${encodeURIComponent(name)}&language=es`,
      { next: { revalidate: 86400 } } // cache 24h
    )
    const searchData = await searchRes.json()
    const match = searchData.results?.[0]
    if (!match) return null

    // Get full details
    const detailRes = await fetch(
      `https://api.themoviedb.org/3/person/${match.id}?api_key=${TMDB_KEY}&language=es`,
      { next: { revalidate: 86400 } }
    )
    const detail = await detailRes.json()

    return {
      id: detail.id,
      name: detail.name,
      profile_path: detail.profile_path ?? null,
      biography: detail.biography || null,
      birthday: detail.birthday ?? null,
      deathday: detail.deathday ?? null,
      place_of_birth: detail.place_of_birth ?? null,
      known_for_department: detail.known_for_department ?? null,
    }
  } catch {
    return null
  }
}

export function calcAge(birthday: string, deathday?: string | null): number | null {
  if (!birthday) return null
  const birth = new Date(birthday)
  const end = deathday ? new Date(deathday) : new Date()
  let age = end.getFullYear() - birth.getFullYear()
  const m = end.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) age--
  return age
}

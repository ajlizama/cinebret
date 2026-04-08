/**
 * smartSearch — fuzzy multi-field text matcher used by listing pages.
 *
 * Each item is collapsed into a single lowercase haystack of all its
 * searchable fields (title, director, cast, genres, keywords, categoria,
 * compositor, etc). The query is split into tokens and ALL tokens must
 * appear somewhere in the haystack — that gives multi-word matches like
 * "nolan thriller" or "ridley scott guerra".
 *
 * Use `buildHaystack` to assemble the searchable string for each item.
 * Use `matchTokens` to check if a query matches the haystack.
 */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildHaystack(parts: Array<string | number | null | undefined | (string | null | undefined)[]>): string {
  const flat: string[] = []
  for (const p of parts) {
    if (p == null) continue
    if (Array.isArray(p)) {
      for (const x of p) {
        if (x != null) flat.push(String(x))
      }
    } else {
      flat.push(String(p))
    }
  }
  return normalize(flat.join(' · '))
}

export function tokenize(query: string): string[] {
  return normalize(query)
    .split(' ')
    .filter((t) => t.length > 0)
}

export function matchTokens(haystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  for (const t of tokens) {
    if (!haystack.includes(t)) return false
  }
  return true
}

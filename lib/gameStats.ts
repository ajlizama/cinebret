/**
 * gameStats — shared stats persistence for competitive games.
 *
 * Two backends, one API:
 *  - Guest (no user): localStorage with key `cinebret-stats-${game}`
 *  - Logged-in user: Supabase `user_game_stats` table (one row per
 *    user × game, upserted on every write)
 *
 * The shape is identical so consumers don't branch. Use `loadStats(game, userId)`
 * and `saveStats(game, userId, next)`. The lib handles the read/write fanout.
 *
 * Per-day fields (last_played_date) are tracked in the row so we can detect
 * streak breaks across days even when the user only plays the daily.
 */

import { supabase } from '@/lib/supabase'

export type GameStats = {
  games_played: number
  games_won: number
  current_streak: number
  max_streak: number
  guess_distribution: number[]
  best_time_seconds?: number | null
  total_time_seconds?: number | null
  last_time_seconds?: number | null
  last_played_date?: string | null
}

const DEFAULT_STATS: GameStats = {
  games_played: 0,
  games_won: 0,
  current_streak: 0,
  max_streak: 0,
  guess_distribution: [0, 0, 0, 0, 0, 0],
  best_time_seconds: null,
  total_time_seconds: 0,
  last_time_seconds: null,
  last_played_date: null,
}

function localKey(game: string): string {
  return `cinebret-stats-${game}`
}

function readLocal(game: string): GameStats {
  if (typeof window === 'undefined') return { ...DEFAULT_STATS }
  try {
    const raw = localStorage.getItem(localKey(game))
    if (!raw) return { ...DEFAULT_STATS }
    const parsed = JSON.parse(raw) as Partial<GameStats>
    return {
      ...DEFAULT_STATS,
      ...parsed,
      guess_distribution: parsed.guess_distribution ?? [0, 0, 0, 0, 0, 0],
    }
  } catch {
    return { ...DEFAULT_STATS }
  }
}

function writeLocal(game: string, stats: GameStats) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(localKey(game), JSON.stringify(stats))
  } catch {}
}

async function readRemote(game: string, userId: string): Promise<GameStats> {
  const { data, error } = await supabase
    .from('user_game_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('game', game)
    .maybeSingle()
  if (error || !data) return { ...DEFAULT_STATS }
  return {
    games_played: data.games_played ?? 0,
    games_won: data.games_won ?? 0,
    current_streak: data.current_streak ?? 0,
    max_streak: data.max_streak ?? 0,
    guess_distribution: data.guess_distribution ?? [0, 0, 0, 0, 0, 0],
    best_time_seconds: data.best_time_seconds ?? null,
    total_time_seconds: data.total_time_seconds ?? 0,
    last_time_seconds: data.last_time_seconds ?? null,
    last_played_date: data.last_played_date ?? null,
  }
}

async function writeRemote(game: string, userId: string, stats: GameStats): Promise<void> {
  await supabase
    .from('user_game_stats')
    .upsert(
      {
        user_id: userId,
        game,
        games_played: stats.games_played,
        games_won: stats.games_won,
        current_streak: stats.current_streak,
        max_streak: stats.max_streak,
        guess_distribution: stats.guess_distribution,
        best_time_seconds: stats.best_time_seconds ?? null,
        total_time_seconds: stats.total_time_seconds ?? 0,
        last_time_seconds: stats.last_time_seconds ?? null,
        last_played_date: stats.last_played_date ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,game' },
    )
}

/**
 * Load stats. Returns local if no userId, remote if userId is provided.
 * Both branches return the same shape, so consumers don't need to switch.
 */
export async function loadStats(game: string, userId: string | null | undefined): Promise<GameStats> {
  if (!userId) return readLocal(game)
  return readRemote(game, userId)
}

/**
 * Save stats. Writes to both local AND remote when logged in (local stays as
 * a backup so the page still has data after logout). Local-only otherwise.
 */
export async function saveStats(
  game: string,
  userId: string | null | undefined,
  stats: GameStats,
): Promise<void> {
  writeLocal(game, stats)
  if (userId) await writeRemote(game, userId, stats)
}

export const DEFAULT_GAME_STATS = DEFAULT_STATS

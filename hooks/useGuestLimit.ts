'use client'

import { useState, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'

const LIMIT = 10
const COOLDOWN_MS = 4 * 60 * 60 * 1000 // 4 hours

function getKey(feature: string) {
  return `cinebret_guest_${feature}`
}

function getState(feature: string): { count: number; resetAt: number } {
  try {
    const raw = localStorage.getItem(getKey(feature))
    if (!raw) return { count: 0, resetAt: Date.now() + COOLDOWN_MS }
    const state = JSON.parse(raw)
    // Reset if cooldown passed
    if (Date.now() > state.resetAt) {
      return { count: 0, resetAt: Date.now() + COOLDOWN_MS }
    }
    return state
  } catch {
    return { count: 0, resetAt: Date.now() + COOLDOWN_MS }
  }
}

function saveState(feature: string, state: { count: number; resetAt: number }) {
  try {
    localStorage.setItem(getKey(feature), JSON.stringify(state))
  } catch {}
}

/**
 * Hook to limit guest (non-logged-in) users to N actions per cooldown period.
 * Returns:
 * - blocked: whether the user has hit the limit
 * - increment: call this on each action (swipe, click, etc.)
 * - remaining: how many actions left
 */
export function useGuestLimit(user: User | null, feature: string) {
  const [blocked, setBlocked] = useState(false)

  const increment = useCallback(() => {
    // Logged-in users are never blocked
    if (user) return false

    const state = getState(feature)
    state.count++
    saveState(feature, state)

    if (state.count >= LIMIT) {
      setBlocked(true)
      return true // blocked
    }
    return false
  }, [user, feature])

  const remaining = user ? Infinity : Math.max(0, LIMIT - getState(feature).count)

  return { blocked, increment, remaining, setBlocked }
}

'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type AuthContextType = {
  user: User | null
  username: string | null
  loading: boolean
  signOut: () => Promise<void>
  refreshUsername: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({ user: null, username: null, loading: true, signOut: async () => {}, refreshUsername: async () => {} })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadUsername = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('username').eq('user_id', userId).maybeSingle()
    setUsername(data?.username ?? null)
  }

  const refreshUsername = async () => {
    if (user) await loadUsername(user.id)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadUsername(session.user.id).then(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadUsername(session.user.id)
      else setUsername(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, username, loading, signOut: () => supabase.auth.signOut().then(() => {}), refreshUsername }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

let _supabaseAdmin: ReturnType<typeof createClient> | null = null
function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SECRET_KEY
    if (!url || !key) throw new Error('Supabase credentials not configured')
    _supabaseAdmin = createClient(url, key)
  }
  return _supabaseAdmin
}

export async function POST(req: NextRequest) {
  try {
    const { userId, peliculaId, visto, watchlist, rating } = await req.json()

    if (!userId || !peliculaId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const { error } = await getSupabaseAdmin().from('user_peliculas').upsert(
      { user_id: userId, pelicula_id: peliculaId, visto: visto ?? false, watchlist: watchlist ?? false, rating: rating ?? null } as any,
      { onConflict: 'user_id,pelicula_id' }
    )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

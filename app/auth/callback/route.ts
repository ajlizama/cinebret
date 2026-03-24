import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_KEY!
    )
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (data?.session) {
      // Redirect with tokens in hash so client-side supabase picks them up
      const { access_token, refresh_token } = data.session
      const params = new URLSearchParams({
        access_token,
        refresh_token,
        token_type: 'bearer',
        type: 'recovery',
      })
      return NextResponse.redirect(`${origin}/catalogo#${params.toString()}`)
    }
  }

  return NextResponse.redirect(`${origin}/catalogo`)
}

// ============================================
// OPTIMAL BREAKS — Auth Callback Route
// Handles OAuth redirect from Google/etc.
// ============================================

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { i18n } from '@/lib/i18n-config'

function detectLocale(request: NextRequest, next: string | null): string {
  const seg = next?.split('/')[1]
  if (seg && i18n.locales.includes(seg as any)) return seg

  const accept = request.headers.get('accept-language')
  if (accept) {
    const preferred = accept.split(',')[0].split('-')[0].toLowerCase()
    if (i18n.locales.includes(preferred as any)) return preferred
  }
  return i18n.defaultLocale
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next')
  const locale = detectLocale(request, next)
  const fallbackHome = `/${locale}`

  if (code) {
    const cookieStore = await cookies()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const publishable =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!url || !publishable) {
      return NextResponse.redirect(`${origin}/${locale}?auth_error=config`)
    }
    const supabase = createServerClient(url, publishable, {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* server component limitation */ }
        },
      },
    })

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next || fallbackHome}`)
    }
  }

  return NextResponse.redirect(`${origin}/${locale}?auth_error=true`)
}

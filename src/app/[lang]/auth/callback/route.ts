// ============================================
// OPTIMAL BREAKS — Auth callback (locale-prefixed)
// Misma lógica que /api/auth/callback: intercambia ?code= por sesión.
// Útil cuando redirect_to en Supabase apunta a /es/auth/callback (evita 404).
// ============================================

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { i18n, type Locale } from '@/lib/i18n-config'
import { isSafeAppPath, normalizeRelativeNext } from '@/lib/auth-callback'

function resolveNext(searchParams: URLSearchParams, lang: string): string {
  const normalized = normalizeRelativeNext(searchParams.get('next'))
  if (normalized && isSafeAppPath(normalized)) return normalized
  return `/${lang}/login`
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ lang: string }> }
) {
  const { lang: langParam } = await context.params
  const lang = i18n.locales.includes(langParam as Locale) ? langParam : i18n.defaultLocale

  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = resolveNext(searchParams, lang)

  if (code) {
    const cookieStore = await cookies()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const publishable =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!url || !publishable) {
      return NextResponse.redirect(`${origin}/${lang}?auth_error=config`)
    }
    const supabase = createServerClient(url, publishable, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            /* server component limitation */
          }
        },
      },
    })

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/${lang}/login?auth_error=true`)
}

// ============================================
// OPTIMAL BREAKS — Middleware (i18n + Auth)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { i18n } from '@/lib/i18n-config'

const LOCALE_COOKIE = 'OB_LOCALE'

function getLocale(request: NextRequest): string {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value
  if (cookie && i18n.locales.includes(cookie as any)) return cookie

  const acceptLanguage = request.headers.get('accept-language')
  if (acceptLanguage) {
    const preferred = acceptLanguage.split(',')[0].split('-')[0].toLowerCase()
    if (i18n.locales.includes(preferred as any)) return preferred
  }
  return i18n.defaultLocale
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static files (incl. todo bajo /images/ aunque falte extensión, para no prefijar locale)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/music') ||
    pathname.startsWith('/images/') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // SECURITY: Block long URLs, null bytes, path traversal
  if (pathname.length > 500 || pathname.includes('\0') || pathname.includes('..')) {
    return new NextResponse('Bad Request', { status: 400 })
  }

  // Create response for cookie handling
  let response = NextResponse.next({ request })

  // Refresh Supabase auth session (keeps cookies alive)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (supabaseUrl && supabaseKey) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    })

    // Refresh the session — this keeps the user logged in
    await supabase.auth.getUser()
  }

  // Validate locale in URL
  const segments = pathname.split('/')
  if (segments.length >= 2 && segments[1]) {
    const urlLocale = segments[1].toLowerCase()
    if (urlLocale.length === 2 && !i18n.locales.includes(urlLocale as any)) {
      request.nextUrl.pathname = `/${i18n.defaultLocale}${pathname.slice(3)}`
      return NextResponse.redirect(request.nextUrl)
    }
  }

  // Check if locale prefix exists
  const pathnameHasLocale = i18n.locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  )

  if (pathnameHasLocale) {
    const currentLocale = pathname.split('/')[1]
    if (request.cookies.get(LOCALE_COOKIE)?.value !== currentLocale) {
      response.cookies.set(LOCALE_COOKIE, currentLocale, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      })
    }
    return response
  }

  // Redirect to locale-prefixed path
  const locale = getLocale(request)
  request.nextUrl.pathname = `/${locale}${pathname}`
  return NextResponse.redirect(request.nextUrl)
}

export const config = {
  matcher: ['/((?!_next|api|favicon|music|images|.*\\..*).*)'],
}

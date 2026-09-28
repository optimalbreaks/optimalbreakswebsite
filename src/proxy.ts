// ============================================
// OPTIMAL BREAKS — Proxy (i18n + Auth)
// Next 16: antes middleware.ts (Edge). Ahora proxy en Node.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { i18n, type Locale } from '@/lib/i18n-config'

function isLocale(value: string): value is Locale {
  return (i18n.locales as readonly string[]).includes(value)
}

const LOCALE_COOKIE = 'OB_LOCALE'

function getLocale(request: NextRequest): string {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value
  if (cookie && isLocale(cookie)) return cookie

  const acceptLanguage = request.headers.get('accept-language')
  if (acceptLanguage) {
    const preferred = acceptLanguage.split(',')[0].split('-')[0].toLowerCase()
    if (isLocale(preferred)) return preferred
  }
  return i18n.defaultLocale
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static files (incl. todo bajo /images/ aunque falte extensión, para no prefijar locale)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/music') ||
    pathname.startsWith('/images/') ||
    pathname.includes('/auth/callback') ||
    pathname.includes('/auth/confirm') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // SECURITY: Block long URLs, null bytes, path traversal
  if (pathname.length > 500 || pathname.includes('\0') || pathname.includes('..')) {
    return new NextResponse('Bad Request', { status: 400 })
  }

  // Shortlink para compartir (Instagram rechaza URLs largas en stickers):
  // /a/<slug> → /<locale>/artists/<slug>. 307 (no permanente) porque el
  // destino depende de la cookie/Accept-Language del visitante.
  const shortMatch = pathname.match(/^\/a\/([^/]+)\/?$/)
  if (shortMatch) {
    request.nextUrl.pathname = `/${getLocale(request)}/artists/${shortMatch[1]}`
    return NextResponse.redirect(request.nextUrl, 307)
  }

  // Create response for cookie handling
  let response = NextResponse.next({ request })

  // Refresh Supabase auth session (keeps cookies alive).
  // Only when auth cookies exist — anonymous traffic must not call Auth.
  // Hard timeout: if Auth hangs, Vercel returns MIDDLEWARE_INVOCATION_TIMEOUT (504)
  // for the whole site; better skip refresh than take the page down.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.includes('-auth-token') || c.name.startsWith('sb-'))

  // Los prefetch de <Link> (Next los lanza en bloque al ver enlaces en
  // pantalla) NO necesitan refrescar la sesión: antes cada uno hacía un viaje
  // a Supabase Auth y añadía hasta 2,5 s a cada navegación de un usuario
  // logueado. La navegación real sí refresca.
  const isPrefetch =
    request.headers.has('next-router-prefetch') ||
    request.headers.get('purpose') === 'prefetch' ||
    (request.headers.get('sec-purpose') || '').includes('prefetch')

  if (supabaseUrl && supabaseKey && hasAuthCookie && !isPrefetch) {
    // Aborta de verdad la petición a Auth si tarda: sin esto, un cuelgue de
    // Supabase agota los 25 s del proxy y Vercel devuelve 504 en todo el sitio.
    const AUTH_TIMEOUT_MS = 2_500
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(AUTH_TIMEOUT_MS) }),
      },
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

    try {
      // Refresca la sesión (mantiene al usuario logueado). `getClaims()`
      // valida el JWT en local cuando el proyecto usa claves asimétricas (sin
      // viaje de red) y solo llama a Auth si el token ha caducado y hay que
      // refrescarlo. Si la versión de supabase-js no lo trae, `getUser()`.
      const auth = supabase.auth as typeof supabase.auth & {
        getClaims?: () => Promise<unknown>
      }
      if (typeof auth.getClaims === 'function') await auth.getClaims()
      else await supabase.auth.getUser()
    } catch {
      // Auth caído o lento: seguir sirviendo la página sin refrescar cookies
    }
  }

  // Validate locale in URL
  const segments = pathname.split('/')
  if (segments.length >= 2 && segments[1]) {
    const urlLocale = segments[1].toLowerCase()
    if (urlLocale.length === 2 && !isLocale(urlLocale)) {
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

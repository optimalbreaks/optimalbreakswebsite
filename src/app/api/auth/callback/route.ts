// ============================================
// OPTIMAL BREAKS — Auth callback (legacy /api path)
// Redirige a /[lang]/auth/callback para que el intercambio PKCE ocurra en el
// cliente (mismas cookies que al pedir reset / OAuth). Correos viejos con
// redirect_to → /api/auth/callback siguen funcionando.
// ============================================

import { NextResponse, type NextRequest } from 'next/server'
import { i18n } from '@/lib/i18n-config'
import { isSafeAppPath, normalizeRelativeNext } from '@/lib/auth-callback'

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
  const rawNext = searchParams.get('next')
  const normalizedNext = normalizeRelativeNext(rawNext)
  const safeNext = normalizedNext && isSafeAppPath(normalizedNext) ? normalizedNext : null
  const locale = detectLocale(request, safeNext)

  if (!code) {
    return NextResponse.redirect(`${origin}/${locale}/login?auth_error=true`)
  }

  const dest = new URL(`/${locale}/auth/callback`, origin)
  dest.searchParams.set('code', code)
  if (rawNext) dest.searchParams.set('next', rawNext)

  return NextResponse.redirect(dest)
}

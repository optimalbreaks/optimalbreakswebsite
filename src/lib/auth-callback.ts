// ============================================
// OPTIMAL BREAKS — Auth callback helpers (PKCE redirect)
// Supabase a veces anida redirect_to con doble URL-encoding; ?next= debe
// decodificarse hasta quedar una ruta /es/... o /en/... segura.
// ============================================

import type { EmailOtpType } from '@supabase/supabase-js'
import { i18n } from '@/lib/i18n-config'

/** Tipos que pueden venir en enlaces de correo (verifyOtp con token_hash). */
const EMAIL_VERIFY_TYPES = new Set<string>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
  'reauthentication',
])

/** Decodifica porcentajes repetidos (?next=%252Fes%252Freset-password → /es/reset-password). */
export function normalizeRelativeNext(raw: string | null): string | null {
  if (raw == null || raw === '') return null
  let s = raw.trim()
  for (let i = 0; i < 8; i++) {
    try {
      const d = decodeURIComponent(s)
      if (d === s) break
      s = d
    } catch {
      break
    }
  }
  return s || null
}

/** Solo rutas internas con prefijo de locale permitido (anti open-redirect). */
export function isSafeAppPath(path: string): boolean {
  if (!path.startsWith('/') || path.includes('//') || path.includes('\\')) return false
  return i18n.locales.some((l) => path === `/${l}` || path.startsWith(`/${l}/`))
}

/** Ruta interna sin query/hash (p. ej. next mal formado con ?token_hash= dentro). */
export function appPathOnly(pathWithMaybeQuery: string): string {
  const cut = pathWithMaybeQuery.search(/[?#]/)
  return cut === -1 ? pathWithMaybeQuery : pathWithMaybeQuery.slice(0, cut)
}

/**
 * Tras verifyOtp en servidor, destino seguro para redirect (solo pathname).
 */
export function safeRedirectPathAfterOtp(rawNext: string | null, lang: string): string {
  const n = normalizeRelativeNext(rawNext)
  if (!n) return `/${lang}/login`
  const pathOnly = appPathOnly(n)
  return isSafeAppPath(pathOnly) ? pathOnly : `/${lang}/login`
}

/**
 * Supabase a veces redirige a /auth/callback con ?next=/es/reset-password?token_hash=pkce_…&type=recovery
 * (sin ?code=). Hay que extraer token_hash y type y mandar a /auth/confirm.
 */
export function parseOtpFromAuthCallbackParams(
  getParam: (name: string) => string | null
): { token_hash: string; type: EmailOtpType } | null {
  let token_hash = getParam('token_hash')
  let type = getParam('type')

  const rawNext = getParam('next')
  if (rawNext) {
    const decoded = normalizeRelativeNext(rawNext) ?? rawNext
    const q = decoded.indexOf('?')
    if (q !== -1) {
      const inner = new URLSearchParams(decoded.slice(q + 1))
      if (!token_hash) token_hash = inner.get('token_hash')
      if (!type) type = inner.get('type')
    }
  }

  if (!token_hash?.trim() || !type?.trim()) return null
  const t = type.trim()
  if (!EMAIL_VERIFY_TYPES.has(t)) return null

  return { token_hash: token_hash.trim(), type: t as EmailOtpType }
}

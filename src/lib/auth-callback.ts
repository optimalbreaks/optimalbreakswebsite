// ============================================
// OPTIMAL BREAKS — Auth callback helpers (PKCE redirect)
// Supabase a veces anida redirect_to con doble URL-encoding; ?next= debe
// decodificarse hasta quedar una ruta /es/... o /en/... segura.
// ============================================

import { i18n } from '@/lib/i18n-config'

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

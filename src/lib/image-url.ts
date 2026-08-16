// ============================================
// OPTIMAL BREAKS — Normaliza URLs de imagen a WebP donde aplica
// Solo rutas bajo public/images/ (assets estáticos migrados a WebP).
// Las image_url de Supabase Storage se usan tal cual en BD: si forzamos .webp
// y en el bucket solo existe .jpg, el cartel/retrato rompe (404).
// ============================================

const RASTER_EXT = /\.(jpe?g|png)(?=$|[?#])/i

function pathnameOf(url: string): string {
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return new URL(url).pathname
    }
  } catch {
    /* ignore */
  }
  const q = url.indexOf('?')
  const h = url.indexOf('#')
  const end = Math.min(q === -1 ? url.length : q, h === -1 ? url.length : h)
  return url.slice(0, end)
}

function shouldSkipWebpPath(pathname: string): boolean {
  const lower = pathname.toLowerCase()
  if (lower.includes('favicon')) return true
  if (lower.includes('opengraph')) return true
  if (lower.includes('og-home') || lower.includes('og_home')) return true
  if (/\/icon-512\.png$/i.test(lower)) return true
  return false
}

function isOurOptimizableUrl(u: string): boolean {
  return u.startsWith('/images/')
}

/** Sello de versión de imagen: epoch ms de un timestamp (p. ej. `events.updated_at`). */
export function imageCacheVersion(updatedAt: string | null | undefined): string | null {
  const t = updatedAt ? Date.parse(updatedAt) : NaN
  return Number.isFinite(t) ? String(t) : null
}

/**
 * Los carteles de eventos viven en una ruta fija de Storage
 * (media/events/<slug>/poster.*): la URL no cambia al reemplazar la imagen.
 * `?v=<versión>` fuerza a CDN de Supabase, navegador y scrapers
 * (Facebook/WhatsApp) a bajar siempre la más actualizada.
 * Solo aplica a URLs http(s); las rutas locales bajo /images/ van con el deploy.
 */
export function versionedImageUrl(
  url: string | null | undefined,
  version: string | null,
): string | null {
  const u = url?.trim()
  if (!u) return null
  if (!version || !/^https?:\/\//i.test(u)) return u
  return `${u}${u.includes('?') ? '&' : '?'}v=${version}`
}

/**
 * Devuelve la URL a usar en <img>: WebP si migramos el asset; sin cambios si no aplica.
 */
export function displayImageUrl(url: string | null | undefined): string | undefined {
  const u = url?.trim()
  if (!u) return undefined
  if (/\.webp(?=$|[?#])/i.test(u)) return u
  if (!isOurOptimizableUrl(u)) return u
  if (!RASTER_EXT.test(u)) return u
  const path = pathnameOf(u)
  if (shouldSkipWebpPath(path)) return u
  return u.replace(RASTER_EXT, '.webp')
}

// ============================================
// OPTIMAL BREAKS — Retratos manuales en public/images/artists/*.webp
// Mapa editorial: data/artist-public-portrait-map.json (slug → nombre de archivo)
// ============================================

import portraitMap from '../../data/artist-public-portrait-map.json'
import { displayImageUrl } from '@/lib/image-url'

const MAP = portraitMap as Record<string, string>
const BASE = '/images/artists/'

/** URL de sitio para el .webp manual de un slug, si existe en el mapa. */
export function artistPublicPortraitUrl(slug: string | null | undefined): string | undefined {
  if (!slug) return undefined
  const file = MAP[slug]
  if (!file || typeof file !== 'string') return undefined
  const trimmed = file.trim()
  if (!trimmed) return undefined
  return `${BASE}${trimmed}`
}

/**
 * Orden del retrato en tarjetas y fichas:
 * 1. Remota (web / Storage): `image_url` con https:// (o http://)
 * 2. Manual en `public/images/artists`: mapa JSON → .webp; si no hay mapa pero BD tiene `/images/artists/…`, se usa
 * 3. Nada válido → `undefined` → `CardThumbnail` muestra el fallback punk
 */
export function displayArtistImageUrl(
  slug: string | null | undefined,
  imageUrl: string | null | undefined,
): string | undefined {
  const u = (imageUrl ?? '').trim()

  if (u.startsWith('https://') || u.startsWith('http://')) {
    return displayImageUrl(u)
  }

  const local = artistPublicPortraitUrl(slug)
  if (local) {
    return displayImageUrl(local)
  }

  if (u.startsWith('/images/artists/')) {
    return displayImageUrl(u)
  }

  return displayImageUrl(u || undefined)
}

// ============================================
// OPTIMAL BREAKS — Share-track helpers
// Links públicos y canónicos para compartir una canción:
//  - 40 Breaks / New Releases (source 'chart' | 'featured') → /[lang]/charts
//    con ?week=<YYYY-MM-DD>&play=<source>:<uuid>. ChartView lo recoge y
//    arranca la cola del reproductor global en ese tema.
//  - Beatport Top (source 'beatport') → misma página donde vive la lista
//    (ficha de artista o sello), con ?play=beatport:<beatportId>. La URL
//    base se pasa como `pageHref` porque el ID de beatport es estable,
//    pero el "top" es de cada entidad.
// Vinyl NO se comparte por aquí: mantiene su enlace externo a Discogs/YouTube.
// ============================================

import type { Locale } from '@/lib/i18n-config'
import { SITE_URL } from '@/lib/seo'

export type ShareTrackSource = 'chart' | 'featured' | 'beatport'

/** Path relativo (no absoluto). Útil para `navigator.clipboard` y botones de compartir nativos. */
export function buildTrackSharePath(
  lang: Locale,
  source: 'chart' | 'featured',
  trackId: string,
  weekDate: string,
): string {
  const params = new URLSearchParams({
    week: weekDate,
    play: `${source}:${trackId}`,
  })
  return `/${lang}/charts?${params.toString()}`
}

export function buildTrackShareUrl(
  lang: Locale,
  source: 'chart' | 'featured',
  trackId: string,
  weekDate: string,
): string {
  return `${SITE_URL}${buildTrackSharePath(lang, source, trackId, weekDate)}`
}

/**
 * Compone un path compartible para un track del Top Beatport de una ficha
 * (artista/sello). `pageHref` debe ser el path relativo de la ficha donde
 * vive la lista, por ejemplo `/es/artists/prodigy`. `beatportId` es el ID
 * numérico que extraemos de la `beatport_url` (función `extractBeatportTrackId`
 * en `BeatportTopTracks`).
 */
export function buildBeatportSharePath(
  pageHref: string,
  beatportId: string,
): string {
  const base = pageHref.split('#')[0].split('?')[0]
  const params = new URLSearchParams({ play: `beatport:${beatportId}` })
  return `${base}?${params.toString()}`
}

export function buildBeatportShareUrl(
  pageHref: string,
  beatportId: string,
): string {
  return `${SITE_URL}${buildBeatportSharePath(pageHref, beatportId)}`
}

/**
 * Parseo defensivo de `?play=`:
 * - `"1"` → play legacy del buscador global (⌘K) en ChartView.
 * - `"chart:<uuid>"` / `"featured:<uuid>"` → aterriza en una fila de un chart.
 * - `"beatport:<digits>"` → aterriza en una fila del Top 10 de la ficha actual.
 * - Cualquier otra cosa → `null` (se ignora, no crashea).
 */
export function parsePlayParam(
  value: string | null | undefined,
):
  | { kind: 'legacy' }
  | { kind: 'track'; source: 'chart' | 'featured'; id: string }
  | { kind: 'beatport'; id: string }
  | null {
  if (!value) return null
  if (value === '1') return { kind: 'legacy' }
  const chart = /^(chart|featured):([0-9a-f-]{6,})$/i.exec(value)
  if (chart) {
    return { kind: 'track', source: chart[1].toLowerCase() as 'chart' | 'featured', id: chart[2] }
  }
  const bp = /^beatport:(\d{3,})$/i.exec(value)
  if (bp) return { kind: 'beatport', id: bp[1] }
  return null
}

/**
 * Reescribe la URL de artwork de un track a una resolución apta para OG en
 * redes (mínimo 600×315 según Facebook; recomendado ≥1200×1200).
 *
 * Beatport sirve sus artworks con el patrón
 *   `https://geo-media.beatport.com/image_size/<W>x<H>/<uuid>.jpg`
 * y por defecto se guarda el thumbnail `250x250` en `chart_*.artwork_url`.
 * Esa imagen es DEMASIADO PEQUEÑA para Facebook/WhatsApp y la previsualización
 * cae al fallback (sin imagen del track). Aquí la reescribimos a 1400×1400,
 * tamaño que Beatport sí ofrece. Para URLs de otras fuentes se devuelve la
 * URL tal cual (no se intenta adivinar).
 */
export function upscaleTrackArtworkForOg(
  rawUrl: string | null | undefined,
): string | null {
  const u = rawUrl?.trim()
  if (!u) return null
  // Beatport: image_size/<NxN>/...  →  image_size/1400x1400/...
  if (/geo-media\.beatport\.com/i.test(u)) {
    const replaced = u.replace(/image_size\/\d+x\d+\//i, 'image_size/1400x1400/')
    return replaced
  }
  return u
}

/** Preferencia: fecha completa YYYY-MM-DD; si no, año solo como string. */
export function formatTrackReleaseDisplay(
  releaseDate: string | null | undefined,
  releaseYear: number | null | undefined,
): string | null {
  const d = (releaseDate || '').trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  if (releaseYear != null && releaseYear > 0) return String(releaseYear)
  return null
}

/** Año natural para filtros / orden: desde release_date o release_year. */
export function effectiveReleaseYear(
  releaseDate: string | null | undefined,
  releaseYear: number | null | undefined,
): number | null {
  const d = (releaseDate || '').trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const y = parseInt(d.slice(0, 4), 10)
    return Number.isFinite(y) && y >= 1970 && y <= 2100 ? y : null
  }
  if (releaseYear != null && releaseYear > 0) return releaseYear
  return null
}

/**
 * Marca de tiempo UTC para ordenar por lanzamiento (más reciente = mayor número).
 * Con `YYYY-MM-DD` usa el día; con solo año usa 15-jun de ese año para encajar con fechas del mismo año.
 * Sin fecha → 0 (van al final al ordenar descendente).
 */
export function releaseSortTimestampMs(
  releaseDate: string | null | undefined,
  releaseYear: number | null | undefined,
): number {
  const d = (releaseDate || '').trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const y = parseInt(d.slice(0, 4), 10)
    const mo = parseInt(d.slice(5, 7), 10) - 1
    const day = parseInt(d.slice(8, 10), 10)
    if (
      Number.isFinite(y) &&
      Number.isFinite(mo) &&
      Number.isFinite(day) &&
      y >= 1970 &&
      y <= 2100 &&
      mo >= 0 &&
      mo <= 11 &&
      day >= 1 &&
      day <= 31
    ) {
      const t = Date.UTC(y, mo, day, 12, 0, 0)
      return Number.isFinite(t) ? t : 0
    }
  }
  if (releaseYear != null && releaseYear > 0 && releaseYear >= 1970 && releaseYear <= 2100) {
    return Date.UTC(releaseYear, 5, 15, 12, 0, 0)
  }
  return 0
}

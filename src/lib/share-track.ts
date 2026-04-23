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

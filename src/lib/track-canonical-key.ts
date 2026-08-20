import type { ChartTrackSource } from '@/types/database'

/** Misma normalización que `/api/public/charts/community-monthly` y admin tracks. */
export function normalizeTrackCanonicalUrl(u: string | null | undefined): string {
  const s = (u || '').trim().toLowerCase()
  if (!s) return ''
  const ytMatch = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-z0-9_-]{11})/i)
  if (ytMatch) return `yt:${ytMatch[1]}`
  try {
    const url = new URL(s)
    return `${url.host}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return s.replace(/[?#].*$/, '').replace(/\/$/, '')
  }
}

export function fallbackTrackCanonicalKey(source: ChartTrackSource, id: string): string {
  return `t:${source}:${id}`
}

function artistsNameKey(artists: unknown): string {
  if (typeof artists === 'string') return artists.trim().toLowerCase()
  if (!Array.isArray(artists)) return ''
  return artists
    .map((x) => (x && typeof x === 'object' ? String((x as { name?: string }).name || '') : String(x || '')))
    .filter(Boolean)
    .join(', ')
    .toLowerCase()
}

function nameFallbackKey(
  title: string | null | undefined,
  mixName: string | null | undefined,
  artists: unknown,
): string {
  const t = String(title || '').trim().toLowerCase()
  if (!t || t === '—') return ''
  return `nm:${t}|${String(mixName || '').trim().toLowerCase()}|${artistsNameKey(artists)}`
}

/** Fila de `saved_chart_tracks` (+ fila viva opcional) para contar canciones únicas. */
export type SavedTrackUniqInput = {
  track_source: ChartTrackSource
  track_id: string
  canonical_url?: string | null
  snapshot?: Record<string, unknown> | null
  live?: {
    title?: string | null
    mix_name?: string | null
    artists?: unknown
    beatport_url?: string | null
    link_url?: string | null
    youtube_url?: string | null
  } | null
}

/**
 * Clave de canción única, alineada con Mis Tracks: la misma pista guardada
 * desde 40 Breaks, New Releases o Beatport Top cuenta una vez. El vinilo
 * no se agrupa por Discogs (un release puede tener varios cortes).
 * Devuelve `null` si la fila es huérfana (sin URL ni título) y no se muestra.
 */
export function uniqueSavedTrackKey(row: SavedTrackUniqInput): string | null {
  const snap = row.snapshot || {}
  const live = row.live || null

  if (row.track_source === 'vinyl') {
    const yt = normalizeTrackCanonicalUrl(
      (live?.youtube_url as string | undefined) ||
        (snap.youtube_url as string | undefined) ||
        '',
    )
    if (yt) return yt
    const canon = normalizeTrackCanonicalUrl(row.canonical_url)
    if (canon.startsWith('yt:')) return canon
    return (
      nameFallbackKey(
        live?.title ?? (snap.title as string | undefined),
        live?.mix_name ?? (snap.mix_name as string | undefined),
        live?.artists ?? snap.artists,
      ) || null
    )
  }

  const url = normalizeTrackCanonicalUrl(
    row.canonical_url ||
      live?.beatport_url ||
      live?.link_url ||
      (snap.beatport_url as string | undefined) ||
      (snap.link_url as string | undefined) ||
      '',
  )
  if (url) return url
  const byName = nameFallbackKey(
    live?.title ?? (snap.title as string | undefined),
    live?.mix_name ?? (snap.mix_name as string | undefined),
    live?.artists ?? snap.artists,
  )
  if (byName) return byName
  if (row.track_source === 'beatport_top') {
    return fallbackTrackCanonicalKey('beatport_top', row.track_id)
  }
  return null
}

export type TrackPlaySaveInput =
  | {
      mode: 'ref'
      source: ChartTrackSource
      trackId: string
      canonicalUrl?: string | null
    }
  | {
      mode: 'url'
      externalUrl: string
      externalTrackId?: string
      canonicalUrl?: string | null
    }

export function canonicalKeyFromTrackPlaySave(save: TrackPlaySaveInput): string | null {
  if (save.mode === 'url') {
    const url = save.canonicalUrl || save.externalUrl
    const k = normalizeTrackCanonicalUrl(url)
    if (k) return k
    if (save.externalTrackId) return fallbackTrackCanonicalKey('beatport_top', save.externalTrackId)
    return null
  }
  const urlKey = normalizeTrackCanonicalUrl(save.canonicalUrl)
  if (urlKey) return urlKey
  return fallbackTrackCanonicalKey(save.source, save.trackId)
}

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

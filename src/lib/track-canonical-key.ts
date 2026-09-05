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

function artistNameTokens(artists: unknown): string[] {
  let names: string[] = []
  if (typeof artists === 'string') {
    names = artists.split(',')
  } else if (Array.isArray(artists)) {
    names = artists.map((x) =>
      x && typeof x === 'object' ? String((x as { name?: string }).name || '') : String(x || ''),
    )
  }
  return names
    .map((n) => n.trim().toLowerCase().replace(/\s+/g, ' '))
    .filter(Boolean)
    .sort()
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

function foldTrackText(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Versión genérica del mismo corte (no es un remix con nombre).
 * Original Mix e Instrumental de PITBULL son la misma canción en las
 * listas únicas; «Freestylers Remix» o un VIP con nombre se quedan aparte.
 */
export function isGenericVersionMixName(mix: string | null | undefined): boolean {
  const m = foldTrackText(mix)
  if (!m) return true
  return /^(original(\s+mix)?|instrumental|extended(\s+(mix|version))?|radio(\s+(edit|mix))?|club(\s+mix)?|vocal(\s+(mix|version))?)$/i.test(
    m,
  )
}

/**
 * Misma canción a ojos de Mis Tracks aunque Beatport asigne otro ID
 * (single de abril vs corte del álbum en septiembre). Incluye mix para no
 * fusionar Original Mix con Instrumental en el save por URL.
 */
export function trackSaveIdentityKey(
  title: string | null | undefined,
  mixName: string | null | undefined,
  artists: unknown,
): string {
  const t = String(title || '').trim().toLowerCase()
  if (!t || t === '—') return ''
  const mix = String(mixName || '').trim().toLowerCase()
  const names = artistNameTokens(artists)
  if (!names.length) return ''
  return `id:${t}|${mix}|${names.join('\u0001')}`
}

/**
 * Identidad de canción para listas únicas (ficha artista/sello, buscador).
 * Single y corte de álbum (IDs Beatport distintos) y Original Mix vs Instrumental
 * cuentan una vez. Las filas del catálogo no se borran: el merge lleva todos
 * los UUID en `relatedRefs` para no perder «+».
 */
export function trackDisplayIdentityKey(
  title: string | null | undefined,
  mixName: string | null | undefined,
  artists: unknown,
): string {
  let t = foldTrackText(title)
  if (!t || t === '—') return ''
  let m = foldTrackText(mixName)
  const paren = t.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (paren) {
    const inner = foldTrackText(paren[2])
    if (!m || m === inner || inner.includes(m) || m.includes(inner) || isGenericVersionMixName(inner)) {
      t = paren[1].trim()
      if (!m) m = inner
    }
  }
  const mixPart = isGenericVersionMixName(m) ? '' : m
  const names = artistNameTokens(artists)
  return `nm:${t}|${mixPart}|${names.join(',')}`
}

export type TrackSaveCatalogRef = { source: 'chart' | 'featured'; id: string }

function beatportNumericId(url: string | null | undefined): string | null {
  const m = String(url || '').match(/beatport\.com\/(?:[a-z]{2}\/)?track\/[^/]+\/(\d+)/i)
  return m ? m[1] : null
}

/** Agrupa filas de charts/NR que son el mismo tema que un corte del álbum (blog / Top Beatport). */
export function collectSaveRefsByBeatportUrl(
  albumTracks: Array<{
    beatport_url?: string | null
    title: string
    mix_name?: string | null
    artists?: { name?: string }[]
  }>,
  catalog: {
    featured?: Array<{
      id: string
      title: string | null
      mix_name: string | null
      artists: unknown
      link_url: string | null
    }>
    chart?: Array<{
      id: string
      title: string | null
      mix_name: string | null
      artists: unknown
      beatport_url: string | null
    }>
  },
): Record<string, TrackSaveCatalogRef[]> {
  const out: Record<string, TrackSaveCatalogRef[]> = {}
  for (const t of albumTracks) {
    const url = (t.beatport_url || '').trim()
    if (!url) continue
    const identity = trackSaveIdentityKey(t.title, t.mix_name, t.artists)
    const albumBpId = beatportNumericId(url)
    const refs: TrackSaveCatalogRef[] = []
    const seen = new Set<string>()
    const push = (source: TrackSaveCatalogRef['source'], id: string) => {
      const k = `${source}:${id}`
      if (!id || seen.has(k)) return
      seen.add(k)
      refs.push({ source, id })
    }
    for (const f of catalog.featured || []) {
      const sameSong =
        (identity && trackSaveIdentityKey(f.title, f.mix_name, f.artists) === identity) ||
        (!!albumBpId && beatportNumericId(f.link_url) === albumBpId)
      if (sameSong) push('featured', f.id)
    }
    for (const c of catalog.chart || []) {
      const sameSong =
        (identity && trackSaveIdentityKey(c.title, c.mix_name, c.artists) === identity) ||
        (!!albumBpId && beatportNumericId(c.beatport_url) === albumBpId)
      if (sameSong) push('chart', c.id)
    }
    refs.sort((a, b) => {
      const aExact =
        a.source === 'featured' &&
        catalog.featured?.some((f) => f.id === a.id && beatportNumericId(f.link_url) === albumBpId)
          ? 0
          : 1
      const bExact =
        b.source === 'featured' &&
        catalog.featured?.some((f) => f.id === b.id && beatportNumericId(f.link_url) === albumBpId)
          ? 0
          : 1
      return aExact - bExact
    })
    if (refs.length) out[url] = refs
  }
  return out
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

  // Misma prioridad que Mis Tracks: URL de la fila viva, luego save/snapshot.
  const url = normalizeTrackCanonicalUrl(
    live?.beatport_url ||
      live?.link_url ||
      row.canonical_url ||
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

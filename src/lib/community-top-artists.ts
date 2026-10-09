/**
 * Nombres del tablero de artistas (mismos saltos que /api/public/charts/community-monthly).
 * El pase diario de Beatport aprueba solo lo que cae en este Top.
 * La ficha de artista enseña los mismos tres números (saves, fans, temas).
 */
import { unstable_cache } from 'next/cache'
import { normalizeArtistKey } from '@/lib/artist-slug-map'
import { PUBLIC_CATALOG_CACHE_TAG } from '@/lib/revalidate-public'
import { normalizeTrackCanonicalUrl } from '@/lib/track-canonical-key'
import {
  loadLabelCreditSkipMap,
  loadSelfCreditSkipMap,
  shouldSkipArtistSelfCredit,
  shouldSkipLabelSave,
  splitArtistCreditsForRanking,
} from '@/lib/artist-self-credit'
import { extractRemixerNames } from '@/lib/remixer-credits'
import { fetchAllPagesParallel } from '@/lib/supabase-paginate'
import { createServiceSupabase, selectByIds } from '@/lib/supabase-admin'

type ServiceClient = ReturnType<typeof createServiceSupabase>

const SAVE_SELECT =
  'user_id, track_source, track_id, created_at, snap_artists:snapshot->artists, snap_mix:snapshot->mix_name, snap_label:snapshot->label, snap_title:snapshot->title'

type SaveRow = {
  user_id: string
  track_source: string
  track_id: string
  created_at: string | null
  snap_artists: unknown
  snap_mix: unknown
  snap_label: unknown
  snap_title: unknown
}

type LiveCredit = {
  artists: string
  mix_name: string | null
  label: string | null
}

function creditLine(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .map((x) => (x && typeof x === 'object' ? (x as { name?: string }).name : x))
    .filter(Boolean)
    .join(', ')
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t || null
}

/** Claves normalizadas de los N primeros del tablero, por créditos de save. */
export async function loadTopArtistKeys(sb: ServiceClient, limit = 100): Promise<Set<string>> {
  const [saves, privateProfiles, selfCreditSkip, labelCreditSkip] = await Promise.all([
    fetchAllPagesParallel<SaveRow>(
      () => sb.from('saved_chart_tracks').select('id', { count: 'exact', head: true }),
      (from, to) =>
        sb
          .from('saved_chart_tracks')
          .select(SAVE_SELECT)
          .order('created_at', { ascending: true })
          .range(from, to),
    ),
    sb.from('profiles').select('id').eq('is_tracks_public', false),
    loadSelfCreditSkipMap(sb),
    loadLabelCreditSkipMap(sb),
  ])

  const privateSet = new Set(
    ((privateProfiles.data as { id: string }[] | null) ?? []).map((p) => p.id),
  )
  const rows = saves.filter((s) => !privateSet.has(s.user_id))

  const chartIds = rows.filter((s) => s.track_source === 'chart').map((s) => s.track_id)
  const featIds = rows.filter((s) => s.track_source === 'featured').map((s) => s.track_id)
  const vinylIds = rows.filter((s) => s.track_source === 'vinyl').map((s) => s.track_id)

  const [chartRes, featRes, vinylRes] = await Promise.all([
    chartIds.length
      ? selectByIds<{ id: string; artists: unknown; mix_name: string | null; label: string | null }>(
          chartIds,
          (chunk) => sb.from('chart_tracks').select('id, artists, mix_name, label').in('id', chunk),
        )
      : Promise.resolve({ data: [], error: null }),
    featIds.length
      ? selectByIds<{ id: string; artists: unknown; mix_name: string | null; label: string | null }>(
          featIds,
          (chunk) => sb.from('chart_featured_tracks').select('id, artists, mix_name, label').in('id', chunk),
        )
      : Promise.resolve({ data: [], error: null }),
    vinylIds.length
      ? selectByIds<{ id: string; artists: unknown; mix_name: string | null; label: string | null }>(
          vinylIds,
          (chunk) => sb.from('chart_vinyl_tracks').select('id, artists, mix_name, label').in('id', chunk),
        )
      : Promise.resolve({ data: [], error: null }),
  ])
  const lookupErr = chartRes.error || featRes.error || vinylRes.error
  if (lookupErr) throw new Error(lookupErr.message)

  const live = new Map<string, LiveCredit>()
  const put = (
    source: string,
    list: { id: string; artists: unknown; mix_name: string | null; label: string | null }[],
  ) => {
    for (const row of list) {
      live.set(`${source}:${row.id}`, {
        artists: creditLine(row.artists),
        mix_name: row.mix_name,
        label: row.label,
      })
    }
  }
  put('chart', chartRes.data)
  put('featured', featRes.data)
  put('vinyl', vinylRes.data)

  const agg = new Map<string, { name: string; saves: number; users: Set<string>; tracks: Set<string> }>()

  for (const s of rows) {
    const meta = live.get(`${s.track_source}:${s.track_id}`)
    const artists = meta?.artists || creditLine(s.snap_artists)
    const mixName = meta?.mix_name ?? asText(s.snap_mix)
    const label = meta?.label ?? asText(s.snap_label)
    if (!artists && !mixName && !asText(s.snap_title) && s.track_source !== 'beatport_top') continue
    if (shouldSkipLabelSave(labelCreditSkip, s.user_id, label)) continue

    const credited = new Map<string, string>()
    for (const artistName of splitArtistCreditsForRanking(artists || '')) {
      const artistKey = normalizeArtistKey(artistName)
      if (artistKey && !credited.has(artistKey)) credited.set(artistKey, artistName.trim())
    }
    for (const remixer of extractRemixerNames(mixName)) {
      const artistKey = normalizeArtistKey(remixer)
      if (artistKey && !credited.has(artistKey)) credited.set(artistKey, remixer.trim())
    }
    const trackKey = `${s.track_source}:${s.track_id}`
    for (const [artistKey, artistName] of credited) {
      if (shouldSkipArtistSelfCredit(selfCreditSkip, s.user_id, artistName)) continue
      let row = agg.get(artistKey)
      if (!row) {
        row = { name: artistName, saves: 0, users: new Set(), tracks: new Set() }
        agg.set(artistKey, row)
      }
      row.saves += 1
      row.users.add(s.user_id)
      row.tracks.add(trackKey)
      if (artistName.length > row.name.length) row.name = artistName
    }
  }

  const ranked = Array.from(agg.entries()).sort(
    (a, b) =>
      b[1].saves - a[1].saves ||
      b[1].users.size - a[1].users.size ||
      b[1].tracks.size - a[1].tracks.size ||
      a[1].name.localeCompare(b[1].name),
  )
  return new Set(ranked.slice(0, limit).map(([key]) => key))
}

export type CommunityArtistCounts = {
  saves: number
  fans: number
  tracks: number
}

const BOARD_SAVE_SELECT =
  'user_id, track_source, track_id, canonical_url, created_at, snap_artists:snapshot->artists, snap_mix:snapshot->mix_name, snap_label:snapshot->label, snap_title:snapshot->title, snap_beatport:snapshot->beatport_url, snap_youtube:snapshot->youtube_url'

type BoardSaveRow = SaveRow & {
  canonical_url: string | null
  snap_beatport: unknown
  snap_youtube: unknown
}

type BoardLive = LiveCredit & { url: string | null }

function boardTrackKey(
  source: string,
  id: string,
  liveUrl: string | null,
  row: BoardSaveRow,
): string {
  const snapBeatport = asText(row.snap_beatport)
  const snapYoutube = asText(row.snap_youtube)
  const url =
    source === 'vinyl'
      ? liveUrl || snapYoutube || row.canonical_url
      : source === 'beatport_top'
        ? snapBeatport || row.canonical_url
        : liveUrl || snapBeatport || row.canonical_url
  return normalizeTrackCanonicalUrl(url) || `t:${source}:${id}`
}

/**
 * Mapa completo del tablero de artistas: mismos saltos que el Top 100
 * (fichado, claim, familiar y sello). Una lectura cacheada 5 min para
 * todas las fichas; no es el contador de favoritos de la estrella.
 */
async function loadCommunityArtistBoard(sb: ServiceClient): Promise<Record<string, CommunityArtistCounts>> {
  const [saves, privateProfiles, selfCreditSkip, labelCreditSkip] = await Promise.all([
    fetchAllPagesParallel<BoardSaveRow>(
      () => sb.from('saved_chart_tracks').select('id', { count: 'exact', head: true }),
      (from, to) =>
        sb
          .from('saved_chart_tracks')
          .select(BOARD_SAVE_SELECT)
          .order('created_at', { ascending: true })
          .range(from, to),
    ),
    sb.from('profiles').select('id').eq('is_tracks_public', false),
    loadSelfCreditSkipMap(sb),
    loadLabelCreditSkipMap(sb),
  ])

  const privateSet = new Set(
    ((privateProfiles.data as { id: string }[] | null) ?? []).map((p) => p.id),
  )
  const rows = saves.filter((s) => !privateSet.has(s.user_id))

  const chartIds = rows.filter((s) => s.track_source === 'chart').map((s) => s.track_id)
  const featIds = rows.filter((s) => s.track_source === 'featured').map((s) => s.track_id)
  const vinylIds = rows.filter((s) => s.track_source === 'vinyl').map((s) => s.track_id)

  const [chartRes, featRes, vinylRes] = await Promise.all([
    chartIds.length
      ? selectByIds<{ id: string; artists: unknown; mix_name: string | null; label: string | null; beatport_url: string | null }>(
          chartIds,
          (chunk) => sb.from('chart_tracks').select('id, artists, mix_name, label, beatport_url').in('id', chunk),
        )
      : Promise.resolve({ data: [], error: null }),
    featIds.length
      ? selectByIds<{ id: string; artists: unknown; mix_name: string | null; label: string | null; link_url: string | null }>(
          featIds,
          (chunk) => sb.from('chart_featured_tracks').select('id, artists, mix_name, label, link_url').in('id', chunk),
        )
      : Promise.resolve({ data: [], error: null }),
    vinylIds.length
      ? selectByIds<{ id: string; artists: unknown; mix_name: string | null; label: string | null; youtube_url: string | null }>(
          vinylIds,
          (chunk) => sb.from('chart_vinyl_tracks').select('id, artists, mix_name, label, youtube_url').in('id', chunk),
        )
      : Promise.resolve({ data: [], error: null }),
  ])
  const lookupErr = chartRes.error || featRes.error || vinylRes.error
  if (lookupErr) throw new Error(lookupErr.message)

  const live = new Map<string, BoardLive>()
  for (const row of chartRes.data) {
    live.set(`chart:${row.id}`, {
      artists: creditLine(row.artists),
      mix_name: row.mix_name,
      label: row.label,
      url: row.beatport_url,
    })
  }
  for (const row of featRes.data) {
    live.set(`featured:${row.id}`, {
      artists: creditLine(row.artists),
      mix_name: row.mix_name,
      label: row.label,
      url: row.link_url,
    })
  }
  for (const row of vinylRes.data) {
    live.set(`vinyl:${row.id}`, {
      artists: creditLine(row.artists),
      mix_name: row.mix_name,
      label: row.label,
      url: row.youtube_url,
    })
  }

  const agg = new Map<string, { saves: number; users: Set<string>; tracks: Set<string> }>()

  for (const s of rows) {
    const meta = live.get(`${s.track_source}:${s.track_id}`)
    const artists = meta ? meta.artists : creditLine(s.snap_artists)
    const mixName = meta ? meta.mix_name : asText(s.snap_mix)
    const label = meta ? meta.label : asText(s.snap_label)
    if (!meta && s.track_source !== 'beatport_top' && !artists && !mixName && !asText(s.snap_title)) continue
    if (shouldSkipLabelSave(labelCreditSkip, s.user_id, label)) continue

    const credited = new Map<string, string>()
    for (const artistName of splitArtistCreditsForRanking(artists || '')) {
      const artistKey = normalizeArtistKey(artistName)
      if (artistKey && !credited.has(artistKey)) credited.set(artistKey, artistName.trim())
    }
    for (const remixer of extractRemixerNames(mixName)) {
      const artistKey = normalizeArtistKey(remixer)
      if (artistKey && !credited.has(artistKey)) credited.set(artistKey, remixer.trim())
    }
    const trackKey = boardTrackKey(s.track_source, s.track_id, meta?.url ?? null, s)
    for (const [artistKey, artistName] of credited) {
      if (shouldSkipArtistSelfCredit(selfCreditSkip, s.user_id, artistName)) continue
      let row = agg.get(artistKey)
      if (!row) {
        row = { saves: 0, users: new Set(), tracks: new Set() }
        agg.set(artistKey, row)
      }
      row.saves += 1
      row.users.add(s.user_id)
      row.tracks.add(trackKey)
    }
  }

  const out: Record<string, CommunityArtistCounts> = {}
  for (const [key, row] of agg) {
    if (row.saves < 1) continue
    out[key] = { saves: row.saves, fans: row.users.size, tracks: row.tracks.size }
  }
  return out
}

export async function getCommunityArtistBoard(): Promise<Record<string, CommunityArtistCounts>> {
  try {
    return await unstable_cache(
      () => loadCommunityArtistBoard(createServiceSupabase()),
      ['community-artist-board'],
      { revalidate: 300, tags: [PUBLIC_CATALOG_CACHE_TAG] },
    )()
  } catch (err) {
    console.warn('[community-artist-board]', err instanceof Error ? err.message : err)
    return {}
  }
}

/** Busca el nombre de la ficha, el nombre visible y el slug. */
export function communityCountsForArtist(
  board: Record<string, CommunityArtistCounts>,
  artist: { name: string | null; name_display?: string | null; slug: string },
): CommunityArtistCounts | null {
  const keys = [
    normalizeArtistKey(artist.name || ''),
    normalizeArtistKey(artist.name_display || ''),
    normalizeArtistKey(artist.slug.replace(/-/g, ' ')),
  ]
  for (const key of keys) {
    const hit = key ? board[key] : undefined
    if (hit && hit.saves > 0) return hit
  }
  return null
}

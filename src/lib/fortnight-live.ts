/**
 * Artículo quincenal en directo: escuchas y votos de los temas que salieron
 * en la quincena, acumulados desde su lanzamiento hasta ahora. Mismas reglas
 * que el Top 100 de temas (perfiles privados fuera, auto-voto de fichados,
 * claims y familiares fuera). Caché 5 min: la página no golpea la BD en cada visita.
 */
import { unstable_cache } from 'next/cache'
import { PUBLIC_CATALOG_CACHE_TAG } from '@/lib/revalidate-public'
import { splitArtistDisplayLine } from '@/lib/artist-slug-map'
import { normalizeTrackCanonicalUrl } from '@/lib/track-canonical-key'
import { isArtistSelfCreditSave, loadSelfCreditSkipMap } from '@/lib/artist-self-credit'
import { fetchAllPages } from '@/lib/supabase-paginate'
import { createServiceSupabase, selectByIds } from '@/lib/supabase-admin'
import { articleFreeze, frozenSnapshot, getActivePageFreeze } from '@/lib/public-freeze'
import type { FortnightDigestTrack } from '@/types/database'

/** Cabecera del artículo: los temas más escuchados. Sin mezclar votos. */
const RELEASED_N = 20

type FeatRow = {
  id: string
  chart_edition_id: string | null
  title: string
  mix_name: string | null
  artists: unknown
  label: string | null
  bpm: number | null
  music_key: string | null
  release_date: string | null
  link_url: string | null
  platform: string | null
  artwork_url: string | null
  sample_url: string | null
  full_audio_url: string | null
  spotify_url: string | null
  tidal_url: string | null
}

type SaveRow = { id: string; user_id: string; track_source: string; track_id: string; canonical_url: string | null }

export type FortnightPlayedArtist = { name: string; plays: number; tracks: number }

export type FortnightLive = {
  released: FortnightDigestTrack[]
  played: FortnightDigestTrack[]
  voted: FortnightDigestTrack[]
  played_artists: FortnightPlayedArtist[]
  votes_total: number
  voters_total: number
  updated_at: string
  /** Solo en una foto congelada: hasta cuándo no se mueve. */
  frozen_until?: string | null
}

function artistsLine(a: unknown): string {
  if (!Array.isArray(a)) return ''
  return a
    .map((x) => (x && typeof x === 'object' ? (x as { name?: string }).name : x))
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(', ')
}

/** Mismo orden que buildFeaturedBundle de /charts (y que el generador). */
function audioSrc(f: FeatRow): string | null {
  if (f.platform === 'bandcamp' && f.link_url) return `/api/bandcamp-preview?track=${encodeURIComponent(f.link_url)}`
  if (f.full_audio_url) return f.full_audio_url
  if (!f.sample_url || f.platform === 'soundcloud') return null
  try {
    const host = new URL(f.sample_url).hostname.toLowerCase()
    if (host === 'geo-samples.beatport.com' || host === 'geo-media.beatport.com') {
      return `/api/audio-proxy?url=${encodeURIComponent(f.sample_url)}`
    }
  } catch { /* url cruda */ }
  return f.sample_url
}

/** Sin caché: lo usa el script de la lista Temazos 2026 (fuera de Next). */
export async function loadFortnightLive(from: string, until: string, topN: number): Promise<FortnightLive> {
  const sb = createServiceSupabase()

  const featAll = await fetchAllPages<FeatRow>((a, b) =>
    sb
      .from('chart_featured_tracks')
      .select('id, chart_edition_id, title, mix_name, artists, label, bpm, music_key, release_date, link_url, platform, artwork_url, sample_url, full_audio_url, spotify_url, tidal_url')
      .gte('release_date', from)
      .lte('release_date', until)
      .order('id')
      .range(a, b),
  )
  const editionIds = [...new Set(featAll.map((f) => f.chart_edition_id).filter((x): x is string => !!x))]
  const editions = await selectByIds<{ id: string; week_date: string; is_published: boolean | null }>(editionIds, (chunk) =>
    sb.from('chart_editions').select('id, week_date, is_published').in('id', chunk),
  )
  if (editions.error) throw new Error(editions.error.message)
  const weekBy = new Map(editions.data.map((e) => [e.id, e.week_date]))
  const unpublished = new Set(editions.data.filter((e) => e.is_published === false).map((e) => e.id))
  const feat = featAll.filter((f) => !f.chart_edition_id || !unpublished.has(f.chart_edition_id))

  const byKey = new Map<string, FeatRow>()
  const keyById = new Map<string, string>()
  for (const f of feat) {
    const k = normalizeTrackCanonicalUrl(f.link_url)
    if (!k || byKey.has(k)) continue
    byKey.set(k, f)
    keyById.set(f.id, k)
  }
  const keys = [...byKey.keys()]
  const links = [...new Set(feat.map((f) => f.link_url).filter((x): x is string => !!x))]

  const [playRes, byId, byUrl, privateRes, selfSkip] = await Promise.all([
    keys.length
      ? sb.rpc('track_play_counts_for_keys' as never, { p_keys: [...keys, ...keys.map((k) => `${k}/`)] } as never)
      : Promise.resolve({ data: [], error: null }),
    selectByIds<SaveRow>([...keyById.keys()], (chunk) =>
      sb.from('saved_chart_tracks').select('id, user_id, track_source, track_id, canonical_url').eq('track_source', 'featured').in('track_id', chunk),
    ),
    selectByIds<SaveRow>(links, (chunk) =>
      sb.from('saved_chart_tracks').select('id, user_id, track_source, track_id, canonical_url').in('canonical_url', chunk),
    ),
    sb.from('profiles').select('id').eq('is_tracks_public', false),
    loadSelfCreditSkipMap(sb),
  ])
  if (byId.error || byUrl.error) throw new Error((byId.error || byUrl.error)!.message)

  const plays = new Map<string, number>()
  for (const row of ((playRes.data as { canonical_key: string; play_count: number }[] | null) ?? [])) {
    const k = row.canonical_key.replace(/\/$/, '')
    plays.set(k, (plays.get(k) || 0) + (Number(row.play_count) || 0))
  }

  const privateSet = new Set(((privateRes.data as { id: string }[] | null) ?? []).map((p) => p.id))
  const seen = new Set<string>()
  const votes = new Map<string, { users: Set<string>; saves: number }>()
  const voters = new Set<string>()
  let votesTotal = 0
  for (const s of [...byId.data, ...byUrl.data]) {
    if (seen.has(s.id) || privateSet.has(s.user_id)) continue
    seen.add(s.id)
    const k = (s.track_source === 'featured' && keyById.get(s.track_id)) || normalizeTrackCanonicalUrl(s.canonical_url)
    const f = byKey.get(k)
    if (!f) continue
    if (isArtistSelfCreditSave(selfSkip, s.user_id, artistsLine(f.artists), f.mix_name)) continue
    const v = votes.get(k) ?? { users: new Set<string>(), saves: 0 }
    v.users.add(s.user_id)
    v.saves += 1
    votes.set(k, v)
    voters.add(s.user_id)
    votesTotal += 1
  }

  const toTrack = (f: FeatRow, value: number): FortnightDigestTrack => ({
    title: f.title,
    mix_name: f.mix_name || null,
    artists: artistsLine(f.artists),
    artwork_url: f.artwork_url || null,
    label: f.label || null,
    release_date: f.release_date || null,
    value,
    featured_id: f.id,
    week_date: (f.chart_edition_id && weekBy.get(f.chart_edition_id)) || null,
    external_url: f.link_url || null,
    audio_src: audioSrc(f),
    bpm: f.bpm ?? null,
    music_key: f.music_key || null,
    spotify_url: f.spotify_url ?? null,
    tidal_url: f.tidal_url ?? null,
  })

  const played = [...plays.entries()]
    .filter(([k, n]) => n > 0 && byKey.has(k))
    .sort((a, b) => b[1] - a[1] || byKey.get(a[0])!.title.localeCompare(byKey.get(b[0])!.title))
    .slice(0, topN)
    .map(([k, n]) => toTrack(byKey.get(k)!, n))

  const artistPlays = new Map<string, { plays: number; tracks: number }>()
  for (const [k, n] of plays) {
    if (n <= 0 || !byKey.has(k)) continue
    const names = [...new Set(splitArtistDisplayLine(artistsLine(byKey.get(k)!.artists)))]
    for (const name of names) {
      const row = artistPlays.get(name) ?? { plays: 0, tracks: 0 }
      row.plays += n
      row.tracks += 1
      artistPlays.set(name, row)
    }
  }
  const playedArtists = [...artistPlays.entries()]
    .sort((a, b) => b[1].plays - a[1].plays || b[1].tracks - a[1].tracks || a[0].localeCompare(b[0], 'es'))
    .slice(0, 8)
    .map(([name, v]) => ({ name, plays: v.plays, tracks: v.tracks }))

  const voted = [...votes.entries()]
    .sort(
      (a, b) =>
        b[1].users.size - a[1].users.size ||
        b[1].saves - a[1].saves ||
        (plays.get(b[0]) || 0) - (plays.get(a[0]) || 0) ||
        byKey.get(a[0])!.title.localeCompare(byKey.get(b[0])!.title),
    )
    .slice(0, topN)
    .map(([k, v]) => toTrack(byKey.get(k)!, v.users.size))

  // Cabecera: un tema por tarjeta, solo por escuchas. Los votos van en su lista, más abajo.
  const released = [...plays.entries()]
    .filter(([k, n]) => n > 0 && byKey.has(k))
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        (byKey.get(b[0])!.release_date || '').localeCompare(byKey.get(a[0])!.release_date || '') ||
        byKey.get(a[0])!.title.localeCompare(byKey.get(b[0])!.title),
    )
    .slice(0, RELEASED_N)
    .map(([k]) => toTrack(byKey.get(k)!, plays.get(k) || 0))

  return {
    released,
    played,
    voted,
    played_artists: playedArtists,
    votes_total: votesTotal,
    voters_total: voters.size,
    updated_at: new Date().toISOString(),
  }
}

/**
 * null si la BD falla: la página cae al recuento guardado en el digest.
 * Con `article`, sus 72 h primeras enseñan la foto del primer render tras publicar.
 * Con los tops congelados, también la foto. `frozen_until` dice hasta cuándo.
 */
export async function getFortnightLive(
  from: string,
  until: string,
  topN = 10,
  article?: { slug: string; publishedAt: string | null },
): Promise<FortnightLive | null> {
  try {
    const freeze = (article ? articleFreeze(article.slug, article.publishedAt) : null) ?? (await getActivePageFreeze())
    if (freeze) {
      try {
        const snap = await frozenSnapshot(freeze, `fortnight:${from}:${until}:${topN}`, () => loadFortnightLive(from, until, topN))
        return { ...snap.data, frozen_until: freeze.until }
      } catch (err) {
        console.warn('[fortnight-live] foto', err instanceof Error ? err.message : err)
      }
    }
    return await unstable_cache(() => loadFortnightLive(from, until, topN), ['fortnight-live', from, until, String(topN)], {
      revalidate: 300,
      tags: [PUBLIC_CATALOG_CACHE_TAG],
    })()
  } catch (err) {
    console.warn('[fortnight-live]', err instanceof Error ? err.message : err)
    return null
  }
}

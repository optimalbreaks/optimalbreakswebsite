/**
 * Artículo quincenal en directo: escuchas y votos de los temas que salieron
 * en la quincena, acumulados desde su lanzamiento hasta ahora. Mismas reglas
 * que el Top 100 de temas (perfiles privados fuera, auto-voto de fichados,
 * claims y familiares fuera). Caché 5 min: la página no golpea la BD en cada visita.
 */
import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PUBLIC_CATALOG_CACHE_TAG } from '@/lib/revalidate-public'
import { splitArtistDisplayLine } from '@/lib/artist-slug-map'
import { normalizeTrackCanonicalUrl } from '@/lib/track-canonical-key'
import { isArtistSelfCreditSave, loadSelfCreditSkipMap } from '@/lib/artist-self-credit'
import { fetchAllPages, fetchAllPagesParallel } from '@/lib/supabase-paginate'
import { createServiceSupabase, selectByIds } from '@/lib/supabase-admin'
import { articleFreeze, frozenSnapshot, getActivePageFreeze } from '@/lib/public-freeze'
import type { Database, FortnightDigest, FortnightDigestTrack } from '@/types/database'

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

type DayFeat = FeatRow & {
  chart_editions: { week_date: string; is_published: boolean } | { week_date: string; is_published: boolean }[] | null
}

function editionOf(row: DayFeat): { week_date: string } | null {
  const embedded = row.chart_editions
  if (!embedded) return null
  return Array.isArray(embedded) ? embedded[0] ?? null : embedded
}

/** Cuenta editorial. Sus «+» son la selección de Optimal Breaks del artículo del día. */
const EDITOR_USER_ID = '68c6457d-3141-4e13-a2be-73fdd76631de'

export type DayReleaseGroups = { picks: FortnightDigestTrack[]; rest: FortnightDigestTrack[] }

export const MIN_RELEASE_DAY = '1990-01-01'

export function clampReleaseDay(raw: string, today: string): string {
  const d = raw.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return today
  if (d > today) return today
  if (d < MIN_RELEASE_DAY) return MIN_RELEASE_DAY
  return d
}

export function shiftReleaseDay(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** Español: día, mes, año. Inglés: mes, día, año. */
export function longReleaseDay(ymd: string, lang: 'es' | 'en'): string {
  const text = new Date(`${ymd}T12:00:00Z`).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

async function editorSavedKeys(ids: string[], urls: string[]): Promise<Set<string>> {
  const saved = new Set<string>()
  if (ids.length === 0 && urls.length === 0) return saved
  const sb = createServiceSupabase()
  for (let i = 0; i < Math.max(ids.length, urls.length); i += 80) {
    const idChunk = ids.slice(i, i + 80)
    const urlChunk = urls.slice(i, i + 80)
    const [byId, byUrl] = await Promise.all([
      idChunk.length
        ? sb.from('saved_chart_tracks').select('track_id').eq('user_id', EDITOR_USER_ID).in('track_id', idChunk)
        : Promise.resolve({ data: [] as { track_id: string }[], error: null }),
      urlChunk.length
        ? sb.from('saved_chart_tracks').select('canonical_url').eq('user_id', EDITOR_USER_ID).in('canonical_url', urlChunk)
        : Promise.resolve({ data: [] as { canonical_url: string | null }[], error: null }),
    ])
    if (byId.error || byUrl.error) throw new Error((byId.error || byUrl.error)?.message)
    for (const row of byId.data || []) if (row.track_id) saved.add(row.track_id)
    for (const row of byUrl.data || []) {
      if (!row.canonical_url) continue
      saved.add(row.canonical_url)
      const key = normalizeTrackCanonicalUrl(row.canonical_url)
      if (key) saved.add(key)
    }
  }
  return saved
}

/** Canciones de la web con esa fecha de salida. `picks` = «+» de Optimal Breaks. */
export async function loadDayReleases(sb: SupabaseClient<Database>, day: string): Promise<DayReleaseGroups> {
  let rows: DayFeat[]
  try {
    rows = await fetchAllPages<DayFeat>((a, b) =>
      sb
        .from('chart_featured_tracks')
        .select(
          'id, chart_edition_id, title, mix_name, artists, label, bpm, music_key, release_date, link_url, platform, artwork_url, sample_url, full_audio_url, spotify_url, tidal_url, chart_editions!inner(week_date, is_published)',
        )
        .eq('release_date', day)
        .eq('chart_editions.is_published', true)
        .order('id', { ascending: true })
        .range(a, b),
    )
  } catch (err) {
    console.warn('[day-releases]', err instanceof Error ? err.message : err)
    return { picks: [], rest: [] }
  }
  const out: FortnightDigestTrack[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const edition = editionOf(row)
    const key = normalizeTrackCanonicalUrl(row.link_url) || row.id
    if (seen.has(key)) continue
    seen.add(key)
    const weekBy = new Map<string, string>()
    if (row.chart_edition_id && edition?.week_date) weekBy.set(row.chart_edition_id, edition.week_date)
    out.push(digestTrack(row, 0, weekBy))
  }
  const byName = (a: FortnightDigestTrack, b: FortnightDigestTrack) =>
    a.artists.localeCompare(b.artists, 'es') ||
    a.title.localeCompare(b.title, 'es') ||
    (a.mix_name || '').localeCompare(b.mix_name || '', 'es')
  let saved = new Set<string>()
  try {
    saved = await editorSavedKeys(
      out.map((t) => t.featured_id).filter((id): id is string => !!id),
      out.map((t) => t.external_url).filter((url): url is string => !!url),
    )
  } catch (err) {
    console.warn('[day-releases]', err instanceof Error ? err.message : err)
  }
  const picked = (t: FortnightDigestTrack) => {
    if (t.featured_id && saved.has(t.featured_id)) return true
    if (!t.external_url) return false
    return saved.has(t.external_url) || saved.has(normalizeTrackCanonicalUrl(t.external_url))
  }
  const picks = out.filter(picked).sort(byName)
  const rest = out.filter((t) => !picked(t)).sort(byName)
  return { picks, rest }
}

function digestTrack(f: FeatRow, value: number, weekBy: Map<string, string>): FortnightDigestTrack {
  return {
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
  }
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

  const toTrack = (f: FeatRow, value: number) => digestTrack(f, value, weekBy)

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

// ── Cifras del periodo en directo (artículo del mes) ─────────────────────
// Mismo cálculo que `computeQuincena` en scripts/generar-blog-agente.mjs: solo
// temas con fecha de salida en el periodo, aunque se añadan después de publicar.

export type PeriodStats = Pick<FortnightDigest, 'totals' | 'top100' | 'artists' | 'labels' | 'sound' | 'debut' | 'debut_total'>

const AGGREGATOR_LABELS = new Set([
  'distrokid', 'tunecore', 'cd baby', 'amuse', 'routenote',
  'united masters', 'unitedmasters', 'artistfy', 'create music group',
])

const normName = (s: string | null | undefined) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

function creditNames(a: unknown): string[] {
  if (!Array.isArray(a)) return []
  return a
    .map((x) => (x && typeof x === 'object' ? (x as { name?: string }).name : x))
    .map((x) => String(x || '').trim())
    .filter(Boolean)
}

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1)
const topOf = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
const mean = (a: number[]) => (a.length ? Number((a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)) : null)

type BoardArtist = { rank: number; name: string; slug?: string | null; image_url?: string | null }

async function loadBoardArtists(): Promise<BoardArtist[]> {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://www.optimalbreaks.com').replace(/\/$/, '')
  try {
    const res = await fetch(`${site}/api/public/charts/community-monthly?limit=5&artists=100&cached=1`, { next: { revalidate: 300 } })
    if (!res.ok) return []
    const j = (await res.json()) as { top_artists?: BoardArtist[] }
    return j.top_artists ?? []
  } catch {
    return []
  }
}

export async function loadPeriodStats(from: string, until: string, prevFrom: string): Promise<PeriodStats> {
  const sb = createServiceSupabase()
  const cols = 'id, chart_edition_id, title, mix_name, artists, label, bpm, music_key, release_date, link_url, platform, artwork_url, sample_url, full_audio_url, spotify_url, tidal_url'
  const [winAll, prevAll, beforeAll, editions, artistRows, labelRows, board] = await Promise.all([
    fetchAllPages<FeatRow>((a, b) =>
      sb.from('chart_featured_tracks').select(cols).gte('release_date', from).lte('release_date', until).order('id').range(a, b),
    ),
    fetchAllPages<{ chart_edition_id: string | null; bpm: number | null }>((a, b) =>
      sb.from('chart_featured_tracks').select('id, chart_edition_id, bpm').gte('release_date', prevFrom).lt('release_date', from).order('id').range(a, b),
    ),
    fetchAllPagesParallel<{ chart_edition_id: string | null; artists: unknown }>(
      () => sb.from('chart_featured_tracks').select('id', { count: 'exact', head: true }).lt('release_date', from),
      (a, b) => sb.from('chart_featured_tracks').select('id, chart_edition_id, artists').lt('release_date', from).order('id').range(a, b),
      1000,
    ),
    fetchAllPages<{ id: string; week_date: string; is_published: boolean | null }>((a, b) =>
      sb.from('chart_editions').select('id, week_date, is_published').order('id').range(a, b),
    ),
    fetchAllPages<{ slug: string; name: string | null; name_display: string | null }>((a, b) =>
      sb.from('artists').select('id, slug, name, name_display').order('id').range(a, b),
    ),
    fetchAllPages<{ slug: string; name: string | null }>((a, b) => sb.from('labels').select('id, slug, name').order('id').range(a, b)),
    loadBoardArtists(),
  ])

  const unpublished = new Set(editions.filter((e) => e.is_published === false).map((e) => e.id))
  const weekBy = new Map(editions.map((e) => [e.id, e.week_date]))
  const live = <T extends { chart_edition_id: string | null }>(rows: T[]) =>
    rows.filter((f) => !f.chart_edition_id || !unpublished.has(f.chart_edition_id))
  const win = live(winAll).map((f) => ({ f, names: creditNames(f.artists) }))
  const prev = live(prevAll)

  const artistBy = new Map<string, string>()
  for (const a of artistRows) for (const n of [a.name, a.name_display]) if (n && !artistBy.has(normName(n))) artistBy.set(normName(n), a.slug)
  const labelBy = new Map(labelRows.map((l) => [normName(l.name), l.slug]))
  const slugOf = (n: string) => artistBy.get(normName(n)) || null

  // Un disco = mismo sello, mismo día y mismo primer artista.
  const releases = new Map<string, FeatRow[]>()
  for (const { f, names } of win) {
    const key = `${normName(f.label)}|${f.release_date}|${normName(names[0])}`
    releases.set(key, [...(releases.get(key) ?? []), f])
  }
  const perArtistTracks = new Map<string, number>()
  const perArtistReleases = new Map<string, Set<string>>()
  for (const { f, names } of win) {
    const key = `${normName(f.label)}|${f.release_date}|${normName(names[0])}`
    for (const n of names) {
      bump(perArtistTracks, n)
      perArtistReleases.set(n, (perArtistReleases.get(n) ?? new Set()).add(key))
    }
  }

  const labels = new Map<string, number>()
  for (const { f } of win) if (f.label && !AGGREGATOR_LABELS.has(normName(f.label))) bump(labels, f.label)

  const bpms = win.map(({ f }) => Number(f.bpm)).filter(Boolean)
  const bands = new Map<string, number>()
  for (const b of bpms) {
    const lo = Math.floor(b / 5) * 5
    bump(bands, `${lo}–${lo + 4}`)
  }
  const keys = new Map<string, number>()
  for (const { f } of win) if (f.music_key) bump(keys, f.music_key)

  const seenBefore = new Set(live(beforeAll).flatMap((r) => creditNames(r.artists).map(normName)))
  const debutantes = [...perArtistTracks.keys()].filter((n) => !seenBefore.has(normName(n)))

  const winByArtist = new Map<string, FeatRow[]>()
  for (const { f, names } of win) for (const n of names) winByArtist.set(normName(n), [...(winByArtist.get(normName(n)) ?? []), f])

  return {
    totals: {
      tracks: win.length,
      artists: perArtistTracks.size,
      labels: new Set(win.map(({ f }) => f.label).filter(Boolean)).size,
      releases: releases.size,
      prev_tracks: prev.length,
    },
    top100: board
      .filter((a) => winByArtist.has(normName(a.name)))
      .slice(0, 8)
      .map((a) => ({
        rank: a.rank,
        name: a.name,
        slug: a.slug || slugOf(a.name),
        image_url: a.image_url || null,
        tracks: winByArtist.get(normName(a.name))!.slice(0, 6).map((f) => digestTrack(f, 0, weekBy)),
      })),
    artists: [...perArtistTracks.entries()]
      .map(([name, tracks]) => ({ name, tracks, releases: perArtistReleases.get(name)?.size || 0 }))
      .sort((a, b) => b.tracks - a.tracks || b.releases - a.releases)
      .slice(0, 8)
      .map((a) => ({ ...a, slug: slugOf(a.name) })),
    labels: topOf(labels, 8).map(([name, tracks]) => ({ name, slug: labelBy.get(normName(name)) || null, tracks })),
    sound: {
      avg_bpm: mean(bpms),
      prev_avg_bpm: mean(prev.map((f) => Number(f.bpm)).filter(Boolean)),
      bands: [...bands.entries()]
        .filter(([, c]) => c >= 2)
        .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
        .map(([band, count]) => ({ band, count })),
      keys: topOf(keys, 6).map(([key, count]) => ({ key, count })),
    },
    debut: debutantes.slice(0, 24).map((name) => ({ name, slug: slugOf(name) })),
    debut_total: debutantes.length,
  }
}

/** null si la BD falla: la página se queda con las cifras guardadas en el digest. */
export async function getPeriodStats(from: string, until: string, prevFrom: string): Promise<PeriodStats | null> {
  try {
    return await unstable_cache(() => loadPeriodStats(from, until, prevFrom), ['period-stats', from, until, prevFrom], {
      revalidate: 300,
      tags: [PUBLIC_CATALOG_CACHE_TAG],
    })()
  } catch (err) {
    console.warn('[period-stats]', err instanceof Error ? err.message : err)
    return null
  }
}

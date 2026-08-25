// ============================================
// OPTIMAL BREAKS — Top de la comunidad (all-time)
// ----------------------------------------------
// Devuelve el ranking acumulado de canciones más añadidas a "Mis Tracks"
// (tabla `saved_chart_tracks`) por toda la comunidad, sin ventana temporal.
// Reutiliza la lógica de claves canónicas del endpoint admin
// (`/api/admin/tracks`) para que las cuatro fuentes de origen
// (chart_tracks, chart_featured_tracks, chart_vinyl_tracks y los saves
// estilo `beatport_top` con metadatos en snapshot) se agreguen como la
// misma canción si comparten URL canónica.
//
// Uso: GET /api/public/charts/community-monthly[?limit=N]
//
//   - limit: opcional, 5–100 (default 40) — solo afecta top_tracks.
//   - top_artists: top 50 por créditos de save (la UI enseña 10 y «Cargar más»).
//     Cada fila lleva movimiento semanal reconstruido desde `created_at`
//     (lunes ISO UTC): previous_rank (null = no estaba en el top 50 al
//     empezar la semana), weeks_in_top10 (semanas seguidas en este tablero),
//     weeks_at_1, image_url (retrato resuelto) y country. No hay tabla de snapshots.
//     Un save de un usuario fichado editorialmente o con claim aprobado no
//     acredita SU propio nombre (sí el de colaboradores; el Top 100 de temas
//     no se toca). Ver `artist-self-credit.ts` + `editorial_artist_marks`.
//
// Nota histórica: el endpoint y el archivo mantienen el slug
// `community-monthly` por compatibilidad — antes este top era mensual y
// se cambió a all-time tras detectar que la ventana de mes calendario
// secaba el ranking en cuanto la base de usuarios «agotaba» el catálogo
// del mes (ver decisión en chat). El selector de mes y el histograma
// `available_months` desaparecieron con ese cambio.
//
// Bypassa RLS vía service-role porque `saved_chart_tracks` solo permite
// leer los propios y aquí necesitamos ver los de toda la comunidad.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase-admin'
import {
  buildFullArtistSlugMap,
  normalizeArtistKey,
} from '@/lib/artist-slug-map'
import { displayArtistImageUrl } from '@/lib/artist-public-portrait'
import {
  loadSelfCreditSkipMap,
  shouldSkipArtistSelfCredit,
  splitArtistCreditsForRanking,
} from '@/lib/artist-self-credit'
import { extractRemixerNames } from '@/lib/remixer-credits'

const TOP_ARTISTS_LIMIT = 50
/** PostgREST corta en 1000 filas; `.in('id', …)` largo tumba o recorta el GET. */
const IN_CHUNK = 200

type ArtistAgg = {
  name: string
  save_count: number
  _users: Set<string>
  _tracks: Set<string>
}

type ArtistCredit = {
  key: string
  name: string
  userId: string
  trackKey: string
  createdMs: number
}

function ymdUtc(d: Date): string {
  const yy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Lunes ISO (UTC) de la semana que contiene `from`. */
function isoMondayUtc(from: Date): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1))
  return ymdUtc(d)
}

function addDaysYmdUtc(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return ymdUtc(dt)
}

function mondayCutoffMs(mondayYmd: string): number {
  return Date.parse(`${mondayYmd}T00:00:00.000Z`)
}

function bumpArtistInto(map: Map<string, ArtistAgg>, artistName: string, userId: string, trackKey: string) {
  const key = normalizeArtistKey(artistName)
  if (!key) return
  let row = map.get(key)
  if (!row) {
    row = {
      name: artistName.trim(),
      save_count: 0,
      _users: new Set(),
      _tracks: new Set(),
    }
    map.set(key, row)
  }
  row.save_count += 1
  row._users.add(userId)
  row._tracks.add(trackKey)
  if (artistName.trim().length > row.name.length) row.name = artistName.trim()
}

function artistRankMap(agg: Map<string, ArtistAgg>, limit = TOP_ARTISTS_LIMIT): Map<string, number> {
  const ranked = Array.from(agg.entries()).sort(([, a], [, b]) =>
    b.save_count - a.save_count ||
    b._users.size - a._users.size ||
    b._tracks.size - a._tracks.size ||
    a.name.localeCompare(b.name),
  )
  const out = new Map<string, number>()
  for (let i = 0; i < ranked.length && i < limit; i++) {
    out.set(ranked[i][0], i + 1)
  }
  return out
}

/**
 * Snapshots del top 10 al inicio de cada lunes ISO (créditos con createdAt < lunes 00:00 UTC).
 * El ranking «ahora» no entra aquí: se calcula con todos los saves.
 */
function artistMondaySnapshots(credits: ArtistCredit[], thisMonday: string): Map<string, Map<string, number>> {
  const snapshots = new Map<string, Map<string, number>>()
  const dated = credits.filter((c) => Number.isFinite(c.createdMs) && c.createdMs > 0)
  if (!dated.length) return snapshots
  let minMs = dated[0].createdMs
  for (const c of dated) if (c.createdMs < minMs) minMs = c.createdMs
  const firstMonday = isoMondayUtc(new Date(minMs))
  const sorted = credits
    .map((c) => ({ ...c, createdMs: c.createdMs > 0 ? c.createdMs : minMs }))
    .sort((a, b) => a.createdMs - b.createdMs)
  const agg = new Map<string, ArtistAgg>()
  let i = 0
  for (let monday = firstMonday; monday <= thisMonday; monday = addDaysYmdUtc(monday, 7)) {
    const cutoff = mondayCutoffMs(monday)
    while (i < sorted.length && sorted[i].createdMs < cutoff) {
      const c = sorted[i]
      bumpArtistInto(agg, c.name, c.userId, c.trackKey)
      i++
    }
    snapshots.set(monday, artistRankMap(agg))
  }
  return snapshots
}

function consecutiveWeeks(
  key: string,
  thisMonday: string,
  snapshots: Map<string, Map<string, number>>,
  predicate: (rank: number | undefined) => boolean,
): number {
  let weeks = 0
  for (let monday = thisMonday; snapshots.has(monday); monday = addDaysYmdUtc(monday, -7)) {
    if (!predicate(snapshots.get(monday)?.get(key))) break
    weeks += 1
  }
  return weeks
}

async function selectByIds<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await run(ids.slice(i, i + IN_CHUNK))
    if (error) return { data: out, error }
    if (data?.length) out.push(...data)
  }
  return { data: out, error: null }
}

type ChartTrackSource = 'chart' | 'featured' | 'vinyl' | 'beatport_top'
type PlaybackKind = 'beatport' | 'bandcamp' | 'youtube'

/** Desde `snapshot.origin` de saves `beatport_top` — emite el API para compartir ficha OB. */
type BeatportShareOrigin = { kind: 'artist' | 'label'; slug: string }

type SavedRow = {
  user_id: string
  track_source: ChartTrackSource
  track_id: string
  canonical_url: string | null
  snapshot: Record<string, unknown> | null
  created_at: string | null
}

type ChartRow = {
  id: string
  chart_edition_id: string | null
  title: string
  mix_name: string | null
  artists: unknown
  label: string | null
  release_year: number | null
  release_date: string | null
  bpm: number | null
  music_key: string | null
  artwork_url: string | null
  beatport_url: string | null
  spotify_url: string | null
  tidal_url: string | null
  sample_url: string | null
}
type FeatRow = {
  id: string
  chart_edition_id: string | null
  title: string
  mix_name: string | null
  artists: unknown
  label: string | null
  release_year: number | null
  release_date: string | null
  bpm: number | null
  music_key: string | null
  artwork_url: string | null
  link_url: string | null
  link_label: string | null
  platform: string | null
  spotify_url: string | null
  tidal_url: string | null
  sample_url: string | null
}
type VinylRow = {
  id: string
  title: string
  mix_name: string | null
  artists: unknown
  label: string | null
  year: number | null
  artwork_url: string | null
  discogs_url: string | null
  youtube_url: string | null
}
type EditionRow = { id: string; week_date: string }

function artistsToString(a: unknown): string {
  if (!Array.isArray(a)) return ''
  return a
    .map((x) => (x && typeof x === 'object' ? (x as { name?: string }).name : x))
    .filter(Boolean)
    .join(', ')
}

function normalizeUrl(u: string | null | undefined): string {
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

function youtubeUrlFromCanonicalKey(key: string): string | null {
  if (key.startsWith('yt:')) return `https://www.youtube.com/watch?v=${key.slice(3)}`
  return null
}

interface Aggregate {
  canonical_key: string
  title: string
  mix_name: string | null
  artists: string
  label: string | null
  year: number | null
  release_date: string | null
  bpm: number | null
  music_key: string | null
  artwork_url: string | null
  external_url: string | null
  youtube_url: string | null
  spotify_url: string | null
  tidal_url: string | null
  playback_kind: PlaybackKind
  sample_url: string | null
  save_count: number
  unique_users: number
  first_saved_at: string | null
  last_saved_at: string | null
  sources: ChartTrackSource[]
  primary: { source: ChartTrackSource; id: string; week_date: string | null }
  /** Mejor `snapshot.origin` visto entre saves beatport_top del grupo (misma canción). */
  beatport_share_origin: BeatportShareOrigin | null
  _users: Set<string>
}

function beatportShareOriginFromSnapshot(snap: Record<string, unknown> | null | undefined): BeatportShareOrigin | null {
  if (!snap || typeof snap !== 'object') return null
  const o = snap.origin as Record<string, unknown> | undefined
  if (!o || typeof o !== 'object') return null
  const kind = o.kind
  const slug = o.slug
  if (kind !== 'artist' && kind !== 'label') return null
  if (typeof slug !== 'string' || !slug.trim()) return null
  return { kind, slug: slug.trim() }
}

function beatportShareOriginFromSavedRow(s: SavedRow): BeatportShareOrigin | null {
  if (s.track_source !== 'beatport_top') return null
  return beatportShareOriginFromSnapshot((s.snapshot || {}) as Record<string, unknown>)
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const limit = Math.min(100, Math.max(5, Number(url.searchParams.get('limit')) || 40))

  let sb: ReturnType<typeof createServiceSupabase>
  try {
    sb = createServiceSupabase()
  } catch {
    return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 })
  }

  // Lista global de perfiles "privados" (is_tracks_public = false): se
  // excluyen del cómputo del top, igual que en el cálculo de afinidad.
  const { data: privateProfiles } = await sb
    .from('profiles')
    .select('id')
    .eq('is_tracks_public', false)
  const privateSet = new Set(
    ((privateProfiles as { id: string }[] | null) ?? []).map((p) => p.id),
  )

  // Saves de toda la historia. Paginamos a mano para no toparnos con el
  // límite por defecto del cliente Supabase (1000) cuando la tabla crezca.
  const PAGE = 1000
  const savedRaw: SavedRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb
      .from('saved_chart_tracks')
      .select('user_id, track_source, track_id, canonical_url, snapshot, created_at')
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = ((data as unknown) as SavedRow[]) || []
    savedRaw.push(...rows)
    if (rows.length < PAGE) break
  }

  const saved = savedRaw.filter((s) => !privateSet.has(s.user_id))

  if (saved.length === 0) {
    return NextResponse.json({
      scope: 'all_time',
      totals: { saves: 0, unique_tracks: 0, unique_users: 0 },
      top_tracks: [],
      top_artists: [],
    })
  }

  const selfCreditSkip = await loadSelfCreditSkipMap(sb)

  const chartIds = Array.from(new Set(saved.filter((s) => s.track_source === 'chart').map((s) => s.track_id)))
  const featIds = Array.from(new Set(saved.filter((s) => s.track_source === 'featured').map((s) => s.track_id)))
  const vinylIds = Array.from(new Set(saved.filter((s) => s.track_source === 'vinyl').map((s) => s.track_id)))

  const [chartRes, featRes, vinylRes] = await Promise.all([
    chartIds.length
      ? selectByIds<ChartRow>(chartIds, (chunk) =>
          sb
            .from('chart_tracks')
            .select('id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, beatport_url, spotify_url, tidal_url, sample_url')
            .in('id', chunk),
        )
      : Promise.resolve({ data: [] as ChartRow[], error: null }),
    featIds.length
      ? selectByIds<FeatRow>(featIds, (chunk) =>
          sb
            .from('chart_featured_tracks')
            .select('id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, link_url, link_label, platform, spotify_url, tidal_url, sample_url')
            .in('id', chunk),
        )
      : Promise.resolve({ data: [] as FeatRow[], error: null }),
    vinylIds.length
      ? selectByIds<VinylRow>(vinylIds, (chunk) =>
          sb
            .from('chart_vinyl_tracks')
            .select('id, title, mix_name, artists, label, year, artwork_url, discogs_url, youtube_url')
            .in('id', chunk),
        )
      : Promise.resolve({ data: [] as VinylRow[], error: null }),
  ])
  const lookupErr = chartRes.error || featRes.error || vinylRes.error
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 })

  // Auto-resolución de huérfanos por canonical_url: para saves cuyo track_id
  // ya no existe pero que tienen URL canónica, buscamos la fila viva por URL
  // y la añadimos a las listas (sin auto-heal aquí, eso lo hace user-tracks).
  const liveChartIds = new Set(((chartRes.data || []) as ChartRow[]).map((r) => r.id))
  const liveFeatIds = new Set(((featRes.data || []) as FeatRow[]).map((r) => r.id))
  const liveVinylIds = new Set(((vinylRes.data || []) as VinylRow[]).map((r) => r.id))
  const orphChart = saved.filter((s) => s.track_source === 'chart' && !liveChartIds.has(s.track_id) && !!s.canonical_url)
  const orphFeat = saved.filter((s) => s.track_source === 'featured' && !liveFeatIds.has(s.track_id) && !!s.canonical_url)
  const orphVinyl = saved.filter((s) => s.track_source === 'vinyl' && !liveVinylIds.has(s.track_id) && !!s.canonical_url)
  if (orphChart.length || orphFeat.length || orphVinyl.length) {
    const [extraChart, extraFeat, extraVinyl] = await Promise.all([
      orphChart.length
        ? selectByIds<ChartRow>(orphChart.map((o) => o.canonical_url as string), (chunk) =>
            sb.from('chart_tracks').select('id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, beatport_url, spotify_url, tidal_url, sample_url').in('beatport_url', chunk),
          )
        : Promise.resolve({ data: [] as ChartRow[], error: null }),
      orphFeat.length
        ? selectByIds<FeatRow>(orphFeat.map((o) => o.canonical_url as string), (chunk) =>
            sb.from('chart_featured_tracks').select('id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, link_url, link_label, platform, spotify_url, tidal_url, sample_url').in('link_url', chunk),
          )
        : Promise.resolve({ data: [] as FeatRow[], error: null }),
      orphVinyl.length
        ? selectByIds<VinylRow>(orphVinyl.map((o) => o.canonical_url as string), (chunk) =>
            sb.from('chart_vinyl_tracks').select('id, title, mix_name, artists, label, year, artwork_url, discogs_url, youtube_url').in('discogs_url', chunk),
          )
        : Promise.resolve({ data: [] as VinylRow[], error: null }),
    ])
    type R = { id: string }
    const remap = <T extends R>(rows: T[], pick: (r: T) => string | null | undefined) => {
      const m = new Map<string, T>()
      for (const r of rows) {
        const k = normalizeUrl(pick(r))
        if (k) m.set(k, r)
      }
      return m
    }
    const cIdx = remap<ChartRow>(((extraChart.data || []) as ChartRow[]), (r) => r.beatport_url)
    const fIdx = remap<FeatRow>(((extraFeat.data || []) as FeatRow[]), (r) => r.link_url)
    const vIdx = remap<VinylRow>(((extraVinyl.data || []) as VinylRow[]), (r) => r.discogs_url)
    for (const o of orphChart) {
      const live = cIdx.get(normalizeUrl(o.canonical_url))
      if (live && !liveChartIds.has(live.id)) { (chartRes.data as unknown as ChartRow[]).push(live); liveChartIds.add(live.id) }
      if (live) o.track_id = live.id
    }
    for (const o of orphFeat) {
      const live = fIdx.get(normalizeUrl(o.canonical_url))
      if (live && !liveFeatIds.has(live.id)) { (featRes.data as unknown as FeatRow[]).push(live); liveFeatIds.add(live.id) }
      if (live) o.track_id = live.id
    }
    for (const o of orphVinyl) {
      const live = vIdx.get(normalizeUrl(o.canonical_url))
      if (live && !liveVinylIds.has(live.id)) { (vinylRes.data as unknown as VinylRow[]).push(live); liveVinylIds.add(live.id) }
      if (live) o.track_id = live.id
    }
  }

  // Resolver week_date para los chart/featured (se usa en los enlaces /charts?week=…&play=…).
  const editionIdSet = new Set<string>()
  for (const c of (chartRes.data || []) as ChartRow[]) if (c.chart_edition_id) editionIdSet.add(c.chart_edition_id)
  for (const f of (featRes.data || []) as FeatRow[]) if (f.chart_edition_id) editionIdSet.add(f.chart_edition_id)
  const editionIds = Array.from(editionIdSet)
  const editionRes = editionIds.length
    ? await selectByIds<EditionRow>(editionIds, (chunk) =>
        sb.from('chart_editions').select('id, week_date').in('id', chunk),
      )
    : { data: [] as EditionRow[], error: null }
  const weekByEdition = new Map<string, string>()
  for (const e of ((editionRes.data || []) as EditionRow[])) weekByEdition.set(e.id, e.week_date)

  type Meta = {
    title: string
    mix_name: string | null
    artists: string
    label: string | null
    year: number | null
    release_date: string | null
    bpm: number | null
    music_key: string | null
    artwork_url: string | null
    external_url: string | null
    youtube_url: string | null
    spotify_url: string | null
    tidal_url: string | null
    sample_url: string | null
    playback_kind: PlaybackKind
    canonical_key: string
    source: ChartTrackSource
    id: string
    week_date: string | null
  }
  const byRefKey = new Map<string, Meta>()

  for (const c of ((chartRes.data || []) as ChartRow[])) {
    const canonical_key = normalizeUrl(c.beatport_url) || `t:chart:${c.id}`
    byRefKey.set(`chart:${c.id}`, {
      title: c.title,
      mix_name: c.mix_name,
      artists: artistsToString(c.artists),
      label: c.label,
      year: c.release_year,
      release_date: c.release_date,
      bpm: c.bpm,
      music_key: c.music_key,
      artwork_url: c.artwork_url,
      external_url: c.beatport_url,
      youtube_url: null,
      spotify_url: c.spotify_url ?? null,
      tidal_url: c.tidal_url ?? null,
      sample_url: c.sample_url,
      playback_kind: 'beatport',
      canonical_key,
      source: 'chart',
      id: c.id,
      week_date: c.chart_edition_id ? weekByEdition.get(c.chart_edition_id) || null : null,
    })
  }
  for (const f of ((featRes.data || []) as FeatRow[])) {
    const kind: PlaybackKind = f.platform === 'bandcamp' ? 'bandcamp' : 'beatport'
    const canonical_key = normalizeUrl(f.link_url) || `t:featured:${f.id}`
    byRefKey.set(`featured:${f.id}`, {
      title: f.title,
      mix_name: f.mix_name,
      artists: artistsToString(f.artists),
      label: f.label,
      year: f.release_year,
      release_date: f.release_date,
      bpm: f.bpm,
      music_key: f.music_key,
      artwork_url: f.artwork_url,
      external_url: f.link_url,
      youtube_url: null,
      spotify_url: f.spotify_url ?? null,
      tidal_url: f.tidal_url ?? null,
      sample_url: f.sample_url,
      playback_kind: kind,
      canonical_key,
      source: 'featured',
      id: f.id,
      week_date: f.chart_edition_id ? weekByEdition.get(f.chart_edition_id) || null : null,
    })
  }
  for (const v of ((vinylRes.data || []) as VinylRow[])) {
    const canonical_key = normalizeUrl(v.youtube_url) || `t:vinyl:${v.id}`
    byRefKey.set(`vinyl:${v.id}`, {
      title: v.title,
      mix_name: v.mix_name,
      artists: artistsToString(v.artists),
      label: v.label,
      year: v.year,
      release_date: null,
      bpm: null,
      music_key: null,
      artwork_url: v.artwork_url,
      external_url: v.discogs_url || v.youtube_url,
      youtube_url: (v.youtube_url || '').trim() || null,
      spotify_url: null,
      tidal_url: null,
      sample_url: null,
      playback_kind: 'youtube',
      canonical_key,
      source: 'vinyl',
      id: v.id,
      week_date: null,
    })
  }

  // Capa 3 — fallback final por SNAPSHOT: si una save de chart/featured/vinyl
  // sigue sin fila viva tras el rebind por URL pero contiene snapshot,
  // sintetizamos un Meta para que la canción cuente en el ranking. Protege
  // contra DELETE total de las tablas chart_*_tracks.
  for (const s of saved) {
    if (s.track_source === 'beatport_top') continue
    if (byRefKey.has(`${s.track_source}:${s.track_id}`)) continue
    const snap = (s.snapshot || {}) as Record<string, unknown>
    if (!snap || !snap.title) continue
    const snapYoutube = typeof snap.youtube_url === 'string' ? snap.youtube_url.trim() : ''
    const externalUrl = (snap.beatport_url as string | null) || s.canonical_url
    const canonical_key = s.track_source === 'vinyl'
      ? normalizeUrl(snapYoutube || (s.canonical_url as string | null)) || `t:vinyl:${s.track_id}`
      : normalizeUrl(externalUrl as string | null) || `t:${s.track_source}:${s.track_id}`
    const kind: PlaybackKind = s.track_source === 'vinyl' ? 'youtube' : 'beatport'
    byRefKey.set(`${s.track_source}:${s.track_id}`, {
      title: String(snap.title || ''),
      mix_name: (snap.mix_name as string | null) ?? null,
      artists: String(snap.artists || ''),
      label: (snap.label as string | null) ?? null,
      year: typeof snap.year === 'number' ? (snap.year as number) : null,
      release_date:
        typeof snap.release_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test((snap.release_date as string).trim().slice(0, 10))
          ? (snap.release_date as string).trim().slice(0, 10)
          : null,
      bpm: typeof snap.bpm === 'number' ? (snap.bpm as number) : null,
      music_key: (snap.music_key as string | null) ?? null,
      artwork_url: (snap.artwork_url as string | null) ?? null,
      external_url: externalUrl as string | null,
      youtube_url: snapYoutube || youtubeUrlFromCanonicalKey(canonical_key),
      spotify_url: (snap.spotify_url as string | null) ?? null,
      tidal_url: (snap.tidal_url as string | null) ?? null,
      sample_url: (snap.sample_url as string | null) ?? null,
      playback_kind: kind,
      canonical_key,
      source: s.track_source,
      id: s.track_id,
      week_date: null,
    })
  }

  // Saves "beatport_top" guardan los metadatos en el snapshot, no tienen
  // fila propia. Construimos su Meta usando el snapshot.
  for (const s of saved) {
    if (s.track_source !== 'beatport_top') continue
    if (byRefKey.has(`beatport_top:${s.track_id}`)) continue
    const snap = (s.snapshot || {}) as Record<string, unknown>
    const beatport_url = (snap.beatport_url as string | null) || s.canonical_url
    const canonical_key = normalizeUrl(beatport_url) || `t:beatport_top:${s.track_id}`
    byRefKey.set(`beatport_top:${s.track_id}`, {
      title: String(snap.title || ''),
      mix_name: (snap.mix_name as string | null) ?? null,
      artists: String(snap.artists || ''),
      label: (snap.label as string | null) ?? null,
      year: typeof snap.year === 'number' ? (snap.year as number) : null,
      release_date:
        typeof snap.release_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test((snap.release_date as string).trim().slice(0, 10))
          ? (snap.release_date as string).trim().slice(0, 10)
          : null,
      bpm: typeof snap.bpm === 'number' ? (snap.bpm as number) : null,
      music_key: (snap.music_key as string | null) ?? null,
      artwork_url: (snap.artwork_url as string | null) ?? null,
      external_url: beatport_url,
      youtube_url: null,
      spotify_url: (snap.spotify_url as string | null) ?? null,
      tidal_url: (snap.tidal_url as string | null) ?? null,
      sample_url: (snap.sample_url as string | null) ?? null,
      playback_kind: 'beatport',
      canonical_key,
      source: 'beatport_top',
      id: s.track_id,
      week_date: null,
    })
  }

  // Agrega por clave canónica (mismo tema en distintas fuentes/semanas
  // cuenta una sola vez por usuario).
  const aggByKey = new Map<string, Aggregate>()

  const artistAgg = new Map<string, ArtistAgg>()
  const artistCredits: ArtistCredit[] = []

  for (const s of saved) {
    const meta = byRefKey.get(`${s.track_source}:${s.track_id}`)
    if (!meta) continue
    const key = meta.canonical_key
    const created = s.created_at || null
    const existing = aggByKey.get(key)
    if (!existing) {
      aggByKey.set(key, {
        canonical_key: key,
        title: meta.title,
        mix_name: meta.mix_name,
        artists: meta.artists,
        label: meta.label,
        year: meta.year,
        release_date: meta.release_date,
        bpm: meta.bpm,
        music_key: meta.music_key,
        artwork_url: meta.artwork_url,
        external_url: meta.external_url,
        youtube_url: meta.youtube_url || youtubeUrlFromCanonicalKey(key),
        spotify_url: meta.spotify_url,
        tidal_url: meta.tidal_url,
        sample_url: meta.sample_url,
        playback_kind: meta.playback_kind,
        save_count: 1,
        unique_users: 0,
        first_saved_at: created,
        last_saved_at: created,
        sources: [meta.source],
        primary: { source: meta.source, id: meta.id, week_date: meta.week_date },
        beatport_share_origin: beatportShareOriginFromSavedRow(s),
        _users: new Set([s.user_id]),
      })
    } else {
      existing.save_count += 1
      existing._users.add(s.user_id)
      if (!existing.beatport_share_origin) {
        const oo = beatportShareOriginFromSavedRow(s)
        if (oo) existing.beatport_share_origin = oo
      }
      if (!existing.sources.includes(meta.source)) existing.sources.push(meta.source)
      if (created) {
        if (!existing.first_saved_at || created < existing.first_saved_at) existing.first_saved_at = created
        if (!existing.last_saved_at || created > existing.last_saved_at) existing.last_saved_at = created
      }
      if (!existing.mix_name && meta.mix_name) existing.mix_name = meta.mix_name
      if (!existing.label && meta.label) existing.label = meta.label
      if (!existing.artwork_url && meta.artwork_url) existing.artwork_url = meta.artwork_url
      if (!existing.external_url && meta.external_url) existing.external_url = meta.external_url
      if (!existing.youtube_url && meta.youtube_url) existing.youtube_url = meta.youtube_url
      if (!existing.spotify_url && meta.spotify_url) existing.spotify_url = meta.spotify_url
      if (!existing.tidal_url && meta.tidal_url) existing.tidal_url = meta.tidal_url
      if (!existing.bpm && meta.bpm) existing.bpm = meta.bpm
      if (!existing.music_key && meta.music_key) existing.music_key = meta.music_key
      if (!existing.year && meta.year) existing.year = meta.year
      const hasRd = (v: string | null) => !!(v && /^\d{4}-\d{2}-\d{2}$/.test(v.trim().slice(0, 10)))
      if (!hasRd(existing.release_date) && hasRd(meta.release_date)) existing.release_date = meta.release_date
      if (!existing.sample_url && meta.sample_url) existing.sample_url = meta.sample_url
      if (
        (existing.primary.source === 'beatport_top' && meta.source !== 'beatport_top') ||
        (existing.playback_kind === 'youtube' && meta.playback_kind !== 'youtube')
      ) {
        existing.playback_kind = meta.playback_kind
        existing.primary = { source: meta.source, id: meta.id, week_date: meta.week_date }
      }
    }

    const credited = new Map<string, string>()
    for (const artistName of splitArtistCreditsForRanking(meta.artists || '')) {
      const artistKey = normalizeArtistKey(artistName)
      if (artistKey && !credited.has(artistKey)) credited.set(artistKey, artistName.trim())
    }
    for (const remixer of extractRemixerNames(meta.mix_name)) {
      const artistKey = normalizeArtistKey(remixer)
      if (artistKey && !credited.has(artistKey)) credited.set(artistKey, remixer.trim())
    }
    for (const [artistKey, artistName] of credited) {
      if (shouldSkipArtistSelfCredit(selfCreditSkip, s.user_id, artistName)) continue
      bumpArtistInto(artistAgg, artistName, s.user_id, key)
      artistCredits.push({
        key: artistKey,
        name: artistName,
        userId: s.user_id,
        trackKey: key,
        createdMs: created ? Date.parse(created) || 0 : 0,
      })
    }
  }

  const aggregates = Array.from(aggByKey.values())
  aggregates.forEach((a) => { a.unique_users = a._users.size })

  const playByKey = new Map<string, number>()
  const allKeys = aggregates.map((a) => a.canonical_key)
  if (allKeys.length) {
    const { data: playRows } = await sb.rpc('track_play_counts_for_keys', { p_keys: allKeys })
    for (const row of (playRows || []) as { canonical_key: string; play_count: number }[]) {
      playByKey.set(row.canonical_key, Number(row.play_count) || 0)
    }
  }

  // Ordenamos por usuarios únicos primero (un mismo usuario no infla el ranking
  // re-guardando la canción en otra fuente), después por save_count, después
  // por reproducciones (desempate cuando empatan en votos), después por save
  // más reciente y finalmente por título alfabético.
  aggregates.sort(
    (a, b) =>
      b.unique_users - a.unique_users ||
      b.save_count - a.save_count ||
      (playByKey.get(b.canonical_key) || 0) - (playByKey.get(a.canonical_key) || 0) ||
      (b.last_saved_at || '').localeCompare(a.last_saved_at || '') ||
      (a.title || '').localeCompare(b.title || ''),
  )

  const top_tracks = aggregates.slice(0, limit).map((a, idx) => ({
    rank: idx + 1,
    canonical_key: a.canonical_key,
    title: a.title,
    mix_name: a.mix_name,
    artists: a.artists,
    label: a.label,
    year: a.year,
    release_date: a.release_date,
    bpm: a.bpm,
    music_key: a.music_key,
    artwork_url: a.artwork_url,
    external_url: a.external_url,
    youtube_url: a.youtube_url || youtubeUrlFromCanonicalKey(a.canonical_key),
    spotify_url: a.spotify_url,
    tidal_url: a.tidal_url,
    sample_url: a.sample_url,
    playback_kind: a.playback_kind,
    save_count: a.save_count,
    unique_users: a.unique_users,
    play_count: playByKey.get(a.canonical_key) || 0,
    first_saved_at: a.first_saved_at,
    last_saved_at: a.last_saved_at,
    sources: a.sources,
    primary: a.primary,
    beatport_share_origin: a.beatport_share_origin,
  }))

  // Top artistas: créditos de save (aparición en track guardado), luego users, luego tracks.
  const artistRanked = Array.from(artistAgg.entries())
    .map(([key, a]) => ({
      key,
      name: a.name,
      save_count: a.save_count,
      unique_users: a._users.size,
      unique_tracks: a._tracks.size,
    }))
    .sort(
      (a, b) =>
        b.save_count - a.save_count ||
        b.unique_users - a.unique_users ||
        b.unique_tracks - a.unique_tracks ||
        a.name.localeCompare(b.name),
    )
    .slice(0, TOP_ARTISTS_LIMIT)

  const thisMonday = isoMondayUtc(new Date())
  const mondaySnapshots = artistMondaySnapshots(artistCredits, thisMonday)
  const previousRanks = mondaySnapshots.get(thisMonday) || new Map<string, number>()

  let artistSlugMap: Record<string, string> = {}
  const catalogBySlug = new Map<string, { image_url: string | null; country: string | null }>()
  if (artistRanked.length) {
    const { data: artistRows } = await sb
      .from('artists')
      .select('slug, name, name_display, image_url, country')
      .limit(5000)
    const rows =
      (artistRows as {
        slug: string
        name: string | null
        name_display: string | null
        image_url: string | null
        country: string | null
      }[]) || []
    artistSlugMap = buildFullArtistSlugMap(rows)
    for (const row of rows) {
      catalogBySlug.set(row.slug, { image_url: row.image_url, country: row.country })
    }
  }

  const top_artists = artistRanked.map((a, idx) => {
    const key = a.key
    const slug =
      artistSlugMap[key] ||
      artistSlugMap[key.startsWith('the ') ? key.slice(4) : `the ${key}`] ||
      null
    const catalog = slug ? catalogBySlug.get(slug) : undefined
    const rank = idx + 1
    const previous_rank = previousRanks.get(key) ?? null
    const extraTop10 = consecutiveWeeks(key, thisMonday, mondaySnapshots, (r) => r != null && r <= TOP_ARTISTS_LIMIT)
    const extraAt1 = rank === 1
      ? consecutiveWeeks(key, thisMonday, mondaySnapshots, (r) => r === 1)
      : 0
    return {
      rank,
      name: a.name,
      save_count: a.save_count,
      unique_users: a.unique_users,
      unique_tracks: a.unique_tracks,
      slug,
      image_url: displayArtistImageUrl(slug, catalog?.image_url) ?? null,
      country: catalog?.country || null,
      previous_rank,
      weeks_in_top10: extraTop10 + 1,
      weeks_at_1: rank === 1 ? extraAt1 + 1 : 0,
    }
  })

  // Solo contamos lo que de verdad se renderiza en el ranking. Los saves
  // huérfanos sin meta ni snapshot se descartan (no aparecen como tema en
  // el top, así que tampoco deben sumar al contador). Esto mantiene la
  // identidad: Σ save_count == totals.saves.
  const totalSavesVisible = aggregates.reduce((acc, a) => acc + a.save_count, 0)
  const usersVisible = new Set<string>()
  for (const a of aggregates) a._users.forEach((uid) => usersVisible.add(uid))
  const totals = {
    saves: totalSavesVisible,
    unique_tracks: aggregates.length,
    unique_users: usersVisible.size,
  }

  return NextResponse.json({
    scope: 'all_time',
    totals,
    top_tracks,
    top_artists,
  })
}

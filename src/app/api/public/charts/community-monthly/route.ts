// ============================================
// OPTIMAL BREAKS — Top mensual de la comunidad
// ----------------------------------------------
// Devuelve el ranking de canciones más añadidas a "Mis Tracks" (tabla
// `saved_chart_tracks`) durante un mes calendario concreto. Reutiliza la
// lógica de claves canónicas del endpoint admin (`/api/admin/tracks`) para
// que las tres tablas de origen (chart_tracks, chart_featured_tracks,
// chart_vinyl_tracks) y los saves estilo `beatport_top` se agreguen como
// la misma canción si comparten URL canónica.
//
// Uso: GET /api/public/charts/community-monthly[?month=YYYY-MM][&limit=N]
//
//   - month: opcional. Si falta, se usa el mes actual (UTC).
//   - limit: opcional, 5–100 (default 30).
//
// Respuesta:
//   {
//     month: 'YYYY-MM',
//     range: { from: ISO, to: ISO },
//     totals: { saves, unique_tracks, unique_users },
//     top_tracks: TopTrack[],
//     available_months: [{ month: 'YYYY-MM', saves: number }, ...] // últimos 24 meses con actividad
//   }
//
// Bypassa RLS vía service-role porque `saved_chart_tracks` solo permite
// leer los propios y aquí necesitamos ver los de toda la comunidad.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase-admin'

type ChartTrackSource = 'chart' | 'featured' | 'vinyl' | 'beatport_top'
type PlaybackKind = 'beatport' | 'bandcamp' | 'youtube'

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

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function parseMonth(input: string | null): { month: string; from: string; to: string } {
  // Devuelve [from, to) como ISO en UTC.
  const now = new Date()
  let year = now.getUTCFullYear()
  let monthZeroIndex = now.getUTCMonth()
  if (input && MONTH_RE.test(input)) {
    const [y, m] = input.split('-').map(Number)
    year = y
    monthZeroIndex = m - 1
  }
  const from = new Date(Date.UTC(year, monthZeroIndex, 1, 0, 0, 0, 0))
  const to = new Date(Date.UTC(year, monthZeroIndex + 1, 1, 0, 0, 0, 0))
  const monthStr = `${year}-${String(monthZeroIndex + 1).padStart(2, '0')}`
  return { month: monthStr, from: from.toISOString(), to: to.toISOString() }
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
  playback_kind: PlaybackKind
  sample_url: string | null
  save_count: number
  unique_users: number
  first_saved_at: string | null
  last_saved_at: string | null
  sources: ChartTrackSource[]
  primary: { source: ChartTrackSource; id: string; week_date: string | null }
  _users: Set<string>
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const monthParam = url.searchParams.get('month')
  const limit = Math.min(100, Math.max(5, Number(url.searchParams.get('limit')) || 30))
  const { month, from, to } = parseMonth(monthParam)

  let sb: ReturnType<typeof createServiceSupabase>
  try {
    sb = createServiceSupabase()
  } catch {
    return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 })
  }

  // Saves del mes solicitado (excluimos a perfiles privados: ese flag manda
  // sobre todo el cómputo de afinidad y, por consistencia, también ocultamos
  // a esos usuarios del Top mensual).
  const { data: savedData, error: savedErr } = await sb
    .from('saved_chart_tracks')
    .select('user_id, track_source, track_id, canonical_url, snapshot, created_at')
    .gte('created_at', from)
    .lt('created_at', to)
  if (savedErr) return NextResponse.json({ error: savedErr.message }, { status: 500 })

  const savedRaw = ((savedData as unknown) as SavedRow[]) || []

  // Lista global de perfiles "privados" (is_tracks_public = false) para
  // excluirlos tanto del top mensual como del histograma de meses
  // disponibles. La consulta es barata porque la mayoría de perfiles deja
  // el flag en true (default).
  const { data: privateProfiles } = await sb
    .from('profiles')
    .select('id')
    .eq('is_tracks_public', false)
  const privateSet = new Set(
    ((privateProfiles as { id: string }[] | null) ?? []).map((p) => p.id),
  )

  const saved = savedRaw.filter((s) => !privateSet.has(s.user_id))

  // Histograma de meses con actividad (últimos 24 meses) para construir el
  // selector en el cliente. Excluye también a perfiles privados.
  const sinceISO = (() => {
    const d = new Date()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() - 23)
    d.setUTCHours(0, 0, 0, 0)
    return d.toISOString()
  })()
  const { data: bucketRows } = await sb
    .from('saved_chart_tracks')
    .select('user_id, created_at')
    .gte('created_at', sinceISO)
  const bucketCounts = new Map<string, number>()
  for (const r of (bucketRows as { user_id: string; created_at: string | null }[] | null) ?? []) {
    if (!r.created_at) continue
    if (privateSet.has(r.user_id)) continue
    const m = r.created_at.slice(0, 7)
    bucketCounts.set(m, (bucketCounts.get(m) || 0) + 1)
  }
  const available_months = Array.from(bucketCounts.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([m, saves]) => ({ month: m, saves }))

  if (saved.length === 0) {
    return NextResponse.json({
      month,
      range: { from, to },
      totals: { saves: 0, unique_tracks: 0, unique_users: 0 },
      top_tracks: [],
      available_months,
    })
  }

  const chartIds = Array.from(new Set(saved.filter((s) => s.track_source === 'chart').map((s) => s.track_id)))
  const featIds = Array.from(new Set(saved.filter((s) => s.track_source === 'featured').map((s) => s.track_id)))
  const vinylIds = Array.from(new Set(saved.filter((s) => s.track_source === 'vinyl').map((s) => s.track_id)))

  const [chartRes, featRes, vinylRes] = await Promise.all([
    chartIds.length
      ? sb
          .from('chart_tracks')
          .select('id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, beatport_url, sample_url')
          .in('id', chartIds)
      : Promise.resolve({ data: [] as ChartRow[], error: null }),
    featIds.length
      ? sb
          .from('chart_featured_tracks')
          .select('id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, link_url, link_label, platform, sample_url')
          .in('id', featIds)
      : Promise.resolve({ data: [] as FeatRow[], error: null }),
    vinylIds.length
      ? sb
          .from('chart_vinyl_tracks')
          .select('id, title, mix_name, artists, label, year, artwork_url, discogs_url, youtube_url')
          .in('id', vinylIds)
      : Promise.resolve({ data: [] as VinylRow[], error: null }),
  ])

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
        ? sb.from('chart_tracks').select('id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, beatport_url, sample_url').in('beatport_url', orphChart.map((o) => o.canonical_url as string))
        : Promise.resolve({ data: [] as ChartRow[], error: null }),
      orphFeat.length
        ? sb.from('chart_featured_tracks').select('id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, link_url, link_label, platform, sample_url').in('link_url', orphFeat.map((o) => o.canonical_url as string))
        : Promise.resolve({ data: [] as FeatRow[], error: null }),
      orphVinyl.length
        ? sb.from('chart_vinyl_tracks').select('id, title, mix_name, artists, label, year, artwork_url, discogs_url, youtube_url').in('discogs_url', orphVinyl.map((o) => o.canonical_url as string))
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
    ? await sb.from('chart_editions').select('id, week_date').in('id', editionIds)
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
    const externalUrl = (snap.beatport_url as string | null) || s.canonical_url
    const canonical_key = normalizeUrl(externalUrl as string | null) || `t:${s.track_source}:${s.track_id}`
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
        sample_url: meta.sample_url,
        playback_kind: meta.playback_kind,
        save_count: 1,
        unique_users: 0,
        first_saved_at: created,
        last_saved_at: created,
        sources: [meta.source],
        primary: { source: meta.source, id: meta.id, week_date: meta.week_date },
        _users: new Set([s.user_id]),
      })
    } else {
      existing.save_count += 1
      existing._users.add(s.user_id)
      if (!existing.sources.includes(meta.source)) existing.sources.push(meta.source)
      if (created) {
        if (!existing.first_saved_at || created < existing.first_saved_at) existing.first_saved_at = created
        if (!existing.last_saved_at || created > existing.last_saved_at) existing.last_saved_at = created
      }
      if (!existing.mix_name && meta.mix_name) existing.mix_name = meta.mix_name
      if (!existing.label && meta.label) existing.label = meta.label
      if (!existing.artwork_url && meta.artwork_url) existing.artwork_url = meta.artwork_url
      if (!existing.external_url && meta.external_url) existing.external_url = meta.external_url
      if (!existing.bpm && meta.bpm) existing.bpm = meta.bpm
      if (!existing.music_key && meta.music_key) existing.music_key = meta.music_key
      if (!existing.year && meta.year) existing.year = meta.year
      const hasRd = (v: string | null) => !!(v && /^\d{4}-\d{2}-\d{2}$/.test(v.trim().slice(0, 10)))
      if (!hasRd(existing.release_date) && hasRd(meta.release_date)) existing.release_date = meta.release_date
      if (!existing.sample_url && meta.sample_url) existing.sample_url = meta.sample_url
      // Preferir un primary que sea reproducible y enlazable a /charts.
      if (
        (existing.primary.source === 'beatport_top' && meta.source !== 'beatport_top') ||
        (existing.playback_kind === 'youtube' && meta.playback_kind !== 'youtube')
      ) {
        existing.playback_kind = meta.playback_kind
        existing.primary = { source: meta.source, id: meta.id, week_date: meta.week_date }
      }
    }
  }

  const aggregates = Array.from(aggByKey.values())
  aggregates.forEach((a) => { a.unique_users = a._users.size })
  // Ordenamos por usuarios únicos primero (un mismo usuario no infla el ranking
  // re-guardando la canción en otra fuente), después por save_count y por
  // título alfabético.
  aggregates.sort(
    (a, b) =>
      b.unique_users - a.unique_users ||
      b.save_count - a.save_count ||
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
    sample_url: a.sample_url,
    playback_kind: a.playback_kind,
    save_count: a.save_count,
    unique_users: a.unique_users,
    first_saved_at: a.first_saved_at,
    last_saved_at: a.last_saved_at,
    sources: a.sources,
    primary: a.primary,
  }))

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
    month,
    range: { from, to },
    totals,
    top_tracks,
    available_months,
  })
}

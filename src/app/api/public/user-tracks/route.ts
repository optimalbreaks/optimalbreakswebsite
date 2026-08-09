// ============================================
// OPTIMAL BREAKS — Public user-tracks endpoint
// Devuelve la lista "Mis Tracks" de otro usuario para compartirla
// públicamente. Bypassa RLS vía service-role porque saved_chart_tracks
// solo permite leer los propios.
// Acepta ?handle=<uuid-o-username>.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase-admin'

type ChartTrackSource = 'chart' | 'featured' | 'vinyl' | 'beatport_top'

type SavedRow = {
  track_source: ChartTrackSource
  track_id: string
  canonical_url: string | null
  snapshot: Record<string, unknown> | null
  created_at: string | null
}

type ProfileMini = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  country: string | null
}

type ChartRow = { id: string; chart_edition_id: string | null; title: string; mix_name: string | null; artists: unknown; label: string | null; release_year: number | null; release_date: string | null; bpm: number | null; music_key: string | null; artwork_url: string | null; beatport_url: string | null; sample_url: string | null }
type FeatRow = { id: string; chart_edition_id: string | null; title: string; mix_name: string | null; artists: unknown; label: string | null; release_year: number | null; release_date: string | null; bpm: number | null; music_key: string | null; artwork_url: string | null; link_url: string | null; link_label: string | null; platform: string | null; sample_url: string | null; note_en: string | null; note_es: string | null }
type VinylRow = { id: string; title: string; mix_name: string | null; artists: unknown; label: string | null; year: number | null; artwork_url: string | null; discogs_url: string | null; youtube_url: string | null; note_en: string | null; note_es: string | null }
type EditionRow = { id: string; week_date: string }

function artistsToString(a: unknown): string {
  if (!Array.isArray(a)) return ''
  return a.map((x) => (x && typeof x === 'object' ? (x as { name?: string }).name : x)).filter(Boolean).join(', ')
}

// Misma normalización que `community-monthly` para que un save con `canonical_url`
// se case con la fila viva aunque su `track_id` UUID haya cambiado tras un upsert.
function normalizeUrlKey(u: string | null | undefined): string {
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** PostgREST corta en 1000 filas por defecto. */
const PAGE = 1000
/** Trozos seguros para `.in('id', …)` (URL / payload). */
const IN_CHUNK = 200

async function fetchAllSavedForUser(
  sb: ReturnType<typeof createServiceSupabase>,
  userId: string,
): Promise<{ data: SavedRow[]; error: { message: string } | null }> {
  const all: SavedRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb
      .from('saved_chart_tracks')
      .select('track_source, track_id, canonical_url, snapshot, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1)
    if (error) return { data: all, error }
    const rows = ((data as unknown) as SavedRow[]) || []
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return { data: all, error: null }
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

export async function GET(request: NextRequest) {
  const handle = request.nextUrl.searchParams.get('handle')?.trim()
  if (!handle) return NextResponse.json({ error: 'handle requerido' }, { status: 400 })

  let sb: ReturnType<typeof createServiceSupabase>
  try {
    sb = createServiceSupabase()
  } catch {
    return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 })
  }

  // Resuelve perfil por UUID o username (case-insensitive).
  const profileQuery = UUID_RE.test(handle)
    ? sb.from('profiles').select('id, username, display_name, avatar_url, country').eq('id', handle).maybeSingle()
    : sb.from('profiles').select('id, username, display_name, avatar_url, country').ilike('username', handle).maybeSingle()

  const { data: profileData, error: profileErr } = await profileQuery
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 })
  const owner = (profileData as unknown) as ProfileMini | null
  if (!owner) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const { data: saved, error: savedErr } = await fetchAllSavedForUser(sb, owner.id)
  if (savedErr) return NextResponse.json({ error: savedErr.message }, { status: 500 })

  const chartIds = Array.from(new Set(saved.filter((s) => s.track_source === 'chart').map((s) => s.track_id)))
  const featIds = Array.from(new Set(saved.filter((s) => s.track_source === 'featured').map((s) => s.track_id)))
  const vinylIds = Array.from(new Set(saved.filter((s) => s.track_source === 'vinyl').map((s) => s.track_id)))

  const [chartRes, featRes, vinylRes] = await Promise.all([
    selectByIds<ChartRow>(chartIds, (chunk) =>
      sb.from('chart_tracks').select('id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, beatport_url, sample_url').in('id', chunk),
    ),
    selectByIds<FeatRow>(featIds, (chunk) =>
      sb.from('chart_featured_tracks').select('id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, link_url, link_label, platform, sample_url, note_en, note_es').in('id', chunk),
    ),
    selectByIds<VinylRow>(vinylIds, (chunk) =>
      sb.from('chart_vinyl_tracks').select('id, title, mix_name, artists, label, year, artwork_url, discogs_url, youtube_url, note_en, note_es').in('id', chunk),
    ),
  ])
  if (chartRes.error) return NextResponse.json({ error: chartRes.error.message }, { status: 500 })
  if (featRes.error) return NextResponse.json({ error: featRes.error.message }, { status: 500 })
  if (vinylRes.error) return NextResponse.json({ error: vinylRes.error.message }, { status: 500 })

  const liveChartIds = new Set((chartRes.data || []).map((r) => r.id))
  const liveFeatIds = new Set((featRes.data || []).map((r) => r.id))
  const liveVinylIds = new Set((vinylRes.data || []).map((r) => r.id))

  // Auto-backfill on read: para saves vivos a los que les falte snapshot o
  // canonical_url (p.ej. saves antiguos hechos antes de instaurar la capa de
  // protección), rellenamos los metadatos al vuelo desde la fila viva.
  // Esto refuerza la "capa 4" sin necesidad de scripts batch periódicos.
  const liveChartMap = new Map((chartRes.data || []).map((r) => [r.id, r]))
  const liveFeatMap = new Map((featRes.data || []).map((r) => [r.id, r]))
  const liveVinylMap = new Map((vinylRes.data || []).map((r) => [r.id, r]))
  const backfillJobs: Array<Promise<unknown>> = []
  for (const s of saved) {
    if (s.track_source === 'beatport_top') continue
    const live =
      s.track_source === 'chart' ? liveChartMap.get(s.track_id)
      : s.track_source === 'featured' ? liveFeatMap.get(s.track_id)
      : s.track_source === 'vinyl' ? liveVinylMap.get(s.track_id)
      : null
    if (!live) continue
    const patch: Record<string, unknown> = {}
    if (!s.canonical_url) {
      const u =
        s.track_source === 'chart' ? (live as ChartRow).beatport_url
        : s.track_source === 'featured' ? (live as FeatRow).link_url
        : s.track_source === 'vinyl' ? ((live as VinylRow).discogs_url || (live as VinylRow).youtube_url)
        : null
      if (u) patch.canonical_url = u
    }
    if (!s.snapshot || Object.keys(s.snapshot).length === 0) {
      const a = (live as ChartRow | FeatRow | VinylRow).artists
      const artistsStr = artistsToString(a)
      const baseRow = live as ChartRow & FeatRow & VinylRow
      const snap: Record<string, unknown> = {
        title: baseRow.title || '',
        mix_name: baseRow.mix_name ?? null,
        artists: artistsStr,
        label: baseRow.label ?? null,
        year: (baseRow as ChartRow).release_year ?? (baseRow as VinylRow).year ?? null,
        release_date:
          s.track_source === 'vinyl'
            ? null
            : ((baseRow as ChartRow & FeatRow).release_date as string | null) ?? null,
        bpm: (baseRow as ChartRow).bpm ?? null,
        music_key: (baseRow as ChartRow).music_key ?? null,
        artwork_url: baseRow.artwork_url ?? null,
        sample_url: (baseRow as ChartRow).sample_url ?? null,
      }
      if (s.track_source === 'featured') snap.beatport_url = (live as FeatRow).link_url ?? null
      if (s.track_source === 'chart') snap.beatport_url = (live as ChartRow).beatport_url ?? null
      if (s.track_source === 'vinyl') {
        snap.beatport_url = (live as VinylRow).discogs_url ?? null
        snap.youtube_url = (live as VinylRow).youtube_url ?? null
      }
      patch.snapshot = snap
    }
    if (Object.keys(patch).length > 0) {
      const job = sb.from('saved_chart_tracks').update(patch)
        .eq('user_id', owner.id)
        .eq('track_source', s.track_source)
        .eq('track_id', s.track_id)
        .then(() => null)
      backfillJobs.push(job as unknown as Promise<unknown>)
    }
  }
  if (backfillJobs.length) await Promise.all(backfillJobs)

  // Auto-rebind por `canonical_url`: si una save tiene URL canónica pero el
  // `track_id` ya no devuelve fila viva (porque un upsert pasado regeneró
  // UUIDs), buscamos la fila por URL y arreglamos el track_id en BD para que
  // futuras peticiones sean directas. Sólo se ejecuta para huérfanos con URL.

  const orphChart = saved.filter((s) => s.track_source === 'chart' && !liveChartIds.has(s.track_id) && !!s.canonical_url)
  const orphFeat = saved.filter((s) => s.track_source === 'featured' && !liveFeatIds.has(s.track_id) && !!s.canonical_url)
  const orphVinyl = saved.filter((s) => s.track_source === 'vinyl' && !liveVinylIds.has(s.track_id) && !!s.canonical_url)

  if (orphChart.length || orphFeat.length || orphVinyl.length) {
    const [extraChart, extraFeat, extraVinyl] = await Promise.all([
      orphChart.length
        ? sb.from('chart_tracks').select('id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, beatport_url, sample_url').in('beatport_url', orphChart.map((o) => o.canonical_url as string))
        : Promise.resolve({ data: [] as ChartRow[], error: null }),
      orphFeat.length
        ? sb.from('chart_featured_tracks').select('id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, link_url, link_label, platform, sample_url, note_en, note_es').in('link_url', orphFeat.map((o) => o.canonical_url as string))
        : Promise.resolve({ data: [] as FeatRow[], error: null }),
      orphVinyl.length
        ? sb.from('chart_vinyl_tracks').select('id, title, mix_name, artists, label, year, artwork_url, discogs_url, youtube_url, note_en, note_es').in('discogs_url', orphVinyl.map((o) => o.canonical_url as string))
        : Promise.resolve({ data: [] as VinylRow[], error: null }),
    ])
    const extraChartRows = ((extraChart.data || []) as unknown) as ChartRow[]
    const extraFeatRows = ((extraFeat.data || []) as unknown) as FeatRow[]
    const extraVinylRows = ((extraVinyl.data || []) as unknown) as VinylRow[]

    const indexBy = <T extends { id: string }>(rows: T[], pick: (r: T) => string | null | undefined) => {
      const m = new Map<string, T>()
      for (const r of rows) {
        const k = normalizeUrlKey(pick(r))
        if (k) m.set(k, r)
      }
      return m
    }
    const chartIdx = indexBy<ChartRow>(extraChartRows, (r) => r.beatport_url)
    const featIdx = indexBy<FeatRow>(extraFeatRows, (r) => r.link_url)
    const vinylIdx = indexBy<VinylRow>(extraVinylRows, (r) => r.discogs_url)

    type RebindRow = { src: ChartTrackSource; oldId: string; newId: string }
    const rebinds: RebindRow[] = []
    const pushRebind = (src: ChartTrackSource, oldId: string, hit: { id: string } | undefined) => {
      if (hit && hit.id !== oldId) rebinds.push({ src, oldId, newId: hit.id })
    }
    for (const o of orphChart) pushRebind('chart', o.track_id, chartIdx.get(normalizeUrlKey(o.canonical_url)))
    for (const o of orphFeat) pushRebind('featured', o.track_id, featIdx.get(normalizeUrlKey(o.canonical_url)))
    for (const o of orphVinyl) pushRebind('vinyl', o.track_id, vinylIdx.get(normalizeUrlKey(o.canonical_url)))

    if (rebinds.length) {
      // Auto-heal serializado: actualizamos cada save al nuevo track_id. Si
      // ya existía una fila duplicada para el mismo (src, newId) borramos la
      // huérfana original para evitar un constraint unique.
      const existingPair = new Set(saved.map((s) => `${s.track_source}:${s.track_id}`))
      for (const r of rebinds) {
        const newKey = `${r.src}:${r.newId}`
        if (existingPair.has(newKey)) {
          await sb.from('saved_chart_tracks').delete().eq('user_id', owner.id).eq('track_source', r.src).eq('track_id', r.oldId)
        } else {
          const { error: updErr } = await sb.from('saved_chart_tracks').update({ track_id: r.newId }).eq('user_id', owner.id).eq('track_source', r.src).eq('track_id', r.oldId)
          if (updErr) {
            // Probable colisión de unique. Al menos no rompemos la respuesta.
            await sb.from('saved_chart_tracks').delete().eq('user_id', owner.id).eq('track_source', r.src).eq('track_id', r.oldId)
          }
          existingPair.add(newKey)
        }
        const idx = saved.findIndex((s) => s.track_source === r.src && s.track_id === r.oldId)
        if (idx !== -1) saved[idx] = { ...saved[idx], track_id: r.newId }
      }
      // Mezclamos las filas vivas recién encontradas en los buckets res.data.
      ;(chartRes.data as unknown as ChartRow[]).push(...extraChartRows.filter((r) => !liveChartIds.has(r.id)))
      ;(featRes.data as unknown as FeatRow[]).push(...extraFeatRows.filter((r) => !liveFeatIds.has(r.id)))
      ;(vinylRes.data as unknown as VinylRow[]).push(...extraVinylRows.filter((r) => !liveVinylIds.has(r.id)))
      for (const r of extraChartRows) liveChartIds.add(r.id)
      for (const r of extraFeatRows) liveFeatIds.add(r.id)
      for (const r of extraVinylRows) liveVinylIds.add(r.id)
    }
  }

  // Capa 3 — fallback final por SNAPSHOT: si una save sigue siendo huérfana
  // tras el rebind por URL pero contiene un snapshot con metadatos, lo
  // construimos como fila sintética para que la UI pueda renderizarla con
  // marca `from_snapshot: true`. Esto protege contra DELETE totales de la
  // tabla viva (no sólo cambios de UUID).
  for (const s of saved) {
    if (s.track_source === 'beatport_top') continue
    const isLive =
      (s.track_source === 'chart' && liveChartIds.has(s.track_id)) ||
      (s.track_source === 'featured' && liveFeatIds.has(s.track_id)) ||
      (s.track_source === 'vinyl' && liveVinylIds.has(s.track_id))
    if (isLive) continue
    const snap = (s.snapshot || {}) as Record<string, unknown>
    if (!snap || Object.keys(snap).length === 0) continue
    const title = String(snap.title || '')
    if (!title) continue
    if (s.track_source === 'featured') {
      ;(featRes.data as unknown as (FeatRow & { from_snapshot?: boolean })[]).push({
        id: s.track_id,
        chart_edition_id: null,
        title,
        mix_name: (snap.mix_name as string | null) ?? null,
        artists: (snap.artists as unknown) ?? '',
        label: (snap.label as string | null) ?? null,
        release_year: (snap.year as number | null) ?? null,
        release_date: (snap.release_date as string | null) ?? null,
        bpm: (snap.bpm as number | null) ?? null,
        music_key: (snap.music_key as string | null) ?? null,
        artwork_url: (snap.artwork_url as string | null) ?? null,
        link_url: (snap.beatport_url as string | null) ?? s.canonical_url,
        link_label: null,
        platform: null,
        sample_url: (snap.sample_url as string | null) ?? null,
        note_en: null,
        note_es: null,
        from_snapshot: true,
      })
    } else if (s.track_source === 'chart') {
      ;(chartRes.data as unknown as (ChartRow & { from_snapshot?: boolean })[]).push({
        id: s.track_id,
        chart_edition_id: null,
        title,
        mix_name: (snap.mix_name as string | null) ?? null,
        artists: (snap.artists as unknown) ?? '',
        label: (snap.label as string | null) ?? null,
        release_year: (snap.year as number | null) ?? null,
        release_date: (snap.release_date as string | null) ?? null,
        bpm: (snap.bpm as number | null) ?? null,
        music_key: (snap.music_key as string | null) ?? null,
        artwork_url: (snap.artwork_url as string | null) ?? null,
        beatport_url: (snap.beatport_url as string | null) ?? s.canonical_url,
        sample_url: (snap.sample_url as string | null) ?? null,
        from_snapshot: true,
      })
    } else if (s.track_source === 'vinyl') {
      ;(vinylRes.data as unknown as (VinylRow & { from_snapshot?: boolean })[]).push({
        id: s.track_id,
        title,
        mix_name: (snap.mix_name as string | null) ?? null,
        artists: (snap.artists as unknown) ?? '',
        label: (snap.label as string | null) ?? null,
        year: (snap.year as number | null) ?? null,
        artwork_url: (snap.artwork_url as string | null) ?? null,
        discogs_url: (snap.beatport_url as string | null) ?? null,
        youtube_url: ((snap as Record<string, unknown>).youtube_url as string | null) ?? null,
        note_en: null,
        note_es: null,
        from_snapshot: true,
      })
    }
  }

  // Resolver week_date de chart/featured en un lote para construir los links
  // compartibles "/charts?week=...&play=<source>:<id>" sin forzar al cliente
  // a un round-trip extra.
  const editionIdSet = new Set<string>()
  for (const c of (chartRes.data || []) as ChartRow[]) if (c.chart_edition_id) editionIdSet.add(c.chart_edition_id)
  for (const f of (featRes.data || []) as FeatRow[]) if (f.chart_edition_id) editionIdSet.add(f.chart_edition_id)
  const editionIds = Array.from(editionIdSet)
  const editionRes = editionIds.length
    ? await selectByIds<EditionRow>(editionIds, (chunk) =>
        sb.from('chart_editions').select('id, week_date').in('id', chunk),
      )
    : { data: [] as EditionRow[], error: null }
  if (editionRes.error) return NextResponse.json({ error: editionRes.error.message }, { status: 500 })
  const weekByEdition = new Map<string, string>()
  for (const e of (editionRes.data || []) as EditionRow[]) weekByEdition.set(e.id, e.week_date)

  const tracks = {
    chart: ((chartRes.data || []) as (ChartRow & { from_snapshot?: boolean })[]).map((c) => ({
      id: c.id, title: c.title, mix_name: c.mix_name,
      artists: typeof c.artists === 'string' ? c.artists : artistsToString(c.artists),
      label: c.label, year: c.release_year, release_date: c.release_date ?? null, bpm: c.bpm, music_key: c.music_key,
      artwork_url: c.artwork_url, beatport_url: c.beatport_url, sample_url: c.sample_url,
      week_date: c.chart_edition_id ? weekByEdition.get(c.chart_edition_id) || null : null,
      from_snapshot: !!c.from_snapshot,
    })),
    featured: ((featRes.data || []) as (FeatRow & { from_snapshot?: boolean })[]).map((f) => ({
      id: f.id, title: f.title, mix_name: f.mix_name,
      artists: typeof f.artists === 'string' ? f.artists : artistsToString(f.artists),
      label: f.label, year: f.release_year, release_date: f.release_date ?? null, bpm: f.bpm, music_key: f.music_key,
      artwork_url: f.artwork_url, link_url: f.link_url, link_label: f.link_label,
      platform: f.platform, sample_url: f.sample_url, note_en: f.note_en, note_es: f.note_es,
      week_date: f.chart_edition_id ? weekByEdition.get(f.chart_edition_id) || null : null,
      from_snapshot: !!f.from_snapshot,
    })),
    vinyl: ((vinylRes.data || []) as (VinylRow & { from_snapshot?: boolean })[]).map((v) => ({
      id: v.id, title: v.title, mix_name: v.mix_name,
      artists: typeof v.artists === 'string' ? v.artists : artistsToString(v.artists),
      label: v.label, year: v.year,
      artwork_url: v.artwork_url, discogs_url: v.discogs_url, youtube_url: v.youtube_url,
      note_en: v.note_en, note_es: v.note_es,
      from_snapshot: !!v.from_snapshot,
    })),
  }

  return NextResponse.json({
    owner: {
      id: owner.id,
      username: owner.username,
      display_name: owner.display_name,
      avatar_url: owner.avatar_url,
      country: owner.country,
    },
    saved,
    tracks,
  })
}

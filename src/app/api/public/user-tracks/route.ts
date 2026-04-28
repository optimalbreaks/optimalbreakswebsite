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

type ChartRow = { id: string; chart_edition_id: string | null; title: string; mix_name: string | null; artists: unknown; label: string | null; release_year: number | null; bpm: number | null; music_key: string | null; artwork_url: string | null; beatport_url: string | null; sample_url: string | null }
type FeatRow = { id: string; chart_edition_id: string | null; title: string; mix_name: string | null; artists: unknown; label: string | null; release_year: number | null; bpm: number | null; music_key: string | null; artwork_url: string | null; link_url: string | null; link_label: string | null; platform: string | null; sample_url: string | null; note_en: string | null; note_es: string | null }
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

  const { data: savedData, error: savedErr } = await sb
    .from('saved_chart_tracks')
    .select('track_source, track_id, canonical_url, snapshot, created_at')
    .eq('user_id', owner.id)
    .order('created_at', { ascending: false })
  if (savedErr) return NextResponse.json({ error: savedErr.message }, { status: 500 })

  const saved = ((savedData as unknown) as SavedRow[]) || []

  const chartIds = Array.from(new Set(saved.filter((s) => s.track_source === 'chart').map((s) => s.track_id)))
  const featIds = Array.from(new Set(saved.filter((s) => s.track_source === 'featured').map((s) => s.track_id)))
  const vinylIds = Array.from(new Set(saved.filter((s) => s.track_source === 'vinyl').map((s) => s.track_id)))

  const [chartRes, featRes, vinylRes] = await Promise.all([
    chartIds.length
      ? sb.from('chart_tracks').select('id, chart_edition_id, title, mix_name, artists, label, release_year, bpm, music_key, artwork_url, beatport_url, sample_url').in('id', chartIds)
      : Promise.resolve({ data: [] as ChartRow[], error: null }),
    featIds.length
      ? sb.from('chart_featured_tracks').select('id, chart_edition_id, title, mix_name, artists, label, release_year, bpm, music_key, artwork_url, link_url, link_label, platform, sample_url, note_en, note_es').in('id', featIds)
      : Promise.resolve({ data: [] as FeatRow[], error: null }),
    vinylIds.length
      ? sb.from('chart_vinyl_tracks').select('id, title, mix_name, artists, label, year, artwork_url, discogs_url, youtube_url, note_en, note_es').in('id', vinylIds)
      : Promise.resolve({ data: [] as VinylRow[], error: null }),
  ])

  // Auto-rebind por `canonical_url`: si una save tiene URL canónica pero el
  // `track_id` ya no devuelve fila viva (porque un upsert pasado regeneró
  // UUIDs), buscamos la fila por URL y arreglamos el track_id en BD para que
  // futuras peticiones sean directas. Sólo se ejecuta para huérfanos con URL.
  const liveChartIds = new Set(((chartRes.data || []) as ChartRow[]).map((r) => r.id))
  const liveFeatIds = new Set(((featRes.data || []) as FeatRow[]).map((r) => r.id))
  const liveVinylIds = new Set(((vinylRes.data || []) as VinylRow[]).map((r) => r.id))

  const orphChart = saved.filter((s) => s.track_source === 'chart' && !liveChartIds.has(s.track_id) && !!s.canonical_url)
  const orphFeat = saved.filter((s) => s.track_source === 'featured' && !liveFeatIds.has(s.track_id) && !!s.canonical_url)
  const orphVinyl = saved.filter((s) => s.track_source === 'vinyl' && !liveVinylIds.has(s.track_id) && !!s.canonical_url)

  if (orphChart.length || orphFeat.length || orphVinyl.length) {
    const collect = async <T extends { id: string }>(table: string, columns: string, urlCol: string, urls: string[]) => {
      if (!urls.length) return [] as T[]
      const { data } = await sb.from(table).select(columns).in(urlCol, urls)
      return ((data as unknown) as T[]) || []
    }
    const [extraChart, extraFeat, extraVinyl] = await Promise.all([
      collect<ChartRow>('chart_tracks', 'id, chart_edition_id, title, mix_name, artists, label, release_year, bpm, music_key, artwork_url, beatport_url, sample_url', 'beatport_url', orphChart.map((o) => o.canonical_url as string)),
      collect<FeatRow>('chart_featured_tracks', 'id, chart_edition_id, title, mix_name, artists, label, release_year, bpm, music_key, artwork_url, link_url, link_label, platform, sample_url, note_en, note_es', 'link_url', orphFeat.map((o) => o.canonical_url as string)),
      collect<VinylRow>('chart_vinyl_tracks', 'id, title, mix_name, artists, label, year, artwork_url, discogs_url, youtube_url, note_en, note_es', 'discogs_url', orphVinyl.map((o) => o.canonical_url as string)),
    ])

    const indexBy = <T extends { id: string }>(rows: T[], pick: (r: T) => string | null | undefined) => {
      const m = new Map<string, T>()
      for (const r of rows) {
        const k = normalizeUrlKey(pick(r))
        if (k) m.set(k, r)
      }
      return m
    }
    const chartIdx = indexBy<ChartRow>(extraChart, (r) => r.beatport_url)
    const featIdx = indexBy<FeatRow>(extraFeat, (r) => r.link_url)
    const vinylIdx = indexBy<VinylRow>(extraVinyl, (r) => r.discogs_url)

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
      ;(chartRes.data as unknown as ChartRow[]).push(...extraChart.filter((r) => !liveChartIds.has(r.id)))
      ;(featRes.data as unknown as FeatRow[]).push(...extraFeat.filter((r) => !liveFeatIds.has(r.id)))
      ;(vinylRes.data as unknown as VinylRow[]).push(...extraVinyl.filter((r) => !liveVinylIds.has(r.id)))
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
    ? await sb.from('chart_editions').select('id, week_date').in('id', editionIds)
    : { data: [] as EditionRow[], error: null }
  const weekByEdition = new Map<string, string>()
  for (const e of ((editionRes.data || []) as EditionRow[])) weekByEdition.set(e.id, e.week_date)

  const tracks = {
    chart: ((chartRes.data || []) as ChartRow[]).map((c) => ({
      id: c.id, title: c.title, mix_name: c.mix_name, artists: artistsToString(c.artists),
      label: c.label, year: c.release_year, bpm: c.bpm, music_key: c.music_key,
      artwork_url: c.artwork_url, beatport_url: c.beatport_url, sample_url: c.sample_url,
      week_date: c.chart_edition_id ? weekByEdition.get(c.chart_edition_id) || null : null,
    })),
    featured: ((featRes.data || []) as FeatRow[]).map((f) => ({
      id: f.id, title: f.title, mix_name: f.mix_name, artists: artistsToString(f.artists),
      label: f.label, year: f.release_year, bpm: f.bpm, music_key: f.music_key,
      artwork_url: f.artwork_url, link_url: f.link_url, link_label: f.link_label,
      platform: f.platform, sample_url: f.sample_url, note_en: f.note_en, note_es: f.note_es,
      week_date: f.chart_edition_id ? weekByEdition.get(f.chart_edition_id) || null : null,
    })),
    vinyl: ((vinylRes.data || []) as VinylRow[]).map((v) => ({
      id: v.id, title: v.title, mix_name: v.mix_name, artists: artistsToString(v.artists),
      label: v.label, year: v.year,
      artwork_url: v.artwork_url, discogs_url: v.discogs_url, youtube_url: v.youtube_url,
      note_en: v.note_en, note_es: v.note_es,
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

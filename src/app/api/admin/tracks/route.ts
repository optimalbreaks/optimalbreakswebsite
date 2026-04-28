// ============================================
// OPTIMAL BREAKS — Admin Tracks Stats
// Agrega datos de `saved_chart_tracks` cruzando con las tablas origen
// (chart_tracks, chart_featured_tracks, chart_vinyl_tracks) y devuelve
// rankings de lo que los usuarios están guardando en "Mis Tracks".
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
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

type ChartRow = { id: string; title: string; mix_name: string | null; artists: unknown; label: string | null; release_year: number | null; release_date: string | null; artwork_url: string | null; beatport_url: string | null; sample_url: string | null }
type FeatRow = { id: string; title: string; mix_name: string | null; artists: unknown; label: string | null; release_year: number | null; release_date: string | null; artwork_url: string | null; link_url: string | null; platform: string | null; sample_url: string | null }
type VinylRow = { id: string; title: string; mix_name: string | null; artists: unknown; label: string | null; year: number | null; artwork_url: string | null; discogs_url: string | null; youtube_url: string | null }

function artistsToString(a: unknown): string {
  if (!Array.isArray(a)) return ''
  return a.map((x) => (x && typeof x === 'object' ? (x as { name?: string }).name : x)).filter(Boolean).join(', ')
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

interface Aggregate {
  canonical_key: string
  title: string
  mix_name: string | null
  artists: string
  label: string | null
  year: number | null
  release_date: string | null
  artwork_url: string | null
  external_url: string | null
  playback_kind: PlaybackKind
  save_count: number
  unique_users: number
  first_saved_at: string | null
  last_saved_at: string | null
  sources: ChartTrackSource[]
  primary: { source: ChartTrackSource; id: string }
  _users: Set<string>
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const limit = Math.min(100, Math.max(5, Number(url.searchParams.get('limit')) || 25))

  let sb: ReturnType<typeof createServiceSupabase>
  try {
    sb = createServiceSupabase()
  } catch {
    return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 })
  }

  const { data: savedData, error: savedErr } = await sb
    .from('saved_chart_tracks')
    .select('user_id, track_source, track_id, canonical_url, snapshot, created_at')
  if (savedErr) return NextResponse.json({ error: savedErr.message }, { status: 500 })

  const saved = ((savedData as unknown) as SavedRow[]) || []

  if (saved.length === 0) {
    return NextResponse.json({
      totals: { saves: 0, unique_tracks: 0, unique_users: 0, by_kind: { beatport: 0, bandcamp: 0, youtube: 0 } },
      top_tracks: [],
      top_labels: [],
      top_artists: [],
    })
  }

  const chartIds = Array.from(new Set(saved.filter((s) => s.track_source === 'chart').map((s) => s.track_id)))
  const featIds = Array.from(new Set(saved.filter((s) => s.track_source === 'featured').map((s) => s.track_id)))
  const vinylIds = Array.from(new Set(saved.filter((s) => s.track_source === 'vinyl').map((s) => s.track_id)))

  const [chartRes, featRes, vinylRes] = await Promise.all([
    chartIds.length
      ? sb.from('chart_tracks').select('id, title, mix_name, artists, label, release_year, release_date, artwork_url, beatport_url, sample_url').in('id', chartIds)
      : Promise.resolve({ data: [] as ChartRow[], error: null }),
    featIds.length
      ? sb.from('chart_featured_tracks').select('id, title, mix_name, artists, label, release_year, release_date, artwork_url, link_url, platform, sample_url').in('id', featIds)
      : Promise.resolve({ data: [] as FeatRow[], error: null }),
    vinylIds.length
      ? sb.from('chart_vinyl_tracks').select('id, title, mix_name, artists, label, year, artwork_url, discogs_url, youtube_url').in('id', vinylIds)
      : Promise.resolve({ data: [] as VinylRow[], error: null }),
  ])

  const byRefKey = new Map<string, { title: string; mix_name: string | null; artists: string; label: string | null; year: number | null; release_date: string | null; artwork_url: string | null; external_url: string | null; playback_kind: PlaybackKind; canonical_key: string; source: ChartTrackSource; id: string }>()

  for (const c of ((chartRes.data || []) as ChartRow[])) {
    const canonical_key = normalizeUrl(c.beatport_url) || `t:chart:${c.id}`
    byRefKey.set(`chart:${c.id}`, {
      title: c.title, mix_name: c.mix_name, artists: artistsToString(c.artists), label: c.label, year: c.release_year, release_date: c.release_date,
      artwork_url: c.artwork_url, external_url: c.beatport_url, playback_kind: 'beatport',
      canonical_key, source: 'chart', id: c.id,
    })
  }
  for (const f of ((featRes.data || []) as FeatRow[])) {
    const kind: PlaybackKind = f.platform === 'bandcamp' ? 'bandcamp' : 'beatport'
    const canonical_key = normalizeUrl(f.link_url) || `t:featured:${f.id}`
    byRefKey.set(`featured:${f.id}`, {
      title: f.title, mix_name: f.mix_name, artists: artistsToString(f.artists), label: f.label, year: f.release_year, release_date: f.release_date,
      artwork_url: f.artwork_url, external_url: f.link_url, playback_kind: kind,
      canonical_key, source: 'featured', id: f.id,
    })
  }
  for (const v of ((vinylRes.data || []) as VinylRow[])) {
    const canonical_key = normalizeUrl(v.youtube_url) || `t:vinyl:${v.id}`
    byRefKey.set(`vinyl:${v.id}`, {
      title: v.title, mix_name: v.mix_name, artists: artistsToString(v.artists), label: v.label, year: v.year, release_date: null,
      artwork_url: v.artwork_url, external_url: v.discogs_url || v.youtube_url, playback_kind: 'youtube',
      canonical_key, source: 'vinyl', id: v.id,
    })
  }

  // Beatport Top 10: no tiene fila propia. Usamos el snapshot embebido.
  for (const s of saved) {
    if (s.track_source !== 'beatport_top') continue
    const snap = (s.snapshot || {}) as Record<string, unknown>
    const title = String(snap.title || '')
    const mix_name = (snap.mix_name as string | null) ?? null
    const artists = String(snap.artists || '')
    const label = (snap.label as string | null) ?? null
    const year = (typeof snap.year === 'number' ? (snap.year as number) : null)
    const release_date_raw = typeof snap.release_date === 'string' ? snap.release_date.trim().slice(0, 10) : ''
    const release_date = /^\d{4}-\d{2}-\d{2}$/.test(release_date_raw) ? release_date_raw : null
    const artwork_url = (snap.artwork_url as string | null) ?? null
    const beatport_url = (snap.beatport_url as string | null) || s.canonical_url
    const canonical_key = normalizeUrl(beatport_url) || `t:beatport_top:${s.track_id}`
    byRefKey.set(`beatport_top:${s.track_id}`, {
      title, mix_name, artists, label, year, release_date,
      artwork_url, external_url: beatport_url, playback_kind: 'beatport',
      canonical_key, source: 'beatport_top', id: s.track_id,
    })
  }

  // Agregar por clave canónica (une mismas canciones en distintas fuentes).
  const aggByKey = new Map<string, Aggregate>()

  for (const s of saved) {
    const meta = byRefKey.get(`${s.track_source}:${s.track_id}`)
    if (!meta) continue
    const key = meta.canonical_key
    const existing = aggByKey.get(key)
    const created = s.created_at || null
    if (!existing) {
      aggByKey.set(key, {
        canonical_key: key,
        title: meta.title,
        mix_name: meta.mix_name,
        artists: meta.artists,
        label: meta.label,
        year: meta.year,
        release_date: meta.release_date,
        artwork_url: meta.artwork_url,
        external_url: meta.external_url,
        playback_kind: meta.playback_kind,
        save_count: 1,
        unique_users: 0,
        first_saved_at: created,
        last_saved_at: created,
        sources: [meta.source],
        primary: { source: meta.source, id: meta.id },
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
      // Enriquece metadata faltante.
      if (!existing.mix_name && meta.mix_name) existing.mix_name = meta.mix_name
      if (!existing.label && meta.label) existing.label = meta.label
      if (!existing.artwork_url && meta.artwork_url) existing.artwork_url = meta.artwork_url
      if (!existing.external_url && meta.external_url) existing.external_url = meta.external_url
      if (!existing.year && meta.year) existing.year = meta.year
      const isValidRd = (v: string | null) => !!(v && /^\d{4}-\d{2}-\d{2}$/.test(v))
      if (!isValidRd(existing.release_date) && isValidRd(meta.release_date)) existing.release_date = meta.release_date
      // Preferimos un playback reproducible en segundo plano como "primario":
      // si tenemos un chart/featured con beatport/bandcamp, gana frente a youtube.
      if (existing.playback_kind === 'youtube' && meta.playback_kind !== 'youtube') {
        existing.playback_kind = meta.playback_kind
        existing.primary = { source: meta.source, id: meta.id }
      }
    }
  }

  // Consolida unique_users.
  const aggregates = Array.from(aggByKey.values())
  aggregates.forEach((a) => { a.unique_users = a._users.size })
  aggregates.sort((a, b) => b.save_count - a.save_count || (a.title || '').localeCompare(b.title || ''))

  const top_tracks = aggregates.slice(0, limit).map((a) => ({
    canonical_key: a.canonical_key,
    title: a.title,
    mix_name: a.mix_name,
    artists: a.artists,
    label: a.label,
    year: a.year,
    release_date: a.release_date,
    artwork_url: a.artwork_url,
    external_url: a.external_url,
    playback_kind: a.playback_kind,
    save_count: a.save_count,
    unique_users: a.unique_users,
    first_saved_at: a.first_saved_at,
    last_saved_at: a.last_saved_at,
    sources: a.sources,
    primary: a.primary,
  }))

  const by_kind = { beatport: 0, bandcamp: 0, youtube: 0 }
  const labelSaves = new Map<string, number>()
  const artistSaves = new Map<string, number>()
  for (const a of aggregates) {
    by_kind[a.playback_kind] += a.save_count
    if (a.label) labelSaves.set(a.label, (labelSaves.get(a.label) || 0) + a.save_count)
    if (a.artists) {
      for (const name of a.artists.split(/,\s*/).filter(Boolean)) {
        artistSaves.set(name, (artistSaves.get(name) || 0) + a.save_count)
      }
    }
  }

  const top_labels = Array.from(labelSaves.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15)
    .map(([name, save_count]) => ({ name, save_count }))
  const top_artists = Array.from(artistSaves.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15)
    .map(([name, save_count]) => ({ name, save_count }))

  const totals = {
    saves: saved.length,
    unique_tracks: aggregates.length,
    unique_users: new Set(saved.map((s) => s.user_id)).size,
    by_kind,
  }

  return NextResponse.json({ totals, top_tracks, top_labels, top_artists })
}

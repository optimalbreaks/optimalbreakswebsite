// ============================================
// OPTIMAL BREAKS — Public user-tracks endpoint
// Devuelve la lista "Mis Tracks" de otro usuario para compartirla
// públicamente. Bypassa RLS vía service-role porque saved_chart_tracks
// solo permite leer los propios.
// Acepta ?handle=<uuid-o-username>.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase-admin'

type ChartTrackSource = 'chart' | 'featured' | 'vinyl'

type SavedRow = {
  track_source: ChartTrackSource
  track_id: string
  created_at: string | null
}

type ProfileMini = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  country: string | null
}

type ChartRow = { id: string; title: string; mix_name: string | null; artists: unknown; label: string | null; release_year: number | null; bpm: number | null; music_key: string | null; artwork_url: string | null; beatport_url: string | null; sample_url: string | null }
type FeatRow = { id: string; title: string; mix_name: string | null; artists: unknown; label: string | null; release_year: number | null; bpm: number | null; music_key: string | null; artwork_url: string | null; link_url: string | null; link_label: string | null; platform: string | null; sample_url: string | null; note_en: string | null; note_es: string | null }
type VinylRow = { id: string; title: string; mix_name: string | null; artists: unknown; label: string | null; year: number | null; artwork_url: string | null; discogs_url: string | null; youtube_url: string | null; note_en: string | null; note_es: string | null }

function artistsToString(a: unknown): string {
  if (!Array.isArray(a)) return ''
  return a.map((x) => (x && typeof x === 'object' ? (x as { name?: string }).name : x)).filter(Boolean).join(', ')
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
    .select('track_source, track_id, created_at')
    .eq('user_id', owner.id)
    .order('created_at', { ascending: false })
  if (savedErr) return NextResponse.json({ error: savedErr.message }, { status: 500 })

  const saved = ((savedData as unknown) as SavedRow[]) || []

  const chartIds = Array.from(new Set(saved.filter((s) => s.track_source === 'chart').map((s) => s.track_id)))
  const featIds = Array.from(new Set(saved.filter((s) => s.track_source === 'featured').map((s) => s.track_id)))
  const vinylIds = Array.from(new Set(saved.filter((s) => s.track_source === 'vinyl').map((s) => s.track_id)))

  const [chartRes, featRes, vinylRes] = await Promise.all([
    chartIds.length
      ? sb.from('chart_tracks').select('id, title, mix_name, artists, label, release_year, bpm, music_key, artwork_url, beatport_url, sample_url').in('id', chartIds)
      : Promise.resolve({ data: [] as ChartRow[], error: null }),
    featIds.length
      ? sb.from('chart_featured_tracks').select('id, title, mix_name, artists, label, release_year, bpm, music_key, artwork_url, link_url, link_label, platform, sample_url, note_en, note_es').in('id', featIds)
      : Promise.resolve({ data: [] as FeatRow[], error: null }),
    vinylIds.length
      ? sb.from('chart_vinyl_tracks').select('id, title, mix_name, artists, label, year, artwork_url, discogs_url, youtube_url, note_en, note_es').in('id', vinylIds)
      : Promise.resolve({ data: [] as VinylRow[], error: null }),
  ])

  const tracks = {
    chart: ((chartRes.data || []) as ChartRow[]).map((c) => ({
      id: c.id, title: c.title, mix_name: c.mix_name, artists: artistsToString(c.artists),
      label: c.label, year: c.release_year, bpm: c.bpm, music_key: c.music_key,
      artwork_url: c.artwork_url, beatport_url: c.beatport_url, sample_url: c.sample_url,
    })),
    featured: ((featRes.data || []) as FeatRow[]).map((f) => ({
      id: f.id, title: f.title, mix_name: f.mix_name, artists: artistsToString(f.artists),
      label: f.label, year: f.release_year, bpm: f.bpm, music_key: f.music_key,
      artwork_url: f.artwork_url, link_url: f.link_url, link_label: f.link_label,
      platform: f.platform, sample_url: f.sample_url, note_en: f.note_en, note_es: f.note_es,
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
